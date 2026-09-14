/**
 * features/external-integrations/subscription/subscriptionValidator.ts
 *
 * Phase 9 Stage 3C: Source-Aware Mathematical Parity & Anomaly Validation (Revision 2.2).
 *
 * Enforces:
 * 1. Profiles: BSE_V1, NSE_V1, CUMULATIVE_V1.
 * 2. Multi-tier anomaly evaluation (valid, valid_with_adjustment, anomalous, source_corrected, invalid).
 * 3. Invariant: Anchor allocation is strictly excluded from cumulative parity.
 * 4. Invariant: Multiples must be non-negative.
 */

import {
  CategoryBidMetrics,
  SubscriptionValidationResult,
  SubscriptionAnomalyStatus,
} from './subscriptionTypes';

export type ValidationProfileName = 'BSE_V1' | 'NSE_V1' | 'CUMULATIVE_V1';

export class SubscriptionValidator {
  /**
   * Validates a normalized subscription observation against its designated source profile.
   */
  public static validate(params: {
    profile: ValidationProfileName;
    reportedOverallX: number;
    categories: Record<string, CategoryBidMetrics>;
    previousObservationTotalBids?: number | null;
    isCorrigendum?: boolean;
  }): SubscriptionValidationResult {
    const {
      profile,
      reportedOverallX,
      categories,
      previousObservationTotalBids,
      isCorrigendum = false,
    } = params;

    // 1. Non-negativity check
    if (reportedOverallX < 0) {
      return {
        is_valid: false,
        anomaly_status: 'invalid',
        anomaly_reason: 'Reported overall subscription multiple is negative.',
        reported_overall_x: reportedOverallX,
        computed_overall_x: 0,
        calculation_basis: 'net_offer',
        tolerance_pct: 5.0,
        delta_pct: 100,
      };
    }

    for (const [catKey, cat] of Object.entries(categories)) {
      if (cat.subscription_x < 0 || cat.shares_bid < 0 || cat.shares_offered < 0) {
        return {
          is_valid: false,
          anomaly_status: 'invalid',
          anomaly_reason: `Category ${catKey} contains negative metrics.`,
          reported_overall_x: reportedOverallX,
          computed_overall_x: 0,
          calculation_basis: 'net_offer',
          tolerance_pct: 5.0,
          delta_pct: 100,
        };
      }
    }

    // 2. Sum valid categories (strictly EXCLUDING Anchor)
    let totalSharesOffered = 0;
    let totalSharesBid = 0;

    for (const cat of Object.values(categories)) {
      if (cat.category === 'ANCHOR') {
        // Strict Invariant: Anchor allocations are excluded from cumulative bidding parity
        continue;
      }
      totalSharesOffered += cat.shares_offered;
      totalSharesBid += cat.shares_bid;
    }

    const computedOverallX =
      totalSharesOffered > 0
        ? Math.round((totalSharesBid / totalSharesOffered) * 100) / 100
        : 0;

    const calculationBasis =
      profile === 'BSE_V1'
        ? 'bse_net_offer'
        : profile === 'NSE_V1'
        ? 'nse_category_shares'
        : 'cumulative_consolidated';

    const tolerancePct = profile === 'CUMULATIVE_V1' ? 7.5 : 5.0;

    // 3. Mathematical Parity Delta
    let deltaPct = 0;
    if (reportedOverallX > 0 && computedOverallX > 0) {
      deltaPct =
        Math.round((Math.abs(computedOverallX - reportedOverallX) / reportedOverallX) * 10000) / 100;
    } else if (reportedOverallX > 0 || computedOverallX > 0) {
      deltaPct = 100;
    }

    // 4. Progression / Monotonic check against previous snapshot
    let progressionAnomaly: string | null = null;
    let isSmallCancellation = false;

    if (previousObservationTotalBids !== undefined && previousObservationTotalBids !== null && previousObservationTotalBids > 0) {
      if (totalSharesBid < previousObservationTotalBids) {
        const dropPct = ((previousObservationTotalBids - totalSharesBid) / previousObservationTotalBids) * 100;
        if (dropPct <= 2.0) {
          isSmallCancellation = true;
        } else {
          progressionAnomaly = `Total cumulative shares bid dropped by ${dropPct.toFixed(2)}% compared to previous observation.`;
        }
      }
    }

    // 5. Evaluate Anomaly Status
    let anomalyStatus: SubscriptionAnomalyStatus = 'valid';
    let anomalyReason: string | undefined = undefined;

    if (isCorrigendum) {
      anomalyStatus = 'source_corrected';
      anomalyReason = 'Official exchange corrigendum / addendum applied.';
    } else if (progressionAnomaly) {
      anomalyStatus = 'anomalous';
      anomalyReason = progressionAnomaly;
    } else if (deltaPct > 10.0) {
      anomalyStatus = 'anomalous';
      anomalyReason = `Mathematical parity discrepancy: computed ${computedOverallX}x vs reported ${reportedOverallX}x (${deltaPct}% delta exceeds 10% threshold).`;
    } else if (deltaPct > tolerancePct || isSmallCancellation) {
      anomalyStatus = 'valid_with_adjustment';
      anomalyReason = isSmallCancellation
        ? 'Minor technical bid cancellation (<2%) observed.'
        : `Slight variance (${deltaPct}%) within acceptable adjustment window.`;
    }

    const isValid = true;

    return {
      is_valid: isValid,
      anomaly_status: anomalyStatus,
      anomaly_reason: anomalyReason,
      reported_overall_x: reportedOverallX,
      computed_overall_x: computedOverallX,
      calculation_basis: calculationBasis,
      tolerance_pct: tolerancePct,
      delta_pct: deltaPct,
    };
  }
}
