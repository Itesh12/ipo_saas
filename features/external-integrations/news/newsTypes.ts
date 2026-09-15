/**
 * features/external-integrations/news/newsTypes.ts
 *
 * Phase 9 Stage 3E: News & Announcements Domain Types (Revision 2).
 */

import {
  NewsCategory,
  NewsAuthoritativeness,
  NewsVerificationStatus,
  RegulatoryEventType,
  IPOSentiment,
} from '@/types/database.types';

export type {
  NewsCategory,
  NewsAuthoritativeness,
  NewsVerificationStatus,
  RegulatoryEventType,
  IPOSentiment,
};

export type NewsSourceFamily = 'exchange_feed' | 'regulatory_portal' | 'media_outlet';

export interface RawNewsPayload {
  sourceId: string;
  sourceFamily: NewsSourceFamily;
  publisherId: string;
  upstreamSourceId?: string | null;
  independenceGroup: string;
  headline: string;
  rawContent?: string | null;
  sourceUrl: string;
  publishedAt: string;
  authoritativeness: NewsAuthoritativeness;
  categoryHint?: NewsCategory;
  isPriceSensitive?: boolean;
  structuredEventType?: RegulatoryEventType | null;
  identifierHints?: {
    symbol?: string;
    isin?: string;
    externalIssueId?: string;
    companyName?: string;
  };
}

export interface NormalizedNewsObservation {
  id?: string;
  ipo_id?: string | null;
  source_observation_id?: string | null;
  source_observation_uid: string;
  source_observation_hash: string;
  news_source: string;
  source_family: string;
  publisher_id: string;
  upstream_source_id: string | null;
  independence_group: string;
  headline: string;
  excerpt: string | null;
  raw_regulatory_content?: string | null;
  source_url: string;
  published_at: string;
  content_hash: string;
  story_cluster_id: string;
  authoritativeness: NewsAuthoritativeness;
  category: NewsCategory;
  verification_status: NewsVerificationStatus;
  is_price_sensitive: boolean;
  structured_event_type?: RegulatoryEventType | null;
  matched_entity_id?: string | null;
  resolution_method?: string | null;
  resolution_confidence?: number;
}

export interface EntityResolutionResult {
  ipoId: string | null;
  method: 'external_issue_id' | 'isin' | 'symbol' | 'legal_name' | 'unresolved';
  confidence: number;
  matchedIdentifiers: Record<string, string>;
  resolverVersion: string;
}

export interface StoryClusterResult {
  storyClusterId: string;
  canonicalStoryId: string;
  isNewCluster: boolean;
  clusterSize: number;
}
