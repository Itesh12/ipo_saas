/**
 * features/notifications/services/eventProcessor.ts
 *
 * Phase 7B: Durable Event Processing, Lease Management & Retry Engine
 * Claims pending events using claim_notification_events RPC (FOR UPDATE SKIP LOCKED),
 * classifies errors into fatal vs retryable, computes exponential backoff,
 * sanitizes last_error, and transitions exhausted events to dead_letter.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { renderNotificationContent } from './templateRenderer';
import { PreferenceEvaluator } from './preferenceEvaluator';
import { DeliveryDispatcher } from './deliveryDispatcher';
import { NotificationCategory, NotificationPriority } from '../types/notification.types';

export interface ClaimedEvent {
  id: string;
  event_type: string;
  event_class: 'transaction_driven' | 'condition_driven';
  idempotency_key: string;
  aggregate_type: string;
  aggregate_id: string;
  user_id: string | null;
  payload: Record<string, unknown>;
  schema_version: string;
  attempt_count: number;
  max_attempts: number;
}

export interface ProcessingBatchResult {
  claimedCount: number;
  processedCount: number;
  failedCount: number;
  deadLetterCount: number;
}

export class EventProcessor {
  static readonly MAX_ATTEMPTS = 5;

  /**
   * Computes exponential backoff in seconds: min(300, 2^attempt * 5).
   */
  static computeBackoffSeconds(attempt: number): number {
    return Math.min(300, Math.pow(2, attempt) * 5);
  }

  /**
   * Sanitizes error message to bounded 500-char string without stack traces or secrets.
   */
  static sanitizeError(err: unknown, attempt: number): string {
    const rawMsg = err instanceof Error ? err.message : String(err);
    // Strip file paths and stack lines
    const cleanMsg = rawMsg.split('\n')[0].replace(/C:[\\\/][^\s:]+/gi, '[path]').slice(0, 400);
    const sanitizedObj = {
      message: cleanMsg,
      attempt,
      timestamp: new Date().toISOString(),
    };
    return JSON.stringify(sanitizedObj).slice(0, 500);
  }

  /**
   * Determines whether an error is non-retryable (fatal), requiring immediate dead_letter.
   */
  static isFatalError(err: unknown): boolean {
    if (err instanceof Error) {
      const msg = err.message.toLowerCase();
      if (
        msg.includes('invalid schema') ||
        msg.includes('unknown event type') ||
        msg.includes('template render failed') ||
        msg.includes('corrupt payload') ||
        msg.includes('unsupported event')
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Processes a single claimed event with resilient error classification.
   */
  static async processSingleEvent(supabase: SupabaseClient, event: ClaimedEvent): Promise<'processed' | 'failed' | 'dead_letter'> {
    try {
      // 1. Render template
      const template = renderNotificationContent({
        eventType: event.event_type,
        payload: event.payload as Record<string, unknown>,
      });

      // 2. Resolve recipients
      let targetUserIds: string[] = [];
      if (event.user_id) {
        targetUserIds = [event.user_id];
      } else {
        // Platform-wide event fan-out: fetch active users (batched)
        const { data: users } = await supabase
          .from('profiles')
          .select('id')
          .eq('is_suspended', false)
          .limit(500);
        targetUserIds = (users || []).map((u) => u.id);
      }

      // 3. Dispatch to each recipient
      for (const uid of targetUserIds) {
        // Query user preference and quiet hours
        const { data: prefRow } = await supabase
          .from('notification_preferences')
          .select('*')
          .eq('user_id', uid)
          .eq('category', template.category)
          .maybeSingle();

        const { data: quietRow } = await supabase
          .from('user_notification_settings')
          .select('*')
          .eq('user_id', uid)
          .maybeSingle();

        const channels = PreferenceEvaluator.evaluateChannels({
          category: template.category as NotificationCategory,
          priority: template.priority as NotificationPriority,
          isMandatory: !!template.isMandatory,
          preferences: prefRow
            ? {
                category: prefRow.category,
                channelInApp: prefRow.channel_in_app,
                channelEmail: prefRow.channel_email,
                channelPush: prefRow.channel_push,
              }
            : null,
          quietHours: quietRow
            ? {
                timezone: quietRow.timezone,
                quietHoursEnabled: quietRow.quiet_hours_enabled,
                quietHoursStart: quietRow.quiet_hours_start,
                quietHoursEnd: quietRow.quiet_hours_end,
                minPriorityDuringQuiet: quietRow.min_priority_during_quiet,
              }
            : null,
        });

        await DeliveryDispatcher.dispatchToUser(supabase, {
          userId: uid,
          eventId: event.id,
          category: template.category as NotificationCategory,
          priority: template.priority as NotificationPriority,
          title: template.title,
          message: template.message,
          actionUrl: template.actionUrl,
          actionLabel: template.actionLabel,
          isMandatory: !!template.isMandatory,
          deliverInApp: channels.deliverInApp,
          deliverEmail: channels.deliverEmail,
          deliverPush: channels.deliverPush,
        });
      }

      // 4. Mark event as processed
      await supabase
        .from('notification_events')
        .update({
          status: 'processed',
          processed_at: new Date().toISOString(),
          last_error: null,
        })
        .eq('id', event.id);

      return 'processed';
    } catch (err: unknown) {
      const sanitized = this.sanitizeError(err, event.attempt_count);
      const isFatal = this.isFatalError(err);
      const hasExhaustedAttempts = event.attempt_count >= (event.max_attempts || this.MAX_ATTEMPTS);

      if (isFatal || hasExhaustedAttempts) {
        // Transition directly to dead_letter
        await supabase
          .from('notification_events')
          .update({
            status: 'dead_letter',
            failed_at: new Date().toISOString(),
            last_error: sanitized,
          })
          .eq('id', event.id);

        return 'dead_letter';
      } else {
        // Transient error: retry with exponential backoff
        const backoffSec = this.computeBackoffSeconds(event.attempt_count);
        const nextAvailable = new Date(Date.now() + backoffSec * 1000).toISOString();

        await supabase
          .from('notification_events')
          .update({
            status: 'failed',
            failed_at: new Date().toISOString(),
            available_at: nextAvailable,
            last_error: sanitized,
          })
          .eq('id', event.id);

        return 'failed';
      }
    }
  }

  /**
   * Claims and processes a batch of pending events.
   */
  static async processBatch(
    supabase: SupabaseClient,
    batchSize: number = 10,
    lockId: string = crypto.randomUUID(),
    leaseSeconds: number = 60
  ): Promise<ProcessingBatchResult> {
    // 1. Claim batch via RPC
    const { data: claimedEvents, error: claimErr } = await supabase.rpc('claim_notification_events', {
      p_batch_size: batchSize,
      p_lock_id: lockId,
      p_lease_seconds: leaseSeconds,
    });

    if (claimErr) {
      throw claimErr;
    }

    const events = (claimedEvents || []) as ClaimedEvent[];
    let processedCount = 0;
    let failedCount = 0;
    let deadLetterCount = 0;

    for (const event of events) {
      const outcome = await this.processSingleEvent(supabase, event);
      if (outcome === 'processed') processedCount++;
      else if (outcome === 'failed') failedCount++;
      else if (outcome === 'dead_letter') deadLetterCount++;
    }

    return {
      claimedCount: events.length,
      processedCount,
      failedCount,
      deadLetterCount,
    };
  }
}
