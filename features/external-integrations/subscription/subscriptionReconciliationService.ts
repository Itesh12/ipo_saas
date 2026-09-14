/**
 * features/external-integrations/subscription/subscriptionReconciliationService.ts
 *
 * Phase 9 Stage 3C: Multi-Exchange Subscription Reconciliation & DSE Authority (Revision 2.2).
 *
 * Rules:
 * 1. Double-count protection: checks feed_scope before combining.
 *    - exchange_specific + exchange_specific => sum into consolidated.
 *    - consolidated + consolidated => reconcile against Designated Stock Exchange (DSE), NEVER sum.
 *    - consolidated + exchange_specific => use consolidated; do not double-count.
 * 2. DSE Authority: Primary listed exchange takes precedence for canonical snapshot materialization.
 * 3. Conflict Detection: Discrepancy > 5% triggers conflict flag and halts silent snapshot mutation.
 */

import {
  NormalizedSubscriptionObservation,
  CategoryBidMetrics,
} from './subscriptionTypes';

export interface ReconciliationResult {
  isConflict: boolean;
  conflictReason?: string;
  authoritativeObservation: NormalizedSubscriptionObservation;
  reconciledFeedScope: 'consolidated' | 'exchange_specific';
  sourceComposition: string[];
}

export class SubscriptionReconciliationService {
  /**
   * Reconciles two observations (e.g. BSE and NSE) for the same IPO and bidding period.
   */
  public static reconcile(params: {
    obsA: NormalizedSubscriptionObservation;
    obsB: NormalizedSubscriptionObservation;
    designatedExchange?: string | null; // e.g. 'NSE' or 'BSE'
  }): ReconciliationResult {
    const { obsA, obsB, designatedExchange } = params;

    const dse = (designatedExchange || 'NSE').toUpperCase();

    // CASE 1: Both feeds are consolidated
    if (obsA.feed_scope === 'consolidated' && obsB.feed_scope === 'consolidated') {
      // STRICT INVARIANT: RECONCILE, NEVER SUM!
      const divergencePct =
        obsA.reported_overall_x > 0
          ? Math.abs(obsA.reported_overall_x - obsB.reported_overall_x) / obsA.reported_overall_x * 100
          : 0;

      if (divergencePct > 5.0) {
        // Material conflict detected
        const primary = obsA.exchange.toUpperCase() === dse ? obsA : obsB;
        return {
          isConflict: true,
          conflictReason: `Material divergence between consolidated feeds: ${obsA.exchange} reports ${obsA.reported_overall_x}x, ${obsB.exchange} reports ${obsB.reported_overall_x}x (${divergencePct.toFixed(2)}% variance).`,
          authoritativeObservation: primary,
          reconciledFeedScope: 'consolidated',
          sourceComposition: [obsA.exchange, obsB.exchange],
        };
      }

      // Within tolerance: DSE is preferred authority
      const authoritative = obsA.exchange.toUpperCase() === dse ? obsA : obsB;
      return {
        isConflict: false,
        authoritativeObservation: authoritative,
        reconciledFeedScope: 'consolidated',
        sourceComposition: [obsA.exchange, obsB.exchange],
      };
    }

    // CASE 2: Both feeds are exchange_specific (sum into consolidated)
    if (obsA.feed_scope === 'exchange_specific' && obsB.feed_scope === 'exchange_specific') {
      const combinedCategories: Record<string, CategoryBidMetrics> = {};
      const allCategories = new Set([
        ...Object.keys(obsA.category_details),
        ...Object.keys(obsB.category_details),
      ]);

      let totalSharesOffered = 0;
      let totalSharesBid = 0;

      for (const catKey of allCategories) {
        const catA = obsA.category_details[catKey];
        const catB = obsB.category_details[catKey];

        const canonical = (catA?.category || catB?.category)!;
        const sharesOffered = (catA?.shares_offered || 0) + (catB?.shares_offered || 0);
        const sharesBid = (catA?.shares_bid || 0) + (catB?.shares_bid || 0);
        const bidsCount = (catA?.bids_count || 0) + (catB?.bids_count || 0);
        const multiple = sharesOffered > 0 ? Math.round((sharesBid / sharesOffered) * 100) / 100 : 0;

        combinedCategories[catKey] = {
          category: canonical,
          shares_offered: sharesOffered,
          shares_bid: sharesBid,
          bids_count: bidsCount,
          subscription_x: multiple,
        };

        if (canonical !== 'ANCHOR') {
          totalSharesOffered += sharesOffered;
          totalSharesBid += sharesBid;
        }
      }

      const overallX =
        totalSharesOffered > 0
          ? Math.round((totalSharesBid / totalSharesOffered) * 100) / 100
          : Math.round(((obsA.reported_overall_x + obsB.reported_overall_x) / 2) * 100) / 100;

      const synthesized: NormalizedSubscriptionObservation = {
        ...obsA,
        exchange: 'CUMULATIVE',
        feed_scope: 'consolidated',
        source_composition: [obsA.exchange, obsB.exchange],
        reported_overall_x: overallX,
        computed_overall_x: overallX,
        category_details: combinedCategories,
        qib_x: combinedCategories['QIB']?.subscription_x ?? null,
        b_hni_x: combinedCategories['B_HNI']?.subscription_x ?? null,
        s_hni_x: combinedCategories['S_HNI']?.subscription_x ?? null,
        retail_x: combinedCategories['RETAIL']?.subscription_x ?? null,
        employee_x: combinedCategories['EMPLOYEE']?.subscription_x ?? null,
        shareholder_x: combinedCategories['SHAREHOLDER']?.subscription_x ?? null,
      };

      return {
        isConflict: false,
        authoritativeObservation: synthesized,
        reconciledFeedScope: 'consolidated',
        sourceComposition: [obsA.exchange, obsB.exchange],
      };
    }

    // CASE 3: One consolidated, one exchange_specific
    // Do NOT sum! Use the consolidated feed directly.
    const consolidatedObs = obsA.feed_scope === 'consolidated' ? obsA : obsB;
    return {
      isConflict: false,
      authoritativeObservation: consolidatedObs,
      reconciledFeedScope: 'consolidated',
      sourceComposition: [consolidatedObs.exchange],
    };
  }
}
