/**
 * features/notifications/services/evaluators/evaluateSavedScreens.ts
 *
 * Phase 7B: Saved-Screen Matching Evaluator
 * Re-evaluates user saved screens against published IPOs in v_ipo_screener_universe.
 * Leverages persistent notification_screen_matches table to identify first-time matches
 * deterministically without ambiguous "yesterday" logic.
 */

import { ScreenerRecord, ScreenerFilterPayload } from '@/features/analytics/types/analytics.types';
import { IPOCategory, IPOIssueType, IPOStatus } from '@/features/ipo/types/ipo.types';

export interface SavedScreenItem {
  id: string;
  userId: string;
  name: string;
  filterConfig: ScreenerFilterPayload;
}

export interface ScreenMatchEvent {
  eventType: 'saved_screen_match';
  eventClass: 'condition_driven';
  idempotencyKey: string;
  aggregateType: 'saved_screens';
  aggregateId: string;
  userId: string;
  payload: {
    screen_id: string;
    screen_name: string;
    ipo_id: string;
    company_name: string;
    symbol: string | null;
    slug: string;
    overall_score?: number | null;
  };
}

export class SavedScreenEvaluator {
  /**
   * Pure evaluation of candidates against a saved screen's filter config.
   */
  static matchesFilter(candidate: ScreenerRecord, filter: ScreenerFilterPayload): boolean {
    // 1. Category
    if (filter.category && filter.category.length > 0) {
      if (!filter.category.includes(candidate.category as IPOCategory)) return false;
    }

    // 2. Issue Type
    if (filter.issueType && filter.issueType.length > 0) {
      if (!filter.issueType.includes(candidate.issue_type as IPOIssueType)) return false;
    }

    // 3. Status
    if (filter.status && filter.status.length > 0) {
      if (!filter.status.includes(candidate.status as IPOStatus)) return false;
    }

    // 4. Overall Score
    if (filter.overallScoreMin !== undefined) {
      if (candidate.overall_score === null || candidate.overall_score < filter.overallScoreMin) return false;
    }

    // 5. P/E Ratio High
    if (filter.peRatioMax !== undefined) {
      if (candidate.pe_ratio_high === null || candidate.pe_ratio_high > filter.peRatioMax) return false;
    }

    // 6. Subscription X
    if (filter.subscriptionMinX !== undefined) {
      if (candidate.latest_subscription_x === null || candidate.latest_subscription_x < filter.subscriptionMinX) return false;
    }

    // 7. GMP Gain %
    if (filter.gmpGainMinPct !== undefined) {
      if (candidate.latest_gmp_gain_pct === null || candidate.latest_gmp_gain_pct < filter.gmpGainMinPct) return false;
    }

    return true;
  }

  /**
   * Evaluates screens against universe candidates and identifies newly matched items
   * that do not exist in the persistent knownMatches set.
   */
  static evaluateScreens(params: {
    screens: SavedScreenItem[];
    candidates: ScreenerRecord[];
    knownMatches: Set<string>; // Set of `${screen_id}:${ipo_id}`
  }): { newMatches: ScreenMatchEvent[]; matchPairsToPersist: Array<{ screenId: string; ipoId: string }> } {
    const { screens, candidates, knownMatches } = params;
    const newMatches: ScreenMatchEvent[] = [];
    const matchPairsToPersist: Array<{ screenId: string; ipoId: string }> = [];

    for (const screen of screens) {
      for (const ipo of candidates) {
        const pairKey = `${screen.id}:${ipo.id}`;
        const isMatched = this.matchesFilter(ipo, screen.filterConfig);

        if (isMatched && !knownMatches.has(pairKey)) {
          // Newly matched IPO!
          matchPairsToPersist.push({ screenId: screen.id, ipoId: ipo.id });
          newMatches.push({
            eventType: 'saved_screen_match',
            eventClass: 'condition_driven',
            idempotencyKey: `screen:match:${screen.id}:${ipo.id}`,
            aggregateType: 'saved_screens',
            aggregateId: screen.id,
            userId: screen.userId,
            payload: {
              screen_id: screen.id,
              screen_name: screen.name,
              ipo_id: ipo.id,
              company_name: ipo.company_name,
              symbol: ipo.symbol,
              slug: ipo.slug,
              overall_score: ipo.overall_score,
            },
          });
        }
      }
    }

    return { newMatches, matchPairsToPersist };
  }
}
