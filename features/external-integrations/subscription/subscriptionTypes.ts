/**
 * features/external-integrations/subscription/subscriptionTypes.ts
 *
 * Phase 9 Stage 3C: Subscription & Allotment Intelligence Contracts (Revision 2.2).
 * Strictly preserves boundaries: market-wide macro intelligence only, zero mutation of user applications.
 */

import {
  SubscriptionFeedScope,
  SubscriptionAnomalyStatus,
  RegistrarQueryState,
  IPOAllotmentLifecycleState,
  IPOVerificationStatus,
} from '@/types/database.types';

export type {
  SubscriptionFeedScope,
  SubscriptionAnomalyStatus,
  RegistrarQueryState,
  IPOAllotmentLifecycleState,
};

/**
 * Unified canonical investor categories (aligned with Phase 4 investor taxonomy).
 * Invariant: ANCHOR is strictly quarantined to pre-issue allocation metadata and
 * must NEVER contribute to live cumulative bidding demand or overall_x.
 */
export type CanonicalInvestorCategory =
  | 'RETAIL'        // Retail Individual Investors (<= ₹2 Lakhs)
  | 'S_HNI'         // Small NII (₹2 Lakhs – ₹10 Lakhs)
  | 'B_HNI'         // Big NII (> ₹10 Lakhs)
  | 'QIB'           // Qualified Institutional Buyers (Net of Anchor)
  | 'ANCHOR'        // Anchor Investors (Pre-issue allocated T-1 day)
  | 'EMPLOYEE'      // Employee Reservation
  | 'SHAREHOLDER';  // Parent Entity Shareholder Reservation

export interface CategoryBidMetrics {
  category: CanonicalInvestorCategory;
  shares_offered: number;
  shares_bid: number;
  bids_count: number;
  subscription_x: number;
  amount_bid_cr?: number;
}

export interface RawExchangeCategoryRow {
  categoryName: string;
  sharesOffered?: number | string;
  sharesBid?: number | string;
  bidsCount?: number | string;
  subscriptionMultiple?: number | string;
  amountBidCr?: number | string;
}

export interface RawExchangeSubscriptionPayload {
  exchange: 'BSE' | 'NSE';
  companySymbol: string;
  companyName?: string;
  dayNumber: number;
  asOfTimestamp: string;
  feedScope: SubscriptionFeedScope;
  isSessionClosed?: boolean;
  categories: RawExchangeCategoryRow[];
  reportedTotalSharesOffered?: number | string;
  reportedTotalSharesBid?: number | string;
  reportedTotalBidsCount?: number | string;
  reportedOverallMultiple?: number | string;
}

export interface NormalizedSubscriptionObservation {
  ipo_id: string;
  source_observation_id?: string | null;
  source_observation_uid: string;
  source_observation_hash: string;
  exchange: string;
  feed_scope: SubscriptionFeedScope;
  source_composition: string[];
  day_number: number;
  snapshot_time: string;
  reported_overall_x: number;
  computed_overall_x: number | null;
  calculation_basis: string;
  tolerance_pct: number;
  anomaly_status: SubscriptionAnomalyStatus;
  anomaly_reason?: string | null;
  source_qib_definition: string;
  definition_verified: boolean;
  anchor_adjustment_applied: boolean;
  qib_x: number | null;
  b_hni_x: number | null;
  s_hni_x: number | null;
  retail_x: number | null;
  employee_x: number | null;
  shareholder_x: number | null;
  category_details: Record<string, CategoryBidMetrics>;
  validation_status: IPOVerificationStatus;
  raw_payload_hash: string;
  is_corrected: boolean;
  is_final_for_day: boolean;
  session_close_source?: string | null;
}

export interface SubscriptionValidationResult {
  is_valid: boolean;
  anomaly_status: SubscriptionAnomalyStatus;
  anomaly_reason?: string;
  reported_overall_x: number;
  computed_overall_x: number;
  calculation_basis: string;
  tolerance_pct: number;
  delta_pct: number;
}

export interface OfficialAllotmentFactPayload {
  ipo_id: string;
  basis_document_id: string;
  official_total_valid_applications: number;
  official_total_rejected_applications: number;
  official_retail_valid_applications: number;
  official_retail_successful_applicants: number;
  official_retail_lottery_ratio: number;
  official_shni_valid_applications?: number | null;
  official_shni_successful_applicants?: number | null;
  official_shni_lottery_ratio?: number | null;
  official_bhni_proportionate_factor?: number | null;
  proposed_allotment_date?: string | null;
  proposed_listing_date?: string | null;
  verified_by_observation_id?: string | null;
}

export interface DerivedAllotmentEstimatePayload {
  ipo_id: string;
  final_subscription_snapshot_id?: string | null;
  estimated_retail_subscription_x: number;
  estimated_retail_lottery_ratio: number;
  estimated_retail_allotment_probability_pct: number;
  estimation_disclaimer: string;
}

export interface RegistrarPortalProbeResult {
  ipo_id: string;
  registrar_name: string;
  portal_url: string;
  query_state: RegistrarQueryState;
  last_probed_at: string;
  probe_http_status: number | null;
  company_detected_in_dropdown: boolean;
  error_details?: string | null;
}
