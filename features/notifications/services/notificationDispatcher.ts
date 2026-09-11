/**
 * features/notifications/services/notificationDispatcher.ts
 *
 * Phase 7B: Event Ingestion & Best-Effort Post-Transaction Dispatcher
 * Ingests domain events durably into notification_events.
 * Provides Path A best-effort post-transaction dispatch; durable recovery
 * is handled by the scheduled batch worker (Path B).
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { EventProcessor, ClaimedEvent } from './eventProcessor';

export interface IngestEventInput {
  eventType: string;
  eventClass: 'transaction_driven' | 'condition_driven';
  idempotencyKey: string;
  aggregateType: string;
  aggregateId: string;
  userId?: string | null;
  payload: Record<string, unknown>;
  schemaVersion?: string;
}

export class NotificationDispatcher {
  /**
   * Durably ingests a domain event into notification_events table.
   * Discards duplicate events safely via idempotency_key conflict check.
   */
  static async ingestEvent(
    supabase: SupabaseClient,
    event: IngestEventInput
  ): Promise<{ eventId: string | null; wasIngested: boolean }> {
    const { data: insertedRow, error: insertErr } = await supabase
      .from('notification_events')
      .insert({
        event_type: event.eventType,
        event_class: event.eventClass,
        idempotency_key: event.idempotencyKey,
        aggregate_type: event.aggregateType,
        aggregate_id: event.aggregateId,
        user_id: event.userId || null,
        payload: event.payload,
        schema_version: event.schemaVersion || 'v1.0',
        status: 'pending',
      })
      .select('id')
      .maybeSingle();

    if (insertErr) {
      // Check if duplicate idempotency_key
      const { data: existing } = await supabase
        .from('notification_events')
        .select('id')
        .eq('idempotency_key', event.idempotencyKey)
        .maybeSingle();

      if (existing) {
        return { eventId: existing.id, wasIngested: false };
      }
      throw insertErr;
    }

    return {
      eventId: insertedRow?.id ?? null,
      wasIngested: true,
    };
  }

  /**
   * Path A: Best-effort post-transaction dispatch.
   * Runs in the same application cycle following commit. If it encounters
   * any issue, it fails open because Path B scheduled worker will recover it.
   */
  static async dispatchPendingBestEffort(
    supabase: SupabaseClient,
    eventId: string
  ): Promise<void> {
    try {
      const { data: eventRow, error: getErr } = await supabase
        .from('notification_events')
        .select('*')
        .eq('id', eventId)
        .eq('status', 'pending')
        .maybeSingle();

      if (getErr || !eventRow) return;

      // Optimistically lock and process
      const claimed: ClaimedEvent = {
        id: eventRow.id,
        event_type: eventRow.event_type,
        event_class: eventRow.event_class,
        idempotency_key: eventRow.idempotency_key,
        aggregate_type: eventRow.aggregate_type,
        aggregate_id: eventRow.aggregate_id,
        user_id: eventRow.user_id,
        payload: eventRow.payload,
        schema_version: eventRow.schema_version,
        attempt_count: (eventRow.attempt_count || 0) + 1,
        max_attempts: eventRow.max_attempts || 5,
      };

      await EventProcessor.processSingleEvent(supabase, claimed);
    } catch {
      // Path A fails open: scheduled worker will recover it
    }
  }
}
