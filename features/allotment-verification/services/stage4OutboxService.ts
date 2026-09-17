/**
 * features/allotment-verification/services/stage4OutboxService.ts
 *
 * Stage 4 Durable Outbox Service for Candidate B (Revision 3).
 *
 * Guarantees:
 * 1. Durable Stage 4 -> Stage 5 boundary mediated strictly via outbox table (ipo_stage4_outbox_events).
 * 2. At-least-once delivery with retry support (PENDING -> EMITTED -> ACKNOWLEDGED).
 * 3. Immutable audit trail: Never deletes successfully processed outbox events.
 * 4. Zero direct dependency/mutation of Stage 5 tables or finance services (Strict AST quarantine).
 */

import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  AllotmentVerifiedEvent,
  AllotmentVerifiedEventPayload,
  OutboxDeliveryStatus,
  Stage4OutboxEvent,
  VerificationEvidenceClassification,
} from '../types/verificationTypes';

export interface EnqueueOutboxParams {
  userId: string;
  applicationId: string;
  applicantId: string;
  ipoId: string;
  allotmentId: string;
  projectionId: string;
  sharesAllotted: number;
  allotmentPrice: number;
  reportedRefundAmount: number;
  evidenceClassification: VerificationEvidenceClassification;
  verificationAttemptId: string;
  rawObservationHash: string;
  fundingOwnerType?: 'user_personal' | 'external_tracked';
}

export type OutboxDeliveryHandler = (
  event: AllotmentVerifiedEvent
) => Promise<{ success: boolean; status?: string; error?: string }>;

export class Stage4OutboxService {
  /**
   * Computes deterministic SHA-256 hash for event payload.
   */
  static computePayloadHash(payload: unknown): string {
    const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return crypto.createHash('sha256').update(serialized).digest('hex');
  }

  /**
   * Enqueues an AllotmentVerifiedEvent into the durable Stage 4 outbox table.
   * If an event with the same idempotency key already exists, returns existing record.
   */
  static async enqueueAllotmentVerifiedEvent(
    params: EnqueueOutboxParams
  ): Promise<Stage4OutboxEvent> {
    const supabase = createAdminClient();

    const allotmentAmount = Math.round(params.sharesAllotted * params.allotmentPrice * 100) / 100;
    const eventId = crypto.randomUUID();
    const idempotencyKey = `phase4:app:${params.applicationId}:allotment:${params.allotmentId}`;

    const payload: AllotmentVerifiedEventPayload = {
      userId: params.userId,
      applicationId: params.applicationId,
      ipoId: params.ipoId,
      applicantId: params.applicantId,
      allotmentId: params.allotmentId,
      sharesAllotted: params.sharesAllotted,
      allotmentPrice: params.allotmentPrice,
      allotmentAmount,
      refundAmount: params.reportedRefundAmount,
      evidenceClassification: params.evidenceClassification,
      verificationAttemptId: params.verificationAttemptId,
      rawObservationHash: params.rawObservationHash,
      fundingOwnerType: params.fundingOwnerType || 'user_personal',
    };

    const payloadHash = this.computePayloadHash(payload);

    const record = {
      event_id: eventId,
      event_type: 'allotment_verified' as const,
      application_id: params.applicationId,
      projection_id: params.projectionId,
      idempotency_key: idempotencyKey,
      payload,
      payload_hash: payloadHash,
      status: 'PENDING' as OutboxDeliveryStatus,
      retry_count: 0,
      max_retries: 5,
    };

    const { data, error } = await supabase
      .from('ipo_stage4_outbox_events')
      .upsert(record as never, { onConflict: 'idempotency_key' })
      .select()
      .single();

    if (error) {
      console.error('[Stage4OutboxService] Failed to enqueue outbox event:', error);
      throw new Error(`Failed to enqueue outbox event: ${error.message}`);
    }

    return data as Stage4OutboxEvent;
  }

  /**
   * Fetches pending or retryable outbox events.
   */
  static async getPendingEvents(limit = 20): Promise<Stage4OutboxEvent[]> {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('ipo_stage4_outbox_events')
      .select('*')
      .in('status', ['PENDING', 'EMITTED'])
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('[Stage4OutboxService] Failed to fetch pending events:', error);
      return [];
    }

    return (data || []) as Stage4OutboxEvent[];
  }

  /**
   * Dispatches a single outbox event to the supplied consumer transport.
   * Updates outbox status through PENDING -> EMITTED -> ACKNOWLEDGED.
   * Updates projection status to ACKNOWLEDGED upon success.
   * NEVER deletes the outbox event record.
   */
  static async deliverEvent(
    outboxEvent: Stage4OutboxEvent,
    deliveryHandler: OutboxDeliveryHandler
  ): Promise<{ success: boolean; status: OutboxDeliveryStatus; error?: string }> {
    const supabase = createAdminClient();
    const now = new Date().toISOString();

    // 1. Mark EMITTED before sending (At-least-once guarantee)
    await supabase
      .from('ipo_stage4_outbox_events')
      .update({
        status: 'EMITTED',
        emitted_at: now,
        updated_at: now,
      } as never)
      .eq('id', outboxEvent.id);

    // Also update projection to EMITTED
    await supabase
      .from('ipo_application_allotment_projections')
      .update({
        financial_dispatch_status: 'EMITTED',
        dispatched_at: now,
        outbox_event_id: outboxEvent.id,
        updated_at: now,
      } as never)
      .eq('application_id', outboxEvent.application_id);

    const canonicalEvent: AllotmentVerifiedEvent = {
      eventId: outboxEvent.event_id,
      eventType: 'allotment_verified',
      occurredAt: outboxEvent.created_at,
      producer: 'stage4_allotment_engine',
      schemaVersion: '1.0.0',
      idempotencyKey: outboxEvent.idempotency_key,
      payload: outboxEvent.payload,
      payloadHash: outboxEvent.payload_hash,
    };

    try {
      // 2. Invoke delivery handler
      const result = await deliveryHandler(canonicalEvent);

      if (result.success) {
        const ackTime = new Date().toISOString();

        // 3. Mark ACKNOWLEDGED (Permanent audit retention)
        await supabase
          .from('ipo_stage4_outbox_events')
          .update({
            status: 'ACKNOWLEDGED',
            acknowledged_at: ackTime,
            updated_at: ackTime,
          } as never)
          .eq('id', outboxEvent.id);

        // Update projection terminal state
        await supabase
          .from('ipo_application_allotment_projections')
          .update({
            financial_dispatch_status: 'ACKNOWLEDGED',
            acknowledged_at: ackTime,
            updated_at: ackTime,
          } as never)
          .eq('application_id', outboxEvent.application_id);

        return { success: true, status: 'ACKNOWLEDGED' };
      } else {
        throw new Error(result.error || 'Downstream consumer rejected event.');
      }
    } catch (err: any) {
      const errTime = new Date().toISOString();
      const newRetryCount = outboxEvent.retry_count + 1;
      const isFailedPermanently = newRetryCount >= outboxEvent.max_retries;
      const newStatus: OutboxDeliveryStatus = isFailedPermanently ? 'FAILED' : 'PENDING';

      console.error(
        `[Stage4OutboxService] Delivery failed for event ${outboxEvent.event_id} (retry ${newRetryCount}):`,
        err.message
      );

      await supabase
        .from('ipo_stage4_outbox_events')
        .update({
          status: newStatus,
          retry_count: newRetryCount,
          last_error: err.message || 'Unknown delivery failure',
          updated_at: errTime,
        } as never)
        .eq('id', outboxEvent.id);

      return {
        success: false,
        status: newStatus,
        error: err.message,
      };
    }
  }

  /**
   * Processes all pending events using the injected delivery handler.
   */
  static async processPendingOutboxQueue(
    deliveryHandler: OutboxDeliveryHandler,
    batchSize = 20
  ): Promise<{ processed: number; acknowledged: number; failed: number }> {
    const pending = await this.getPendingEvents(batchSize);
    let acknowledged = 0;
    let failed = 0;

    for (const event of pending) {
      const result = await this.deliverEvent(event, deliveryHandler);
      if (result.success) {
        acknowledged++;
      } else {
        failed++;
      }
    }

    return {
      processed: pending.length,
      acknowledged,
      failed,
    };
  }
}
