/**
 * features/notifications/services/evaluators/evaluatePortfolioHHI.ts
 *
 * Phase 7B: Portfolio Concentration (HHI) Warning Evaluator
 * Strictly reuses authoritative Phase 6 PortfolioAnalyticsService.
 * Does NOT implement any competing HHI formula.
 *
 * Invariants Preserved:
 * - Excludes is_external_tracked holdings
 * - Market-value primary HHI when valuation coverage >= 70%
 * - Invested-cost fallback HHI when coverage < 70%
 * - Emits warning only when effective HHI >= 2,500 (high concentration)
 */

import { PortfolioAnalyticsService } from '@/features/analytics/services/portfolioAnalyticsService';
import type { HoldingItem } from '@/features/finance/types/finance.types';

export interface PortfolioHHIEvaluationResult {
  shouldAlert: boolean;
  effectiveHHI: number;
  isFallback: boolean;
  coveragePct: number;
  topSector: string;
  topSectorWeightPct: number;
  idempotencyKey?: string;
  eventPayload?: Record<string, unknown>;
}

export class PortfolioHHIEvaluator {
  static readonly HHI_THRESHOLD = 2500; // Moderate to High concentration barrier

  /**
   * Evaluates user holdings using authoritative Phase 6 service.
   */
  static evaluateHoldings(
    userId: string,
    holdings: HoldingItem[],
    dateStr: string = new Date().toISOString().split('T')[0]
  ): PortfolioHHIEvaluationResult {
    // 1. Authoritative Phase 6 concentration calculation
    // Strictly inherits external-tracked exclusion, dual-mode HHI, and valuation coverage
    const report = PortfolioAnalyticsService.calculateConcentrationFromHoldings(holdings, 'personal');

    // 2. Determine effective HHI score based on Phase 6 coverage rules
    const effectiveHHI = report.isMarketValuePartial
      ? report.fallbackHhiInvestedCost
      : (report.primaryHhiMarketValue ?? report.fallbackHhiInvestedCost);

    const shouldAlert = report.concentrationClassification === 'high';

    const topSector = report.sectorBreakdown[0]?.sector || 'Top Sector';
    const topWeight = report.sectorBreakdown[0]?.investedPct || report.topSectorWeightPct;

    if (!shouldAlert) {
      return {
        shouldAlert: false,
        effectiveHHI,
        isFallback: report.isMarketValuePartial,
        coveragePct: report.marketValueCoveragePct,
        topSector,
        topSectorWeightPct: topWeight,
      };
    }

    return {
      shouldAlert: true,
      effectiveHHI,
      isFallback: report.isMarketValuePartial,
      coveragePct: report.marketValueCoveragePct,
      topSector,
      topSectorWeightPct: topWeight,
      idempotencyKey: `hhi:warning:${userId}:${dateStr}`,
      eventPayload: {
        user_id: userId,
        hhi_score: effectiveHHI,
        top_sector: topSector,
        top_sector_weight_pct: topWeight,
        is_fallback: report.isMarketValuePartial,
        coverage_pct: report.marketValueCoveragePct,
        classification: report.concentrationClassification,
      },
    };
  }
}
