/**
 * features/external-integrations/gmp/gmpTypes.ts
 *
 * Phase 9 Stage 3D: Grey Market Premium (GMP) Intelligence Contracts (Revision 2).
 * Strictly preserves boundaries: unofficial OTC sentiment only, zero mutation of user applications.
 */

import {
  GMPTrendDirection,
  GMPAnomalyStatus,
  GMPFreshnessState,
  IPOVerificationStatus,
} from '@/types/database.types';

export type {
  GMPTrendDirection,
  GMPAnomalyStatus,
  GMPFreshnessState,
  IPOVerificationStatus,
};

export type GMPSourceFamily = 'aggregator' | 'broker_desk' | 'partner_api' | 'manual_audit';

export interface GMPSourceMetadata {
  sourceId: string;                     // e.g. 'ipowatch_otc_feed'
  sourceFamily: GMPSourceFamily;
  publisherId: string;                  // e.g. 'ipowatch_media'
  upstreamSourceId?: string | null;     // e.g. 'mumbai_dealer_network'
  independenceGroup: string;            // e.g. 'GRP_IPOWATCH'
  sourceType: 'automated_feed' | 'manual_entry';
}

export interface RawOTCPayload {
  sourceId: string;
  sourceFamily: GMPSourceFamily;
  publisherId: string;
  upstreamSourceId?: string | null;
  independenceGroup: string;
  companySymbol?: string;
  companyName: string;
  quoteTimestamp: string;               // ISO String
  rawGmp?: number | string | null;      // Premium in INR per share
  rawKostak?: number | string | null;   // Flat INR per application
  rawSubjectToSauda?: number | string | null; // Conditional INR per allotted application
  saudaConditionNotes?: string | null;
  sourceUrl?: string;
}

export interface NormalizedGMPObservation {
  ipo_id: string;
  source_observation_id?: string | null;
  source_observation_uid: string;
  source_observation_hash: string;
  gmp_source: string;
  source_family: string;
  publisher_id: string;
  upstream_source_id: string | null;
  independence_group: string;
  quote_time: string;
  reported_gmp_value: number | null;
  reported_kostak: number | null;
  reported_subject_to_sauda: number | null;
  sauda_condition_notes: string | null;
  anomaly_status: GMPAnomalyStatus;
  anomaly_reason: string | null;
  validation_status: IPOVerificationStatus;
  raw_payload_hash: string;
}

export interface GMPConsensusResult {
  ipoId: string;
  snapshotDate: string;
  consensusGmpValue: number | null;
  gmpPercentage: number | null;
  estimatedListingPrice: number | null;
  estimatedListingGainPct: number | null;
  sourceCount: number;                  // Count of distinct INDEPENDENCE GROUPS
  sourceSpreadPct: number | null;
  kostakRate: number | null;
  subjectToSaudaRate: number | null;
  saudaConditionNotes: string | null;
  trendDirection: GMPTrendDirection;
  dayChangeValue: number;
  dayChangePct: number;
  confidenceLevel: IPOVerificationStatus;
  freshnessState: GMPFreshnessState;
  policyVersion: string;
  isPostListingFrozen: boolean;
  outliersQuarantined: Array<{
    sourceId: string;
    independenceGroup: string;
    value: number;
    reason: string;
  }>;
}

export type GMPEventType =
  | 'gmp_consensus_changed'      // True price movement based on verified consensus
  | 'gmp_source_corrected'       // Corrigendum issued by aggregator
  | 'gmp_outlier_quarantined'    // Anomaly pruned from calculation
  | 'gmp_spike_detected'         // Extreme movement flagged for admin audit
  | 'gmp_post_listing_frozen';   // Final pre-listing baseline locked
