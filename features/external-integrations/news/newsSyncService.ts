/**
 * features/external-integrations/news/newsSyncService.ts
 *
 * Phase 9 Stage 3E: News & Announcements Orchestration Service (Revision 2).
 *
 * Invariants:
 * 1. Durable Ingestion History: Stores observations in ipo_news_observations with ON DELETE SET NULL on raw ingestion.
 * 2. Copyright-Safe Retention: Third-party media excerpt capped at 300 characters. Full text stored ONLY for official regulatory circulars.
 * 3. 5-Tier Entity Resolution: Ambiguous matches quarantined (quarantined_unmatched).
 * 4. Story Clustering: Syndicated reports grouped under story_cluster_id without deleting source records.
 * 5. Phase 7 Outbox Integration: Ingests post-commit events into Phase 7 outbox.
 * 6. Deletion Guard: Blocks hard deletion of IPOs with durable news observations.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import crypto from 'crypto';
import { RawNewsPayload, NormalizedNewsObservation, NewsVerificationStatus } from './newsTypes';
import { newsEntityResolver, CanonicalIPOCandidate } from './newsEntityResolver';
import { newsStoryClusterEngine, ExistingStoryItem } from './newsStoryClusterEngine';
import { NewsEventBridge } from './newsEventBridge';
import { wrapCompliantNewsPayload, CompliantNewsPayload } from './newsCompliance';

export interface NewsSyncResult {
  observationId?: string;
  newsId?: string;
  ipoId: string | null;
  storyClusterId: string;
  verificationStatus: NewsVerificationStatus;
  isPriceSensitive: boolean;
  eventEmitted: boolean;
  compliantPayload?: CompliantNewsPayload<NormalizedNewsObservation>;
  errors: string[];
}

export class NewsSyncService {
  /**
   * Processes a raw news / announcement payload into durable observation and canonical news.
   */
  public static async processRawNews(params: {
    rawPayload: RawNewsPayload;
    sourceObservationId?: string | null;
    supabaseClient?: SupabaseClient;
  }): Promise<NewsSyncResult> {
    const { rawPayload, sourceObservationId, supabaseClient } = params;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = supabaseClient || (await createClient());
    const errors: string[] = [];

    // 1. Compute Content Hash & Source Observation UID
    const normalizedHeadline = rawPayload.headline.trim();
    const contentHash = crypto
      .createHash('sha256')
      .update(`${normalizedHeadline}_${rawPayload.sourceUrl}`)
      .digest('hex');

    const sourceObsUid = `${rawPayload.sourceId}_${contentHash.slice(0, 16)}`;

    // 2. Copyright & Content Retention Policy
    let excerpt: string | null = null;
    let rawRegulatoryContent: string | null = null;

    if (rawPayload.authoritativeness === 'official_regulatory') {
      rawRegulatoryContent = rawPayload.rawContent || null;
      excerpt = rawPayload.rawContent ? rawPayload.rawContent.slice(0, 300).trim() : null;
    } else {
      // Third-party media: max 300 characters excerpt (copyright safe)
      excerpt = rawPayload.rawContent
        ? rawPayload.rawContent.slice(0, 300).trim()
        : normalizedHeadline.slice(0, 300);
      rawRegulatoryContent = null;
    }

    // 3. Fetch Active IPO Candidates for 5-Tier Entity Resolution
    const { data: ipoRows } = await supabase
      .from('ipos')
      .select('id, symbol, company_name');

    const candidates: CanonicalIPOCandidate[] = (ipoRows || []).map(
      (r: { id: string; symbol: string | null; company_name: string }) => ({
        id: r.id,
        symbol: r.symbol,
        isin: null,
        companyName: r.company_name,
      })
    );

    const resolution = newsEntityResolver.resolveEntity({
      headline: normalizedHeadline,
      rawContent: rawPayload.rawContent,
      identifierHints: rawPayload.identifierHints,
      candidates,
    });

    const resolvedIpoId = resolution.ipoId;
    let verificationStatus: NewsVerificationStatus = 'unverified';

    if (resolvedIpoId) {
      verificationStatus = rawPayload.authoritativeness === 'official_regulatory' ? 'verified' : 'unverified';
    } else {
      verificationStatus = 'quarantined_unmatched';
    }

    // 4. Story Clustering Evaluation
    const { data: recentStories } = await supabase
      .from('ipo_news_observations')
      .select('id, headline, published_at, story_cluster_id, publisher_id')
      .order('published_at', { ascending: false })
      .limit(50);

    const existingStoryItems: ExistingStoryItem[] = (recentStories || []).map(
      (s: { id: string; headline: string; published_at: string; story_cluster_id: string; publisher_id: string }) => ({
        id: s.id,
        headline: s.headline,
        publishedAt: s.published_at,
        storyClusterId: s.story_cluster_id,
        publisherId: s.publisher_id,
      })
    );

    const clusterResult = newsStoryClusterEngine.clusterStory({
      headline: normalizedHeadline,
      publishedAt: rawPayload.publishedAt,
      existingStories: existingStoryItems,
    });

    const storyClusterId = clusterResult.storyClusterId;

    // 5. Persist Durable News Observation
    const normalizedObservation: NormalizedNewsObservation = {
      ipo_id: resolvedIpoId,
      source_observation_id: sourceObservationId || null,
      source_observation_uid: sourceObsUid,
      source_observation_hash: contentHash,
      news_source: rawPayload.sourceId,
      source_family: rawPayload.sourceFamily,
      publisher_id: rawPayload.publisherId,
      upstream_source_id: rawPayload.upstreamSourceId || null,
      independence_group: rawPayload.independenceGroup,
      headline: normalizedHeadline,
      excerpt,
      raw_regulatory_content: rawRegulatoryContent,
      source_url: rawPayload.sourceUrl,
      published_at: rawPayload.publishedAt,
      content_hash: contentHash,
      story_cluster_id: storyClusterId,
      authoritativeness: rawPayload.authoritativeness,
      category: rawPayload.categoryHint || 'general_news',
      verification_status: verificationStatus,
      is_price_sensitive: !!rawPayload.isPriceSensitive,
      structured_event_type: rawPayload.structuredEventType || null,
      matched_entity_id: resolvedIpoId,
      resolution_method: resolution.method,
      resolution_confidence: resolution.confidence,
    };

    let observationId: string | undefined;
    // Omit structured_event_type from ipo_news_observations table insert
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { structured_event_type: _ignored, ...obsInsertData } = normalizedObservation;

    const { data: insertedObs, error: insertObsErr } = await supabase
      .from('ipo_news_observations')
      .insert(obsInsertData)
      .select('id')
      .single();

    if (insertObsErr) {
      errors.push(`Observation insert error: ${insertObsErr.message}`);
    } else if (insertedObs) {
      observationId = insertedObs.id;
      normalizedObservation.id = observationId;
    }

    // 6. Materialize into Canonical ipo_news (if resolved to an IPO)
    let newsId: string | undefined;
    if (resolvedIpoId && verificationStatus !== 'quarantined_unmatched') {
      const { data: existingNews } = await supabase
        .from('ipo_news')
        .select('id')
        .eq('ipo_id', resolvedIpoId)
        .eq('content_hash', contentHash)
        .maybeSingle();

      if (existingNews) {
        newsId = existingNews.id;
      } else {
        const { data: insertedNews, error: newsErr } = await supabase
          .from('ipo_news')
          .insert({
            ipo_id: resolvedIpoId,
            headline: normalizedHeadline,
            summary: excerpt,
            source: rawPayload.publisherId,
            source_url: rawPayload.sourceUrl,
            sentiment: 'neutral',
            published_at: rawPayload.publishedAt,
            category: normalizedObservation.category,
            authoritativeness: normalizedObservation.authoritativeness,
            verification_status: verificationStatus,
            content_hash: contentHash,
            story_cluster_id: storyClusterId,
            canonical_story_id: clusterResult.canonicalStoryId,
            publisher_id: rawPayload.publisherId,
            independence_group: rawPayload.independenceGroup,
            is_price_sensitive: normalizedObservation.is_price_sensitive,
            structured_event_type: normalizedObservation.structured_event_type,
            source_observation_id: observationId || null,
          })
          .select('id')
          .single();

        if (newsErr) {
          errors.push(`Canonical news insert error: ${newsErr.message}`);
        } else if (insertedNews) {
          newsId = insertedNews.id;
        }
      }
    }

    // 7. Post-Commit Phase 7 Notification Event Emission
    let eventEmitted = false;
    if (resolvedIpoId && verificationStatus === 'verified') {
      const { data: ipoMeta } = await supabase
        .from('ipos')
        .select('company_name, symbol, slug')
        .eq('id', resolvedIpoId)
        .maybeSingle();

      const emitResult = await NewsEventBridge.emitNewsEvent(supabase, normalizedObservation, {
        companyName: ipoMeta?.company_name || 'IPO',
        symbol: ipoMeta?.symbol,
        slug: ipoMeta?.slug,
      });

      eventEmitted = emitResult.wasEmitted;
    }

    const compliantPayload = wrapCompliantNewsPayload(
      normalizedObservation,
      normalizedObservation.authoritativeness === 'official_regulatory'
    );

    return {
      observationId,
      newsId,
      ipoId: resolvedIpoId,
      storyClusterId,
      verificationStatus,
      isPriceSensitive: normalizedObservation.is_price_sensitive,
      eventEmitted,
      compliantPayload,
      errors,
    };
  }

  /**
   * Published/historical IPO deletion guard.
   * Blocks hard deletion if IPO has durable news observations or canonical circulars.
   */
  public static async canHardDeleteIpo(
    ipoId: string,
    supabaseClient?: SupabaseClient
  ): Promise<{ canDelete: boolean; reason?: string }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = supabaseClient || (await createClient());

    const { count: obsCount } = await supabase
      .from('ipo_news_observations')
      .select('id', { count: 'exact', head: true })
      .eq('ipo_id', ipoId);

    if (obsCount && obsCount > 0) {
      return {
        canDelete: false,
        reason: `IPO ${ipoId} contains ${obsCount} durable news/circular observation records. Archive instead of hard-deleting.`,
      };
    }

    const { count: newsCount } = await supabase
      .from('ipo_news')
      .select('id', { count: 'exact', head: true })
      .eq('ipo_id', ipoId);

    if (newsCount && newsCount > 0) {
      return {
        canDelete: false,
        reason: `IPO ${ipoId} contains canonical news/announcement records. Archive instead of hard-deleting.`,
      };
    }

    return { canDelete: true };
  }
}
