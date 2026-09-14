/**
 * features/external-integrations/gmp/gmpConsensusEngine.ts
 *
 * Phase 9 Stage 3D: Grey Market Premium (GMP) Reconciliation & Consensus Engine (Revision 2).
 *
 * Locked Implementation Rules:
 * 1. Freshness Policy: expiredThresholdHours: 24.0 (0-2h fresh, 2-6h aging, 6-24h stale, >24h expired).
 * 2. Zero/Negative-Safe Spread: spread_pct = (abs(s1 - s2) / max(abs(s1), abs(s2), 1.0)) * 100.
 * 3. Zero-MAD Fallback: if MAD === 0, use secondary deviation ceiling (30% from median).
 *    e.g. [50, 50, 50, 350] -> 350 quarantined -> consensus = 50.
 * 4. Deterministic Small-Source Model: 0=no data, 1=unverified, 2=spread check, 3=median, 4+=MAD/fallback.
 * 5. Independence Group Deduplication: quotes from same independence group resolve to 1 representative quote.
 * 6. Kostak & Subject to Sauda Separation: reconciled independently from share-level GMP.
 */

import {
  NormalizedGMPObservation,
  GMPConsensusResult,
  GMPFreshnessState,
  GMPTrendDirection,
} from './gmpTypes';
import { IPOVerificationStatus } from '@/types/database.types';

export const GMP_POLICY_V1_2026_09 = {
  policyVersion: 'GMP_POLICY_V1_2026_09',
  freshThresholdHours: 2.0,
  agingThresholdHours: 6.0,
  staleThresholdHours: 24.0,
  expiredThresholdHours: 24.0,
  maxSpreadPct: 30.0,
  madMultiplier: 2.0,
  minReferenceDenom: 1.0,
} as const;

export function calculateSafeSpreadPct(s1: number, s2: number, minRef: number = 1.0): number {
  const diff = Math.abs(s1 - s2);
  const denom = Math.max(Math.abs(s1), Math.abs(s2), minRef);
  return Math.round((diff / denom) * 10000) / 100;
}

export function determineFreshnessState(
  latestQuoteTimestamp: string | null,
  nowEpoch: number = Date.now()
): GMPFreshnessState {
  if (!latestQuoteTimestamp) return 'expired';
  const quoteEpoch = new Date(latestQuoteTimestamp).getTime();
  if (isNaN(quoteEpoch)) return 'expired';

  const ageHours = (nowEpoch - quoteEpoch) / (1000 * 60 * 60);

  if (ageHours < 0) return 'fresh'; // Tolerated slight forward skew
  if (ageHours <= GMP_POLICY_V1_2026_09.freshThresholdHours) return 'fresh';
  if (ageHours <= GMP_POLICY_V1_2026_09.agingThresholdHours) return 'aging';
  if (ageHours <= GMP_POLICY_V1_2026_09.staleThresholdHours) return 'stale';
  return 'expired';
}

function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface ConsensusEvaluationInput {
  ipoId: string;
  priceBandHigh?: number | null;
  issuePrice?: number | null;
  isListingConfirmed?: boolean;
  confirmedListingTimestamp?: string | null;
  previousConsensusGmp?: number | null;
  observations: NormalizedGMPObservation[];
  currentTimestamp?: string;
}

export class GMPConsensusEngine {
  public evaluateConsensus(input: ConsensusEvaluationInput): GMPConsensusResult {
    const nowIso = input.currentTimestamp || new Date().toISOString();
    const nowEpoch = new Date(nowIso).getTime();

    // 1. Filter out observations with anomaly_status === 'invalid'
    const eligibleObs = input.observations.filter(
      obs => obs.anomaly_status !== 'invalid' && obs.reported_gmp_value !== null
    );

    // 2. Independence Group Deduplication: keep latest valid quote per independence_group
    const groupMap = new Map<string, NormalizedGMPObservation>();
    for (const obs of eligibleObs) {
      const existing = groupMap.get(obs.independence_group);
      if (!existing) {
        groupMap.set(obs.independence_group, obs);
      } else {
        const existingTime = new Date(existing.quote_time).getTime();
        const curTime = new Date(obs.quote_time).getTime();
        if (curTime > existingTime) {
          groupMap.set(obs.independence_group, obs);
        }
      }
    }

    const deduplicatedQuotes = Array.from(groupMap.values());
    const sourceCount = deduplicatedQuotes.length;

    // Determine latest quote timestamp for freshness
    let latestQuoteTime: string | null = null;
    for (const q of deduplicatedQuotes) {
      if (!latestQuoteTime || new Date(q.quote_time).getTime() > new Date(latestQuoteTime).getTime()) {
        latestQuoteTime = q.quote_time;
      }
    }

    const freshnessState = determineFreshnessState(latestQuoteTime, nowEpoch);

    // Check post-listing freeze
    let isPostListingFrozen = false;
    if (input.isListingConfirmed && input.confirmedListingTimestamp) {
      const listingEpoch = new Date(input.confirmedListingTimestamp).getTime();
      if (!isNaN(listingEpoch) && nowEpoch >= listingEpoch) {
        isPostListingFrozen = true;
      }
    }

    const outliersQuarantined: GMPConsensusResult['outliersQuarantined'] = [];
    let consensusGmpValue: number | null = null;
    let confidenceLevel: IPOVerificationStatus = 'unverified';
    let sourceSpreadPct: number | null = null;

    // 3. Deterministic small-source reconciliation
    if (sourceCount === 0) {
      // 0 Sources
      consensusGmpValue = null;
      confidenceLevel = 'unverified';
      sourceSpreadPct = null;
    } else if (sourceCount === 1) {
      // 1 Source: Unverified
      consensusGmpValue = deduplicatedQuotes[0].reported_gmp_value;
      confidenceLevel = 'unverified';
      sourceSpreadPct = null;
    } else if (sourceCount === 2) {
      // 2 Sources: Zero/negative-safe spread check
      const s1 = deduplicatedQuotes[0].reported_gmp_value!;
      const s2 = deduplicatedQuotes[1].reported_gmp_value!;
      sourceSpreadPct = calculateSafeSpreadPct(s1, s2, GMP_POLICY_V1_2026_09.minReferenceDenom);

      if (sourceSpreadPct <= GMP_POLICY_V1_2026_09.maxSpreadPct) {
        consensusGmpValue = Math.round(((s1 + s2) / 2) * 100) / 100;
        confidenceLevel = 'verified';
      } else {
        // High spread divergence between 2 sources
        consensusGmpValue = Math.round(((s1 + s2) / 2) * 100) / 100;
        confidenceLevel = 'unverified';
        outliersQuarantined.push({
          sourceId: `${deduplicatedQuotes[0].gmp_source} vs ${deduplicatedQuotes[1].gmp_source}`,
          independenceGroup: 'DIVERGENT_PAIR',
          value: Math.abs(s1 - s2),
          reason: `Spread ${sourceSpreadPct}% exceeds maximum allowable threshold (${GMP_POLICY_V1_2026_09.maxSpreadPct}%). Flagged unverified.`,
        });
      }
    } else if (sourceCount === 3) {
      // 3 Sources: Median with pairwise outlier rejection
      const values = deduplicatedQuotes.map(q => q.reported_gmp_value!);
      const med = calculateMedian(values);

      const cleanQuotes: NormalizedGMPObservation[] = [];
      for (const q of deduplicatedQuotes) {
        const val = q.reported_gmp_value!;
        const devPct = calculateSafeSpreadPct(val, med, GMP_POLICY_V1_2026_09.minReferenceDenom);
        if (devPct > GMP_POLICY_V1_2026_09.maxSpreadPct) {
          outliersQuarantined.push({
            sourceId: q.gmp_source,
            independenceGroup: q.independence_group,
            value: val,
            reason: `Diverges by ${devPct}% from 3-source median (₹${med}). Quarantined.`,
          });
        } else {
          cleanQuotes.push(q);
        }
      }

      if (cleanQuotes.length >= 2) {
        const cleanVals = cleanQuotes.map(q => q.reported_gmp_value!);
        consensusGmpValue = Math.round(calculateMedian(cleanVals) * 100) / 100;
        confidenceLevel = 'verified';
        if (cleanVals.length === 2) {
          sourceSpreadPct = calculateSafeSpreadPct(cleanVals[0], cleanVals[1]);
        }
      } else {
        consensusGmpValue = med;
        confidenceLevel = 'unverified';
      }
    } else {
      // 4+ Sources: MAD with Zero-MAD Fallback Rule
      const rawValues = deduplicatedQuotes.map(q => q.reported_gmp_value!);
      const median = calculateMedian(rawValues);

      // Deviations from median
      const deviations = rawValues.map(v => Math.abs(v - median));
      const mad = calculateMedian(deviations);

      const cleanQuotes: NormalizedGMPObservation[] = [];

      for (const q of deduplicatedQuotes) {
        const val = q.reported_gmp_value!;
        const devAbs = Math.abs(val - median);

        let isOutlier = false;
        let outlierReason = '';

        if (mad === 0) {
          // Mandatory Rule 3: Zero-MAD Fallback
          // When all central points are identical, MAD is 0.
          // Fallback to secondary percentage/absolute deviation ceiling (30% from median)
          const devPct = calculateSafeSpreadPct(val, median, GMP_POLICY_V1_2026_09.minReferenceDenom);
          if (devPct > GMP_POLICY_V1_2026_09.maxSpreadPct) {
            isOutlier = true;
            outlierReason = `Zero-MAD dataset fallback: value ₹${val} exceeds 30% deviation ceiling (${devPct.toFixed(1)}% vs median ₹${median}). Quarantined.`;
          }
        } else {
          // Standard MAD: |Si - median| > 2 * MAD AND percentage deviation > 30%
          const madThreshold = GMP_POLICY_V1_2026_09.madMultiplier * mad;
          const devPct = calculateSafeSpreadPct(val, median, GMP_POLICY_V1_2026_09.minReferenceDenom);
          if (devAbs > madThreshold && devPct > GMP_POLICY_V1_2026_09.maxSpreadPct) {
            isOutlier = true;
            outlierReason = `Exceeds 2x MAD threshold (dev ₹${devAbs.toFixed(1)} > ₹${madThreshold.toFixed(1)}) and 30% spread ceiling. Quarantined.`;
          }
        }

        if (isOutlier) {
          outliersQuarantined.push({
            sourceId: q.gmp_source,
            independenceGroup: q.independence_group,
            value: val,
            reason: outlierReason,
          });
        } else {
          cleanQuotes.push(q);
        }
      }

      const cleanVals = cleanQuotes.map(q => q.reported_gmp_value!);
      if (cleanVals.length >= 2) {
        consensusGmpValue = Math.round(calculateMedian(cleanVals) * 100) / 100;
        confidenceLevel = 'verified';
        const minVal = Math.min(...cleanVals);
        const maxVal = Math.max(...cleanVals);
        sourceSpreadPct = calculateSafeSpreadPct(minVal, maxVal, GMP_POLICY_V1_2026_09.minReferenceDenom);
      } else {
        consensusGmpValue = median;
        confidenceLevel = 'unverified';
      }
    }

    // 4. Kostak & Subject to Sauda Reconciliation (Separate from GMP per share)
    const validKostakQuotes = input.observations
      .filter(o => o.anomaly_status !== 'invalid' && o.reported_kostak !== null && o.reported_kostak >= 0)
      .map(o => o.reported_kostak!);
    const kostakRate = validKostakQuotes.length > 0 ? calculateMedian(validKostakQuotes) : null;

    const validSaudaQuotes = input.observations
      .filter(o => o.anomaly_status !== 'invalid' && o.reported_subject_to_sauda !== null && o.reported_subject_to_sauda >= 0);
    const subjectToSaudaRate =
      validSaudaQuotes.length > 0
        ? calculateMedian(validSaudaQuotes.map(o => o.reported_subject_to_sauda!))
        : null;
    const saudaConditionNotes =
      validSaudaQuotes.find(o => o.sauda_condition_notes)?.sauda_condition_notes || null;

    // 5. Price Band Protection & Estimated Listing Calculations
    const referencePrice = input.priceBandHigh ?? input.issuePrice ?? null;
    let gmpPercentage: number | null = null;
    let estimatedListingPrice: number | null = null;
    let estimatedListingGainPct: number | null = null;

    if (consensusGmpValue !== null && referencePrice !== null && referencePrice > 0) {
      gmpPercentage = Math.round(((consensusGmpValue / referencePrice) * 100) * 100) / 100;
      estimatedListingPrice = Math.max(0, referencePrice + consensusGmpValue);
      estimatedListingGainPct = gmpPercentage;
    }

    // 6. Trend calculation against previous consensus
    let trendDirection: GMPTrendDirection = 'stable';
    let dayChangeValue = 0;
    let dayChangePct = 0;

    if (
      consensusGmpValue !== null &&
      input.previousConsensusGmp !== null &&
      input.previousConsensusGmp !== undefined
    ) {
      dayChangeValue = Math.round((consensusGmpValue - input.previousConsensusGmp) * 100) / 100;
      dayChangePct = calculateSafeSpreadPct(
        consensusGmpValue,
        input.previousConsensusGmp,
        GMP_POLICY_V1_2026_09.minReferenceDenom
      );
      if (dayChangeValue > 0) trendDirection = 'rising';
      else if (dayChangeValue < 0) trendDirection = 'falling';
      else trendDirection = 'stable';
    }

    return {
      ipoId: input.ipoId,
      snapshotDate: nowIso.split('T')[0],
      consensusGmpValue,
      gmpPercentage,
      estimatedListingPrice,
      estimatedListingGainPct,
      sourceCount,
      sourceSpreadPct,
      kostakRate,
      subjectToSaudaRate,
      saudaConditionNotes,
      trendDirection,
      dayChangeValue,
      dayChangePct,
      confidenceLevel,
      freshnessState,
      policyVersion: GMP_POLICY_V1_2026_09.policyVersion,
      isPostListingFrozen,
      outliersQuarantined,
    };
  }
}

export const gmpConsensusEngine = new GMPConsensusEngine();
