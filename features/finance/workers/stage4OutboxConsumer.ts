/**
 * features/finance/workers/stage4OutboxConsumer.ts
 *
 * Candidate C: Decoupled Stage 5 Outbox Consumer.
 * Reads pending AllotmentVerifiedEvents from the Stage 4 outbox table and delivers
 * them to SettlementService for authoritative financial settlement and Demat crediting.
 *
 * Preserves the strict architectural quarantine:
 * - 0 imports from @/features/allotment-verification/services
 * - 0 imports from @/features/allotment-verification/adapters
 * - Interacts purely via the database outbox contract and generic event interface
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { SettlementService } from '@/features/finance/services/settlementService';
import { AllotmentVerifiedEvent } from '@/features/finance/types/settlementTypes';

export class Stage4OutboxConsumer {
  /**
   * Reads pending events directly from ipo_stage4_outbox_events.
   * Delivers to SettlementService and acknowledges the outbox upon completion.
   */
  static async processPendingQueue(batchSize = 20): Promise<{
    processed: number;
    acknowledged: number;
    failed: number;
  }> {
    const supabase = createAdminClient();

    // 1. Fetch pending or emitted events awaiting processing
    const { data: pendingEvents, error: fetchErr } = await supabase
      .from('ipo_stage4_outbox_events')
      .select('*')
      .in('status', ['PENDING', 'EMITTED'])
      .order('created_at', { ascending: true })
      .limit(batchSize);

    if (fetchErr || !pendingEvents) {
      console.error('[Stage4OutboxConsumer] Failed to fetch outbox events:', fetchErr);
      return { processed: 0, acknowledged: 0, failed: 0 };
    }

    let processedCount = 0;
    let acknowledgedCount = 0;
    let failedCount = 0;

    for (const record of pendingEvents) {
      processedCount++;

      // 2. Mark event as EMITTED in outbox if currently PENDING
      if (record.status === 'PENDING') {
        await supabase
          .from('ipo_stage4_outbox_events')
          .update({
            status: 'EMITTED',
            emitted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as never)
          .eq('id', record.id);
      }

      // 3. Construct canonical decimal-safe AllotmentVerifiedEvent
      const rawPayload = record.payload as Record<string, any>;
      const canonicalEvent: AllotmentVerifiedEvent = {
        eventId: record.event_id,
        eventType: 'allotment_verified',
        occurredAt: record.created_at,
        producer: 'stage4_allotment_engine',
        schemaVersion: '1.0.0',
        idempotencyKey: record.idempotency_key,
        payload: {
          userId: rawPayload.userId,
          applicationId: rawPayload.applicationId,
          ipoId: rawPayload.ipoId,
          applicantId: rawPayload.applicantId || null,
          allotmentId: rawPayload.allotmentId,
          sharesAllotted: String(rawPayload.sharesAllotted),
          allotmentPrice: String(rawPayload.allotmentPrice),
          allotmentAmount: String(rawPayload.allotmentAmount || Number(rawPayload.sharesAllotted) * Number(rawPayload.allotmentPrice)),
          refundAmount: String(rawPayload.refundAmount || 0),
          evidenceClassification: rawPayload.evidenceClassification,
          verificationAttemptId: rawPayload.verificationAttemptId,
          rawObservationHash: rawPayload.rawObservationHash,
          fundingOwnerType: rawPayload.fundingOwnerType || 'user_personal',
        },
        payloadHash: record.payload_hash,
      };

      try {
        // 4. Deliver to Candidate C SettlementService
        const result = await SettlementService.processAllotmentEvent(canonicalEvent);

        if (result.success) {
          // 5. Transition outbox event to terminal ACKNOWLEDGED state (permanent retention)
          await supabase
            .from('ipo_stage4_outbox_events')
            .update({
              status: 'ACKNOWLEDGED',
              acknowledged_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } as never)
            .eq('id', record.id);

          acknowledgedCount++;
        } else {
          failedCount++;
          await supabase
            .from('ipo_stage4_outbox_events')
            .update({
              retry_count: (record.retry_count || 0) + 1,
              last_error: result.errorMessage || result.errorCode || 'Settlement failed',
              updated_at: new Date().toISOString(),
            } as never)
            .eq('id', record.id);
        }
      } catch (err: any) {
        failedCount++;
        console.error(`[Stage4OutboxConsumer] Error processing outbox event ${record.id}:`, err);
        await supabase
          .from('ipo_stage4_outbox_events')
          .update({
            retry_count: (record.retry_count || 0) + 1,
            last_error: err.message || 'Unhandled worker error',
            updated_at: new Date().toISOString(),
          } as never)
          .eq('id', record.id);
      }
    }

    return {
      processed: processedCount,
      acknowledged: acknowledgedCount,
      failed: failedCount,
    };
  }
}
