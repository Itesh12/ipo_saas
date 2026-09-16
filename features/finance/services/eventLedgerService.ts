/**
 * features/finance/services/eventLedgerService.ts
 *
 * Phase 10 / Stage 5A: Authoritative Financial Event Ledger Service.
 *
 * Enforces production-grade event handling and concurrency guardrails:
 * 1. Dual-key idempotency:
 *    - event_id: unique event delivery instance identity
 *    - idempotency_key: unique business operation identity
 * 2. Distributed lease claim & crash recovery:
 *    - Atomically claims event with a 5-minute lease (processing_lease_expires_at)
 *    - Stale leases (> 5 min old) from crashed workers are reclaimed automatically
 * 3. Decoupled 3-phase execution:
 *    - Tx1: Claim lease (RECEIVED / PROCESSING)
 *    - Tx2: Financial transaction (isolated execution & independent rollback)
 *    - Tx3: Persist terminal outcome (PROCESSED or FAILED) in separate transaction
 */

import { createAdminClient } from '@/lib/supabase/admin';
import {
  DomainEventProcessingStatus,
  ProcessedDomainEventRecord,
} from '@/features/application/types/domainEventTypes';

export type ClaimResult =
  | { status: 'CLAIMED'; record: ProcessedDomainEventRecord }
  | { status: 'ALREADY_PROCESSED'; record: ProcessedDomainEventRecord }
  | { status: 'LOCKED_BY_OTHER'; ownerId: string | null; expiresAt: string | null }
  | { status: 'FAILED_TO_CLAIM'; reason: string };

export class EventLedgerService {
  /**
   * Default lease duration: 5 minutes (300,000 ms).
   * A worker holding PROCESSING for > 5 minutes is considered crashed/stale.
   */
  public static readonly DEFAULT_LEASE_MS = 5 * 60 * 1000;

  /**
   * Atomically claims an event lease for processing.
   * Protects against concurrent worker execution and guarantees crash recovery.
   */
  public static async claimEventLease(params: {
    eventId: string;
    idempotencyKey: string;
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    ownerId?: string;
    leaseDurationMs?: number;
  }): Promise<ClaimResult> {
    const {
      eventId,
      idempotencyKey,
      eventType,
      aggregateType,
      aggregateId,
      ownerId = `worker_${process.pid || 'node'}_${Math.random().toString(36).slice(2, 8)}`,
      leaseDurationMs = EventLedgerService.DEFAULT_LEASE_MS,
    } = params;

    const admin = createAdminClient();
    const now = new Date();
    const nowIso = now.toISOString();
    const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs).toISOString();

    // 1. Check if record already exists by eventId or idempotencyKey
    const { data: existingRecords, error: fetchErr } = await admin
      .from('processed_domain_events')
      .select('*')
      .or(`event_id.eq.${eventId},idempotency_key.eq.${idempotencyKey}`);

    if (fetchErr) {
      return { status: 'FAILED_TO_CLAIM', reason: fetchErr.message };
    }

    const existing = existingRecords && existingRecords.length > 0 ? existingRecords[0] : null;

    if (existing) {
      // If already PROCESSED: Return immediately, business operation was finalized
      if (existing.processing_status === 'PROCESSED') {
        return {
          status: 'ALREADY_PROCESSED',
          record: existing as ProcessedDomainEventRecord,
        };
      }

      // If PROCESSING: Check if lease is active or expired
      if (existing.processing_status === 'PROCESSING') {
        const isLeaseActive =
          existing.processing_lease_expires_at &&
          new Date(existing.processing_lease_expires_at).getTime() > now.getTime();

        if (isLeaseActive && existing.processing_owner_id !== ownerId) {
          return {
            status: 'LOCKED_BY_OTHER',
            ownerId: existing.processing_owner_id,
            expiresAt: existing.processing_lease_expires_at,
          };
        }
      }

      // Either in RECEIVED, FAILED, or stale PROCESSING (> 5 min lease expired) -> Attempt atomic claim
      const { data: claimedRow, error: claimErr } = await admin
        .from('processed_domain_events')
        .update({
          processing_status: 'PROCESSING',
          processing_owner_id: ownerId,
          processing_lease_expires_at: leaseExpiresAt,
          last_attempt_at: nowIso,
          attempt_count: (existing.attempt_count || 0) + 1,
        })
        .eq('id', existing.id)
        .or(
          `processing_status.in.(RECEIVED,FAILED),and(processing_status.eq.PROCESSING,processing_lease_expires_at.lt.${nowIso})`
        )
        .select('*')
        .maybeSingle();

      if (claimErr) {
        return { status: 'FAILED_TO_CLAIM', reason: claimErr.message };
      }

      if (claimedRow) {
        return {
          status: 'CLAIMED',
          record: claimedRow as ProcessedDomainEventRecord,
        };
      }

      // If zero rows returned, another worker won the concurrent claim race
      const { data: currentCheck } = await admin
        .from('processed_domain_events')
        .select('*')
        .eq('id', existing.id)
        .single();

      if (currentCheck && currentCheck.processing_status === 'PROCESSED') {
        return {
          status: 'ALREADY_PROCESSED',
          record: currentCheck as ProcessedDomainEventRecord,
        };
      }

      return {
        status: 'LOCKED_BY_OTHER',
        ownerId: currentCheck?.processing_owner_id ?? null,
        expiresAt: currentCheck?.processing_lease_expires_at ?? null,
      };
    }

    // 2. Row does not exist: Attempt atomic insert in PROCESSING status
    const { data: insertedRow, error: insertErr } = await admin
      .from('processed_domain_events')
      .insert({
        event_id: eventId,
        idempotency_key: idempotencyKey,
        event_type: eventType,
        aggregate_type: aggregateType,
        aggregate_id: aggregateId,
        processing_status: 'PROCESSING',
        processing_owner_id: ownerId,
        processing_lease_expires_at: leaseExpiresAt,
        attempt_count: 1,
        received_at: nowIso,
        last_attempt_at: nowIso,
      })
      .select('*')
      .maybeSingle();

    if (insertErr) {
      // If unique constraint violation (duplicate key 23505), another worker inserted concurrently
      if (insertErr.code === '23505' || insertErr.message?.includes('duplicate key')) {
        // Re-read existing row
        return EventLedgerService.claimEventLease({
          eventId,
          idempotencyKey,
          eventType,
          aggregateType,
          aggregateId,
          ownerId,
          leaseDurationMs,
        });
      }
      return { status: 'FAILED_TO_CLAIM', reason: insertErr.message };
    }

    return {
      status: 'CLAIMED',
      record: insertedRow as ProcessedDomainEventRecord,
    };
  }

  /**
   * Marks an event as successfully PROCESSED.
   * Releases lease and persists execution result summary.
   */
  public static async markEventProcessed(params: {
    eventId: string;
    resultSummary?: Record<string, unknown>;
  }): Promise<boolean> {
    const { eventId, resultSummary = {} } = params;
    const admin = createAdminClient();

    const { error } = await admin
      .from('processed_domain_events')
      .update({
        processing_status: 'PROCESSED',
        processing_owner_id: null,
        processing_lease_expires_at: null,
        processed_at: new Date().toISOString(),
        error_code: null,
        error_message: null,
        result_summary: resultSummary,
      })
      .eq('event_id', eventId);

    if (error) {
      console.error(`[EventLedgerService] Failed to mark event ${eventId} as PROCESSED:`, error);
      return false;
    }

    return true;
  }

  /**
   * Marks an event as FAILED.
   * Decoupled failure persistence: records error details and resets lease so retry/DLQ can act.
   */
  public static async markEventFailed(params: {
    eventId: string;
    errorCode: string;
    errorMessage: string;
    releaseLease?: boolean;
  }): Promise<boolean> {
    const { eventId, errorCode, errorMessage, releaseLease = true } = params;
    const admin = createAdminClient();

    const updatePayload: Record<string, unknown> = {
      processing_status: 'FAILED',
      error_code: errorCode,
      error_message: errorMessage,
      last_attempt_at: new Date().toISOString(),
    };

    if (releaseLease) {
      updatePayload.processing_owner_id = null;
      updatePayload.processing_lease_expires_at = null;
    }

    const { error } = await admin
      .from('processed_domain_events')
      .update(updatePayload)
      .eq('event_id', eventId);

    if (error) {
      console.error(`[EventLedgerService] Failed to mark event ${eventId} as FAILED:`, error);
      return false;
    }

    return true;
  }

  /**
   * Retrieves processing details for a given eventId or idempotencyKey.
   */
  public static async getEventStatus(
    key: { eventId?: string; idempotencyKey?: string }
  ): Promise<ProcessedDomainEventRecord | null> {
    const admin = createAdminClient();
    let query = admin.from('processed_domain_events').select('*');

    if (key.eventId) {
      query = query.eq('event_id', key.eventId);
    } else if (key.idempotencyKey) {
      query = query.eq('idempotency_key', key.idempotencyKey);
    } else {
      return null;
    }

    const { data } = await query.maybeSingle();
    return (data as ProcessedDomainEventRecord) || null;
  }
}
