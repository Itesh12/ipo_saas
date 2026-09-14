/**
 * features/external-integrations/subscription/nseSubscriptionAdapter.ts
 *
 * Phase 9 Stage 3C: NSE Live IPO Bidding Adapter (Revision 2.2).
 * Normalizes raw NSE bidding API / page data into canonical subscription structures.
 */

import {
  RawExchangeSubscriptionPayload,
  CategoryBidMetrics,
  NormalizedSubscriptionObservation,
  SubscriptionFeedScope,
} from './subscriptionTypes';
import { SubscriptionTaxonomy } from './subscriptionTaxonomy';
import { SubscriptionValidator } from './subscriptionValidator';

export class NseSubscriptionAdapter {
  public static readonly SOURCE_NAME = 'nse' as const;
  public static readonly BASE_URL = 'https://www.nseindia.com/market-data/all-upcoming-issues-ipo';

  /**
   * Normalizes raw NSE cumulative bidding payload into a durable subscription observation.
   */
  public static normalize(params: {
    raw: RawExchangeSubscriptionPayload;
    ipoId: string;
    sourceObservationId?: string | null;
    sourceObservationUid: string;
    sourceObservationHash: string;
    rawPayloadHash: string;
    previousObservationTotalBids?: number | null;
  }): NormalizedSubscriptionObservation {
    const {
      raw,
      ipoId,
      sourceObservationId,
      sourceObservationUid,
      sourceObservationHash,
      rawPayloadHash,
      previousObservationTotalBids,
    } = params;

    const categoriesMap: Record<string, CategoryBidMetrics> = {};
    let anchorAdjustmentApplied = false;

    for (const row of raw.categories) {
      const canonicalCategory = SubscriptionTaxonomy.resolveCategory(row.categoryName);
      if (!canonicalCategory) continue;

      const sharesOffered = SubscriptionTaxonomy.parseNumber(row.sharesOffered);
      const sharesBid = SubscriptionTaxonomy.parseNumber(row.sharesBid);
      const bidsCount = SubscriptionTaxonomy.parseNumber(row.bidsCount);
      const multiple = SubscriptionTaxonomy.computeMultiple(sharesBid, sharesOffered);
      const amountBidCr = row.amountBidCr ? SubscriptionTaxonomy.parseNumber(row.amountBidCr) : undefined;

      if (canonicalCategory === 'ANCHOR') {
        anchorAdjustmentApplied = true;
      }

      categoriesMap[canonicalCategory] = {
        category: canonicalCategory,
        shares_offered: sharesOffered,
        shares_bid: sharesBid,
        bids_count: bidsCount,
        subscription_x: multiple,
        amount_bid_cr: amountBidCr,
      };
    }

    const reportedOverall = SubscriptionTaxonomy.parseNumber(raw.reportedOverallMultiple);

    // Validate using NSE_V1 profile
    const validation = SubscriptionValidator.validate({
      profile: 'NSE_V1',
      reportedOverallX: reportedOverall,
      categories: categoriesMap,
      previousObservationTotalBids,
    });

    const qib = categoriesMap['QIB']?.subscription_x ?? null;
    const bHni = categoriesMap['B_HNI']?.subscription_x ?? null;
    const sHni = categoriesMap['S_HNI']?.subscription_x ?? null;
    const retail = categoriesMap['RETAIL']?.subscription_x ?? null;
    const employee = categoriesMap['EMPLOYEE']?.subscription_x ?? null;
    const shareholder = categoriesMap['SHAREHOLDER']?.subscription_x ?? null;

    const feedScope: SubscriptionFeedScope = raw.feedScope || 'consolidated';

    return {
      ipo_id: ipoId,
      source_observation_id: sourceObservationId || null,
      source_observation_uid: sourceObservationUid,
      source_observation_hash: sourceObservationHash,
      exchange: 'NSE',
      feed_scope: feedScope,
      source_composition: ['NSE'],
      day_number: raw.dayNumber,
      snapshot_time: raw.asOfTimestamp || new Date().toISOString(),
      reported_overall_x: reportedOverall,
      computed_overall_x: validation.computed_overall_x,
      calculation_basis: validation.calculation_basis,
      tolerance_pct: validation.tolerance_pct,
      anomaly_status: validation.anomaly_status,
      anomaly_reason: validation.anomaly_reason,
      source_qib_definition: 'net_of_anchor',
      definition_verified: true,
      anchor_adjustment_applied: anchorAdjustmentApplied,
      qib_x: qib,
      b_hni_x: bHni,
      s_hni_x: sHni,
      retail_x: retail,
      employee_x: employee,
      shareholder_x: shareholder,
      category_details: categoriesMap,
      validation_status: 'unverified',
      raw_payload_hash: rawPayloadHash,
      is_corrected: false,
      is_final_for_day: Boolean(raw.isSessionClosed),
      session_close_source: raw.isSessionClosed ? 'NSE Live IPO Session Close' : null,
    };
  }
}
