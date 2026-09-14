/**
 * features/external-integrations/subscription/allotmentIntelligenceService.ts
 *
 * Phase 9 Stage 3C: Allotment Intelligence Service (Revision 2.2).
 *
 * Enforces:
 * 1. Clean separation between Official Basis Facts and Pre-Basis Derived Estimates.
 * 2. Mandatory disclaimer on all derived allotment estimates (never claim official probability).
 * 3. Zero silent mutation of canonical IPO dates (dates are recorded as proposed_allotment_date).
 * 4. Zero mutation of Phase 4 user applications (macro market-level intelligence only).
 */

import {
  OfficialAllotmentFactPayload,
  DerivedAllotmentEstimatePayload,
} from './subscriptionTypes';

export class AllotmentIntelligenceService {
  /**
   * Derives pre-basis allotment estimates from the final subscription snapshot.
   * Explicitly carries the mandatory disclaimer.
   */
  public static computePreBasisEstimates(params: {
    ipoId: string;
    finalSubscriptionSnapshotId?: string | null;
    retailX: number | null;
  }): DerivedAllotmentEstimatePayload {
    const { ipoId, finalSubscriptionSnapshotId, retailX } = params;

    const actualRetailX = retailX && retailX > 0 ? retailX : 1.0;
    const lotteryRatio = Math.max(1.0, Math.round(actualRetailX * 100) / 100);
    const probabilityPct = Math.min(100.0, Math.round((1 / lotteryRatio) * 10000) / 100);

    return {
      ipo_id: ipoId,
      final_subscription_snapshot_id: finalSubscriptionSnapshotId || null,
      estimated_retail_subscription_x: actualRetailX,
      estimated_retail_lottery_ratio: lotteryRatio,
      estimated_retail_allotment_probability_pct: probabilityPct,
      estimation_disclaimer:
        'Simplified mathematical indicator based on final bidding multiples. Official allotment odds are governed by the Registrar Basis of Allotment.',
    };
  }

  /**
   * Validates and prepares official allotment facts extracted from verified Stage 3B Basis of Allotment document.
   */
  public static normalizeOfficialBasisFacts(params: {
    ipoId: string;
    basisDocumentId: string;
    totalValidApplications: number;
    totalRejectedApplications: number;
    retailValidApplications: number;
    retailSuccessfulApplicants: number;
    shniValidApplications?: number | null;
    shniSuccessfulApplicants?: number | null;
    bhniProportionateFactor?: number | null;
    proposedAllotmentDate?: string | null;
    proposedListingDate?: string | null;
    verifiedByObservationId?: string | null;
  }): OfficialAllotmentFactPayload {
    const {
      ipoId,
      basisDocumentId,
      totalValidApplications,
      totalRejectedApplications,
      retailValidApplications,
      retailSuccessfulApplicants,
      shniValidApplications,
      shniSuccessfulApplicants,
      bhniProportionateFactor,
      proposedAllotmentDate,
      proposedListingDate,
      verifiedByObservationId,
    } = params;

    const retailRatio =
      retailSuccessfulApplicants > 0
        ? Math.round((retailValidApplications / retailSuccessfulApplicants) * 10000) / 10000
        : 1.0;

    const shniRatio =
      shniValidApplications && shniSuccessfulApplicants && shniSuccessfulApplicants > 0
        ? Math.round((shniValidApplications / shniSuccessfulApplicants) * 10000) / 10000
        : null;

    return {
      ipo_id: ipoId,
      basis_document_id: basisDocumentId,
      official_total_valid_applications: totalValidApplications,
      official_total_rejected_applications: totalRejectedApplications,
      official_retail_valid_applications: retailValidApplications,
      official_retail_successful_applicants: retailSuccessfulApplicants,
      official_retail_lottery_ratio: retailRatio,
      official_shni_valid_applications: shniValidApplications ?? null,
      official_shni_successful_applicants: shniSuccessfulApplicants ?? null,
      official_shni_lottery_ratio: shniRatio,
      official_bhni_proportionate_factor: bhniProportionateFactor ?? null,
      proposed_allotment_date: proposedAllotmentDate ?? null,
      proposed_listing_date: proposedListingDate ?? null,
      verified_by_observation_id: verifiedByObservationId ?? null,
    };
  }

  /**
   * Helper to format lottery ratio for institutional-grade display.
   * e.g. "1 in 14.52 applicants (6.89%)"
   */
  public static formatLotteryOdds(ratio: number): string {
    if (ratio <= 1.0) {
      return 'All valid applicants allotted (1:1)';
    }
    const pct = ((1 / ratio) * 100).toFixed(2);
    return `1 in ${ratio.toFixed(2)} applicants (${pct}%)`;
  }
}
