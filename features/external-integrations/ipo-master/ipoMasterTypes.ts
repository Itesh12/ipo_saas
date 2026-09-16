/**
 * features/external-integrations/ipo-master/ipoMasterTypes.ts
 *
 * Phase 9 Stage 3A: Broker-Independent Real IPO Master Data Types & Contracts.
 * Defines schemas for raw and normalized payloads across SEBI, NSE, BSE, and optional providers,
 * field-level provenance, canonical identity matching, and staging inbox review.
 */

import type { IPOStatus } from '../../ipo/types/ipo.types';

export type SourceAuthorityTier =
  | 'official_regulatory' // Tier 1: SEBI
  | 'official_exchange'   // Tier 1: NSE, BSE
  | 'official_document'   // Tier 2: RHP, Prospectus
  | 'licensed_feed'       // Tier 3: Upstox, Commercial Aggregators
  | 'unofficial_observed';// Tier 4: GMP Trackers (Deferred)

export type IngestionSource = 'sebi' | 'nse' | 'bse' | 'upstox' | 'nse_archive' | 'bse_archive' | 'sebi_archive';

export type MarketSegment = 'MAINBOARD' | 'NSE_SME' | 'BSE_SME';

export type IPODataQuality = 'discovered' | 'partial' | 'verified' | 'complete' | 'conflicted';

export type IPOInstrumentType =
  | 'IPO'
  | 'SME_IPO'
  | 'FPO'
  | 'RIGHTS'
  | 'OFFER_FOR_SALE'
  | 'DEBT'
  | 'REIT'
  | 'INVIT'
  | 'BUYBACK'
  | 'OTHER';

export type GlobalCoverageState = 'COMPLETE' | 'PARTIAL' | 'DEGRADED' | 'UNKNOWN';

export interface FieldTruthEntry {
  field: string;
  sebi_value?: unknown;
  nse_value?: unknown;
  bse_value?: unknown;
  archive_value?: unknown;
  selected_value: unknown;
  selected_source: string;
  confidence: 'high' | 'medium' | 'pending';
  rule_applied: string;
}

export type FieldTruthTable = Record<string, FieldTruthEntry>;

export interface SourceReconciliationStats {
  source: string;
  discovered_records: number;
  resolved_candidates: number;
  rejected_records: number;
  unexplained_records: number;
  status: 'healthy' | 'degraded' | 'unreachable';
}

export interface GlobalReconciliationSummary {
  sources: Record<string, SourceReconciliationStats>;
  total_discovered_observations: number;
  total_resolved_observations: number;
  total_rejected_observations: number;
  total_unexplained_observations: number;
  unique_issue_identities: number;
  canonical_master_ipos: number;
  duplicate_issue_identities: number;
  runtime_fixture_records: number;
  coverage_state: GlobalCoverageState;
  coverage_state_reason: string;
}

export type IngestionDocumentType =
  | 'IPO_MASTER'
  | 'DRHP'
  | 'RHP'
  | 'PROSPECTUS'
  | 'ADDENDUM'
  | 'CORRIGENDUM'
  | 'UDRHP';

export type IngestionReviewStatus =
  | 'candidate'           // Initial discovered filing, identity or parameters not yet established
  | 'identity_resolved'   // Identity established across official sources, awaiting review
  | 'pending'             // Queued for editorial review
  | 'pending_review'      // Complete canonical record ready for sign-off
  | 'ready_for_review'
  | 'conflict_detected'   // Discrepancy between Tier-1 sources, requires admin resolution
  | 'conflicted'
  | 'promoted_to_draft'   // Approved by admin, draft created in ipos table
  | 'promoted_to_published'// Formally published to public directory
  | 'rejected'            // Excluded (e.g. debt, rights, withdrawn)
  | 'archived';           // Historical or superseded record

export type FreshnessGrade = 'fresh' | 'aging' | 'stale' | 'very_stale';

export interface RecordFreshnessMeta {
  last_observed_at: string;
  last_authoritative_observed_at: string;
  data_freshness: FreshnessGrade;
  field_freshness: {
    price_band: FreshnessGrade;
    dates: FreshnessGrade;
    listing_status: FreshnessGrade;
  };
  source_health: 'healthy' | 'degraded' | 'unreachable';
}

export interface DiscoveredIpoCandidate {
  company_name: string;
  document_title: string;
  document_type: IngestionDocumentType;
  document_url: string;
  filing_date: string;
  source: IngestionSource;
  lead_managers?: string[];
  symbol?: string | null;
  isin?: string | null;
  bse_code?: string | null;
  category?: 'mainboard' | 'sme' | null;
  price_band_low?: number | null;
  price_band_high?: number | null;
  lot_size?: number | null;
  issue_size_cr?: number | null;
  open_date?: string | null;
  close_date?: string | null;
  listing_date?: string | null;
  is_equity: boolean;
  is_withdrawn: boolean;
}

export interface FieldProvenance<T = unknown> {
  value: T;
  source: IngestionSource;
  source_url?: string;
  observed_at: string;
  confidence: SourceAuthorityTier;
  is_official: boolean;
}

export interface NormalizedIpoMasterPayload {
  company_name: string;
  symbol?: string | null;
  isin?: string | null;
  category?: 'mainboard' | 'sme' | null;
  issue_type?: 'book_building' | 'fixed_price' | null;
  price_band_low?: number | null;
  price_band_high?: number | null;
  lot_size?: number | null;
  issue_size_cr?: number | null;
  fresh_issue_cr?: number | null;
  ofs_cr?: number | null;
  open_date?: string | null;      // ISO YYYY-MM-DD
  close_date?: string | null;     // ISO YYYY-MM-DD
  allotment_date?: string | null; // ISO YYYY-MM-DD
  listing_date?: string | null;   // ISO YYYY-MM-DD
  bidding_start_time?: string | null;
  bidding_end_time?: string | null;
  listing_price?: number | null;
  is_listing_confirmed?: boolean;
  exchange?: 'NSE' | 'BSE' | 'BOTH' | string | null;
  drhp_url?: string | null;
  rhp_url?: string | null;
  prospectus_url?: string | null;
  registrar?: string | null;
  lead_managers?: string[];
  business_status?: IPOStatus | null;
  issue_identity?: string | null;
  market_segment?: MarketSegment | null;
  instrument_type?: IPOInstrumentType | null;
  data_quality?: IPODataQuality | null;
  offering_year?: number | null;
  amendment_urls?: string[];
}

export interface SourcePageAuditRecord {
  id?: string;
  source: IngestionSource | string;
  segment: MarketSegment | string;
  date_range?: string;
  page_number: number;
  status: 'success' | 'failed' | 'empty';
  records_discovered: number;
  records_persisted: number;
  sanitized_error?: string | null;
  duration_ms: number;
  created_at?: string;
}

export interface ArchiveCoverageMetrics {
  source: string;
  segment: MarketSegment | string;
  date_range: string;
  pages_expected: number;
  pages_discovered: number;
  pages_fetched: number;
  pages_failed: number;
  records_discovered: number;
  records_parsed: number;
  records_persisted: number;
  last_page_reached: boolean;
  coverage_complete: boolean;
  official_count?: number;
  canonical_count?: number;
  variance?: number;
}

export type IpoProvenanceMap = {
  [K in keyof NormalizedIpoMasterPayload]?: FieldProvenance<NormalizedIpoMasterPayload[K]>;
};

export interface IngestionConflictDetail {
  field: keyof NormalizedIpoMasterPayload;
  existing_value: unknown;
  existing_source: IngestionSource;
  incoming_value: unknown;
  incoming_source: IngestionSource;
  resolved_value: unknown;
  resolution_rule: string;
}

export interface CanonicalInboxRecord {
  id: string;
  canonical_name: string;
  symbol?: string | null;
  isin?: string | null;
  review_status: IngestionReviewStatus;
  has_conflict: boolean;
  conflict_details?: IngestionConflictDetail[] | null;
  latest_observation_id?: string | null;
  promoted_ipo_id?: string | null;
  created_at: string;
  updated_at: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
}

export interface IngestionObservationRecord {
  id: string;
  inbox_id: string;
  source: IngestionSource;
  external_id: string;
  document_type: IngestionDocumentType;
  observation_version: number;
  payload_hash: string;
  raw_payload: Record<string, unknown> | null;
  normalized_payload: NormalizedIpoMasterPayload;
  provenance: IpoProvenanceMap;
  observed_at: string;
  raw_payload_expires_at: string;
}

export interface IngestionExtractionResult {
  source: IngestionSource;
  external_id: string;
  document_type: IngestionDocumentType;
  raw_payload: Record<string, unknown>;
  normalized_payload: NormalizedIpoMasterPayload;
  provenance: IpoProvenanceMap;
}

export interface DirectPublishValidationResult {
  canPublish: boolean;
  reasons: string[];
}
