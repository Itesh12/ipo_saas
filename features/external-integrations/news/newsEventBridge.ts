/**
 * features/external-integrations/news/newsEventBridge.ts
 *
 * Phase 9 Stage 3E: Phase 7 Outbox Bridge & Event Producer.
 *
 * Invariants:
 * 1. Single Notification System: Produces domain events into Phase 7 notification_events via NotificationDispatcher.ingestEvent.
 * 2. Strict Price-Sensitive Separation: Speculative media NEVER emits material_regulatory_announcement.
 *    Only official_regulatory + verified + material triggers critical regulatory alerts.
 * 3. Cooldown Bypass != Idempotency Bypass: Urgent events bypass time cooldowns but remain strictly idempotent via idempotency_key.
 * 4. Post-Commit Execution: Emitted only after database transactions commit.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { NotificationDispatcher } from '@/features/notifications/services/notificationDispatcher';
import { NormalizedNewsObservation } from './newsTypes';

export interface EmitEventResult {
  wasEmitted: boolean;
  eventId: string | null;
  reason?: string;
}

export class NewsEventBridge {
  /**
   * Evaluates a normalized news observation post-commit and conditionally ingests a Phase 7 event.
   */
  public static async emitNewsEvent(
    supabase: SupabaseClient,
    news: NormalizedNewsObservation,
    ipoContext?: { symbol?: string | null; companyName: string; slug?: string }
  ): Promise<EmitEventResult> {
    if (!news.ipo_id) {
      return { wasEmitted: false, eventId: null, reason: 'News is not resolved to an IPO. No alert emitted.' };
    }

    const companyName = ipoContext?.companyName || 'IPO';
    const symbol = ipoContext?.symbol || '';
    const slug = ipoContext?.slug || '';

    // Invariant 2: Price-Sensitive Speculation != Verified Regulatory Event
    const isOfficialVerifiedMaterial =
      news.authoritativeness === 'official_regulatory' &&
      news.verification_status === 'verified' &&
      (news.is_price_sensitive || news.structured_event_type !== null);

    if (isOfficialVerifiedMaterial) {
      // Urgent Statutory / Exchange Event
      const eventType = 'material_regulatory_announcement';
      const dateWindow = new Date(news.published_at).toISOString().slice(0, 13); // 1-hour window bucket
      const idempotencyKey = `reg_${news.ipo_id}_${news.structured_event_type || 'notice'}_${news.content_hash.slice(0, 16)}_${dateWindow}`;

      const ingestResult = await NotificationDispatcher.ingestEvent(supabase, {
        eventType,
        eventClass: 'condition_driven',
        idempotencyKey,
        aggregateType: 'ipo',
        aggregateId: news.ipo_id,
        payload: {
          ipoId: news.ipo_id,
          companyName,
          symbol,
          slug,
          headline: news.headline,
          excerpt: news.excerpt || news.raw_regulatory_content?.slice(0, 200) || '',
          sourceUrl: news.source_url,
          structuredEventType: news.structured_event_type || 'corporate_announcement',
          publisherId: news.publisher_id,
          publishedAt: news.published_at,
          isOfficial: true,
        },
      });

      if (ingestResult.wasIngested && ingestResult.eventId) {
        // Trigger Path A best-effort dispatch
        await NotificationDispatcher.dispatchPendingBestEffort(supabase, ingestResult.eventId);
      }

      return {
        wasEmitted: ingestResult.wasIngested,
        eventId: ingestResult.eventId,
        reason: ingestResult.wasIngested
          ? 'Material regulatory circular emitted to Phase 7 outbox'
          : 'Duplicate regulatory event skipped via idempotency key',
      };
    } else {
      // Third-party media or non-material news stays informative in the UI
      return {
        wasEmitted: false,
        eventId: null,
        reason: 'Third-party media or general market commentary does not emit urgent statutory alerts.',
      };
    }
  }

  /**
   * Bridges cross-stage intelligence milestones into Phase 7 durable outbox.
   */
  public static async emitMilestoneEvent(
    supabase: SupabaseClient,
    params: {
      eventType:
        | 'ipo_catalog_discovered'
        | 'regulatory_document_verified'
        | 'subscription_demand_milestone'
        | 'allotment_query_portal_active'
        | 'gmp_consensus_changed';
      ipoId: string;
      payload: Record<string, unknown>;
      isUrgent?: boolean;
    }
  ): Promise<EmitEventResult> {
    const { eventType, ipoId, payload, isUrgent = false } = params;

    // Cooldown window: 2 hours for normal alerts, 10 mins for urgent
    const windowMinutes = isUrgent ? 10 : 120;
    const epochBucket = Math.floor(Date.now() / (windowMinutes * 60 * 1000));
    const idempotencyKey = `ms_${ipoId}_${eventType}_${epochBucket}`;

    const ingestResult = await NotificationDispatcher.ingestEvent(supabase, {
      eventType,
      eventClass: 'condition_driven',
      idempotencyKey,
      aggregateType: 'ipo',
      aggregateId: ipoId,
      payload,
    });

    if (ingestResult.wasIngested && ingestResult.eventId) {
      await NotificationDispatcher.dispatchPendingBestEffort(supabase, ingestResult.eventId);
    }

    return {
      wasEmitted: ingestResult.wasIngested,
      eventId: ingestResult.eventId,
      reason: ingestResult.wasIngested ? 'Milestone ingested into Phase 7' : 'Duplicate milestone skipped',
    };
  }
}
