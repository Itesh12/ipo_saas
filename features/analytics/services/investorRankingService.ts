/**
 * features/analytics/services/investorRankingService.ts
 *
 * Phase 6: Explainable Investor Opportunity Ranking Engine
 * Contextual decision support prioritizing actionable IPOs by combining Phase 3 fundamental scores,
 * market momentum, bidding timeline urgency, and metric-aware freshness.
 * Strictly non-advisory; never provides buy/sell ratings.
 */

import { OpportunityRankingCard, FreshnessStatus, ScreenerRecord } from '../types/analytics.types';
import { IpoScreenerService } from './ipoScreenerService';

export class InvestorRankingService {
  /**
   * Evaluates metric-aware freshness for an IPO record based on its last intelligence update.
   */
  static evaluateFreshness(lastUpdated: string | null): FreshnessStatus {
    if (!lastUpdated) return 'stale';

    const elapsedMs = Date.now() - new Date(lastUpdated).getTime();
    if (elapsedMs < 24 * 60 * 60 * 1000) return 'fresh';
    if (elapsedMs < 7 * 24 * 60 * 60 * 1000) return 'recent';
    return 'stale';
  }

  /**
   * Computes empirical data completeness (0 to 100%).
   * Evaluates presence across 6 essential prospectus categories.
   */
  static calculateCompleteness(record: ScreenerRecord): number {
    let presentCategories = 0;
    const totalCategories = 6;

    // 1. Business Profile / Industry
    if (record.industry) presentCategories++;

    // 2. Financial History
    if (record.latest_revenue_cr !== null && record.latest_pat_margin_pct !== null) presentCategories++;

    // 3. Valuation Multiples
    if (record.pe_ratio_high !== null || record.pb_ratio !== null) presentCategories++;

    // 4. Fundamental Score
    if (record.overall_score !== null) presentCategories++;

    // 5. Subscription or Demand Data
    if (record.latest_subscription_x !== null || record.status === 'upcoming') presentCategories++;

    // 6. Pricing & Structure
    if (record.price_band_high !== null && record.lot_size > 0) presentCategories++;

    return Math.round((presentCategories / totalCategories) * 100);
  }

  /**
   * Generates positive drivers based on empirical data.
   */
  static extractPositiveDrivers(record: ScreenerRecord): string[] {
    const drivers: string[] = [];

    if (record.overall_score && record.overall_score >= 75) {
      drivers.push(`High fundamental research score (${record.overall_score}/100)`);
    }
    if (record.latest_revenue_growth_pct && record.latest_revenue_growth_pct >= 20) {
      drivers.push(`Strong revenue expansion (+${record.latest_revenue_growth_pct}% YoY)`);
    }
    if (record.latest_pat_margin_pct && record.latest_pat_margin_pct >= 12) {
      drivers.push(`Healthy net profit margin (${record.latest_pat_margin_pct}%)`);
    }
    if (record.latest_roe_pct && record.latest_roe_pct >= 15) {
      drivers.push(`Superior Return on Equity (${record.latest_roe_pct}% ROE)`);
    }
    if (
      record.pe_ratio_high &&
      record.industry_pe_median &&
      record.pe_ratio_high < record.industry_pe_median * 0.9
    ) {
      drivers.push(`Valuation discount to sector median (${record.pe_ratio_high}x vs ${record.industry_pe_median}x)`);
    }
    if (record.latest_qib_sub_x && record.latest_qib_sub_x >= 10) {
      drivers.push(`Strong institutional demand (${record.latest_qib_sub_x}x QIB subscription)`);
    }
    if (record.latest_gmp_gain_pct && record.latest_gmp_gain_pct >= 20) {
      drivers.push(`Elevated unofficial grey market sentiment (+${record.latest_gmp_gain_pct}%)`);
    }

    if (drivers.length === 0) {
      drivers.push('Standard statutory IPO disclosures available');
    }

    return drivers.slice(0, 4);
  }

  /**
   * Generates risk warnings based on empirical disclosures.
   */
  static extractRiskWarnings(record: ScreenerRecord): string[] {
    const warnings: string[] = [];

    if (record.high_risk_count > 0) {
      warnings.push(`${record.high_risk_count} high-severity operational/legal risk flag(s) identified in RHP`);
    }
    if (
      record.pe_ratio_high &&
      record.industry_pe_median &&
      record.pe_ratio_high > record.industry_pe_median * 1.2
    ) {
      warnings.push(`Premium valuation multiple (${record.pe_ratio_high}x vs ${record.industry_pe_median}x industry median)`);
    }
    if (record.ofs_cr && record.issue_size_cr && record.ofs_cr / record.issue_size_cr >= 0.5) {
      const ofsPct = Math.round((record.ofs_cr / record.issue_size_cr) * 100);
      warnings.push(`High promoter/investor exit component (OFS is ${ofsPct}% of issue size)`);
    }
    if (
      record.latest_total_debt_cr &&
      record.latest_net_worth_cr &&
      record.latest_net_worth_cr > 0 &&
      record.latest_total_debt_cr / record.latest_net_worth_cr > 1.2
    ) {
      warnings.push('Elevated balance sheet debt leverage relative to net worth');
    }
    if (record.is_insufficient_data) {
      warnings.push('Incomplete financial track record or pending disclosure statements');
    }

    if (warnings.length === 0) {
      warnings.push('No critical governance flags identified in preliminary prospectus');
    }

    return warnings.slice(0, 3);
  }

  /**
   * Generates ranked opportunity list from active and upcoming IPOs.
   */
  static async getRankedOpportunities(limit: number = 5): Promise<OpportunityRankingCard[]> {
    const screenerResult = await IpoScreenerService.queryScreener({
      status: ['open', 'upcoming'],
      sortBy: 'overall_score',
      sortDirection: 'desc',
      limit: 20,
    });

    const candidates = screenerResult.records;

    // Rank candidates by composite analytical weighting:
    // Base Score (0.50) + Subscription Velocity (0.30) + Valuation Multiplier (0.20)
    const scoredCandidates = candidates.map((rec) => {
      const baseScore = rec.overall_score || 50;
      let momentumBonus = 0;
      if (rec.latest_subscription_x) {
        momentumBonus = Math.min(20, rec.latest_subscription_x * 0.5);
      }
      let urgencyBonus = 0;
      if (rec.status === 'open') {
        urgencyBonus = 10;
      }

      const compositeRankScore = baseScore + momentumBonus + urgencyBonus;
      return {
        rec,
        compositeRankScore,
      };
    });

    scoredCandidates.sort((a, b) => b.compositeRankScore - a.compositeRankScore);

    const ranked: OpportunityRankingCard[] = scoredCandidates.slice(0, limit).map((item, idx) => {
      const r = item.rec;
      return {
        ipoId: r.id,
        slug: r.slug,
        symbol: r.symbol || 'DEMO',
        companyName: r.company_name,
        rank: idx + 1,
        overallScore: r.overall_score || 0,
        status: r.status,
        category: r.category,
        openDate: r.open_date,
        closeDate: r.close_date,
        minInvestment: r.min_investment,
        positiveDrivers: this.extractPositiveDrivers(r),
        riskWarnings: this.extractRiskWarnings(r),
        freshnessStatus: this.evaluateFreshness(r.last_intelligence_update),
        dataCompletenessPct: this.calculateCompleteness(r),
        asOf: r.last_intelligence_update || new Date().toISOString(),
        isIllustrativeDemo: false,
      };
    });

    return ranked;
  }
}
