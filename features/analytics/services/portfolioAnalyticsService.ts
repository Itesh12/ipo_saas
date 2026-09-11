/**
 * features/analytics/services/portfolioAnalyticsService.ts
 *
 * Phase 6: Portfolio Allocation & Capital Analytics Service
 * Pure read-only consumer of Phase 5 financial truth.
 * Implements dual-mode Herfindahl-Hirschman Index (HHI) with valuation coverage disclosure,
 * sector allocation, and capital-aware context.
 */

import {
  PortfolioValuationService,
  type OwnershipScope,
} from '@/features/finance/services/portfolioValuationService';
import type { HoldingItem } from '@/features/finance/types/finance.types';
import {
  PortfolioConcentrationReport,
  SectorExposureItem,
  CurrentBookLiquidityContext,
} from '../types/analytics.types';

export class PortfolioAnalyticsService {
  /**
   * Pure calculation of dual-mode HHI and sector breakdown from holdings array.
   */
  static calculateConcentrationFromHoldings(
    holdings: HoldingItem[],
    scope: string = 'personal'
  ): PortfolioConcentrationReport {
    // Strictly isolate external tracked holdings from personal/family concentration calculations
    const eligibleHoldings = holdings.filter((h) => !h.isExternalTracked);

    if (!eligibleHoldings || eligibleHoldings.length === 0) {
      return {
        primaryHhiMarketValue: null,
        marketValueCoveragePct: 0,
        isMarketValuePartial: false,
        fallbackHhiInvestedCost: 0,
        concentrationClassification: 'low',
        topHoldingWeightPct: 0,
        topSectorWeightPct: 0,
        sectorBreakdown: [],
        ownershipScope: scope,
        evaluatedAt: new Date().toISOString(),
      };
    }

    // 1. Group by Sector / Industry
    const sectorMap = new Map<
      string,
      {
        investedCost: number;
        marketValue: number | null;
        count: number;
      }
    >();

    let totalInvestedCost = 0;
    let totalPricedMarketValue = 0;
    let pricedPositionsCount = 0;

    for (const h of eligibleHoldings) {
      const name = (h.companyName || '').toLowerCase();
      const sector = name.includes('energy') || name.includes('energies') || name.includes('solar') || name.includes('power')
        ? 'Renewable Energy'
        : name.includes('finance') || name.includes('housing') || name.includes('bank')
        ? 'Financial Services'
        : name.includes('forging') || name.includes('steel')
        ? 'Engineering & Manufacturing'
        : 'Diversified Industrials';

      const prev = sectorMap.get(sector) || { investedCost: 0, marketValue: null, count: 0 };

      const newInvested = Math.round((prev.investedCost + h.totalInvestedCost) * 100) / 100;
      let newMarketValue: number | null = prev.marketValue;

      if (h.marketValue !== null) {
        newMarketValue = Math.round(((prev.marketValue || 0) + h.marketValue) * 100) / 100;
        totalPricedMarketValue = Math.round((totalPricedMarketValue + h.marketValue) * 100) / 100;
        pricedPositionsCount++;
      }

      totalInvestedCost = Math.round((totalInvestedCost + h.totalInvestedCost) * 100) / 100;

      sectorMap.set(sector, {
        investedCost: newInvested,
        marketValue: newMarketValue,
        count: prev.count + 1,
      });
    }

    // 2. Compute Sector Breakdown Items
    const sectorBreakdown: SectorExposureItem[] = [];

    for (const [sector, data] of sectorMap.entries()) {
      const investedPct = totalInvestedCost > 0
        ? Math.round((data.investedCost / totalInvestedCost) * 10000) / 100
        : 0;

      const marketValuePct = totalPricedMarketValue > 0 && data.marketValue !== null
        ? Math.round((data.marketValue / totalPricedMarketValue) * 10000) / 100
        : null;

      sectorBreakdown.push({
        sector,
        investedCost: data.investedCost,
        investedPct,
        marketValue: data.marketValue,
        marketValuePct,
        securitiesCount: data.count,
      });
    }

    sectorBreakdown.sort((a, b) => b.investedCost - a.investedCost);

    // 3. Dual-Mode HHI Computation
    // A. Fallback Invested-Cost HHI: sum of (costWeightPct)^2
    let fallbackHhiCost = 0;
    for (const s of sectorBreakdown) {
      fallbackHhiCost += Math.pow(s.investedPct, 2);
    }
    fallbackHhiCost = Math.round(fallbackHhiCost);

    // B. Primary Market-Value HHI: sum of (marketWeightPct)^2
    let primaryHhiMarket: number | null = null;
    if (totalPricedMarketValue > 0 && pricedPositionsCount > 0) {
      let sumSq = 0;
      for (const s of sectorBreakdown) {
        if (s.marketValuePct !== null) {
          sumSq += Math.pow(s.marketValuePct, 2);
        }
      }
      primaryHhiMarket = Math.round(sumSq);
    }

    const valuationCoveragePct = eligibleHoldings.length > 0
      ? Math.round((pricedPositionsCount / eligibleHoldings.length) * 10000) / 100
      : 0;
    const isMarketValuePartial = valuationCoveragePct < 100;

    // 4. Concentration Classification (Low <1500, Moderate 1500-2500, High >2500)
    const activeHhi = primaryHhiMarket !== null && valuationCoveragePct >= 70
      ? primaryHhiMarket
      : fallbackHhiCost;

    let concentrationClassification: 'low' | 'moderate' | 'high' = 'low';
    if (activeHhi > 2500) {
      concentrationClassification = 'high';
    } else if (activeHhi >= 1500) {
      concentrationClassification = 'moderate';
    }

    // Top holding and top sector weight
    const topSectorWeightPct = sectorBreakdown.length > 0 ? sectorBreakdown[0].investedPct : 0;
    const sortedHoldings = [...eligibleHoldings].sort((a, b) => b.totalInvestedCost - a.totalInvestedCost);
    const topHoldingWeightPct = totalInvestedCost > 0 && sortedHoldings.length > 0
      ? Math.round((sortedHoldings[0].totalInvestedCost / totalInvestedCost) * 10000) / 100
      : 0;

    return {
      primaryHhiMarketValue: primaryHhiMarket,
      marketValueCoveragePct: valuationCoveragePct,
      isMarketValuePartial,
      fallbackHhiInvestedCost: fallbackHhiCost,
      concentrationClassification,
      topHoldingWeightPct,
      topSectorWeightPct,
      sectorBreakdown,
      ownershipScope: scope,
      evaluatedAt: new Date().toISOString(),
    };
  }

  /**
   * Generates a comprehensive portfolio concentration and sector allocation report.
   * Respects Phase 5 ownership scopes and strictly isolates external tracked holdings.
   */
  static async getConcentrationReport(
    userId: string,
    scope: OwnershipScope = 'personal',
    applicantId?: string | null
  ): Promise<PortfolioConcentrationReport> {
    const { holdings } = await PortfolioValuationService.getUserPortfolioHoldings(
      userId,
      scope,
      applicantId
    );

    return this.calculateConcentrationFromHoldings(holdings, scope);
  }

  /**
   * Retrieves sector breakdown for a user.
   */
  static async getSectorExposure(
    userId: string,
    scope: OwnershipScope = 'personal',
    applicantId?: string | null
  ): Promise<SectorExposureItem[]> {
    const report = await this.getConcentrationReport(userId, scope, applicantId);
    return report.sectorBreakdown;
  }

  /**
   * Pure calculation of capital feasibility given liquid cash, lien, and required lot size.
   */
  static calculateCapitalFeasibility(
    availableCash: number,
    blockedLien: number,
    requiredLotInvestment: number
  ): CurrentBookLiquidityContext {
    const availableBookCash = availableCash;
    const encumberedLienCash = blockedLien;
    const totalLiquidAndEncumberedCash = Math.round((availableBookCash + encumberedLienCash) * 100) / 100;

    const isSufficient = availableBookCash >= requiredLotInvestment;
    const deficitOrSurplus = Math.round((availableBookCash - requiredLotInvestment) * 100) / 100;

    return {
      availableBookCash,
      encumberedLienCash,
      totalLiquidAndEncumberedCash,
      isSufficientForLot: isSufficient,
      requiredLotInvestment,
      cashDeficitOrSurplus: deficitOrSurplus,
      accountSource: 'Account 1010 (Bank: Available Cash)',
      auditProvenanceNotice:
        'Current book liquidity is derived from the platform double-entry General Ledger and user-declared opening balances. It is NOT verified against your actual bank account.',
    };
  }

  /**
   * Evaluates current book liquidity against an IPO's required lot investment.
   * Strictly non-advisory; surfaces ledger balance without manufacturing cash.
   */
  static async evaluateCapitalFeasibility(
    userId: string,
    requiredLotInvestment: number
  ): Promise<CurrentBookLiquidityContext> {
    const capital = await PortfolioValuationService.getUserCapitalBreakdown(userId);
    return this.calculateCapitalFeasibility(capital.availableCash, capital.blockedLien, requiredLotInvestment);
  }
}
