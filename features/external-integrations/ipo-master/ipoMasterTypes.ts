/**
 * features/external-integrations/ipo-master/ipoMasterTypes.ts
 *
 * Phase 9 Stage 3A: Broker-Independent Real IPO Master Data Types & Contracts.
 * Defines schemas for raw and normalized payloads across SEBI, NSE, BSE, and optional providers,
 * field-level provenance, canonical identity matching, and staging inbox review.
 */

export type SourceAuthorityTier =
  | 'official_regulatory' // Tier 1: SEBI
  | 'official_exchange'   // Tier 1: NSE, BSE
  | 'official_document'   // Tier 2: RHP, Prospectus
  | 'licensed_feed'       // Tier 3: Upstox, Commercial Aggregators
  | 'unofficial_observed';// Tier 4: GMP Trackers (Deferred)

export type IngestionSource = 'sebi' | 'nse' | 'bse' | 'upstox';

export type IngestionDocumentType =
  | 'IPO_MASTER'
  | 'DRHP'
  | 'RHP'
  | 'PROSPECTUS'
  | 'ADDENDUM'
  | 'CORRIGENDUM'
  | 'UDRHP';

export type IngestionReviewStatus =
  | 'pending'
  | 'promoted_to_draft'
  | 'promoted_to_published'
  | 'rejected'
  | 'archived';

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
  exchange?: 'NSE' | 'BSE' | 'BOTH' | null;
  drhp_url?: string | null;
  rhp_url?: string | null;
  prospectus_url?: string | null;
  registrar?: string | null;
  lead_managers?: string[];
  business_status?: 'upcoming' | 'open' | 'closed' | 'listed' | null;
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
