/**
 * features/analytics/services/screenerFilterEngine.ts
 *
 * Phase 6: Pure In-Memory Screener Filter Engine
 * Client-safe and server-safe pure filtering implementation.
 * Zero database or Next.js headers dependencies.
 */

import {
  ScreenerFilterPayload,
  ScreenerRecord,
  ScreenerResult,
} from '../types/analytics.types';

// Fallback development records for offline/seed development
export const DEV_SCREENER_SEED: ScreenerRecord[] = [
  {
    id: 'a1111111-1111-1111-1111-111111111111',
    slug: 'premier-energies-limited',
    company_name: 'Premier Energies Limited',
    symbol: 'PREMIERENE',
    category: 'mainboard',
    issue_type: 'book_building',
    status: 'open',
    price_band_low: 427.0,
    price_band_high: 450.0,
    lot_size: 33,
    min_investment: 14850.0,
    issue_size_cr: 2830.4,
    fresh_issue_cr: 1291.4,
    ofs_cr: 1539.0,
    open_date: '2026-09-08',
    close_date: '2026-09-12',
    allotment_date: '2026-09-15',
    listing_date: '2026-09-18',
    pe_ratio_high: 34.2,
    pb_ratio: 4.8,
    ev_ebitda: 18.5,
    industry_pe_median: 28.0,
    latest_financial_year: 'FY24',
    latest_revenue_cr: 3143.7,
    latest_revenue_growth_pct: 120.5,
    latest_pat_margin_pct: 12.2,
    latest_roe_pct: 22.4,
    latest_roce_pct: 24.1,
    latest_total_debt_cr: 450.0,
    latest_net_worth_cr: 1200.0,
    overall_score: 84.0,
    financial_health_score: 22.0,
    valuation_score: 14.0,
    subscription_demand_score: 15.0,
    market_sentiment_score: 14.0,
    is_insufficient_data: false,
    industry: 'Solar & Renewable Energy',
    latest_gmp_value: 120.0,
    latest_gmp_gain_pct: 26.67,
    latest_subscription_x: 74.3,
    latest_retail_sub_x: 25.1,
    latest_qib_sub_x: 216.5,
    high_risk_count: 1,
    last_intelligence_update: '2026-09-10T10:00:00Z',
  },
  {
    id: 'b2222222-2222-2222-2222-222222222222',
    slug: 'bajaj-housing-finance-limited',
    company_name: 'Bajaj Housing Finance Limited',
    symbol: 'BAJAJHFL',
    category: 'mainboard',
    issue_type: 'book_building',
    status: 'upcoming',
    price_band_low: 66.0,
    price_band_high: 70.0,
    lot_size: 214,
    min_investment: 14980.0,
    issue_size_cr: 6560.0,
    fresh_issue_cr: 3560.0,
    ofs_cr: 3000.0,
    open_date: '2026-09-14',
    close_date: '2026-09-18',
    allotment_date: '2026-09-21',
    listing_date: '2026-09-24',
    pe_ratio_high: 28.5,
    pb_ratio: 3.2,
    ev_ebitda: null, // financial HFC: EV/EBITDA is not applicable
    industry_pe_median: 26.5,
    latest_financial_year: 'FY24',
    latest_revenue_cr: 7617.7,
    latest_revenue_growth_pct: 34.0,
    latest_pat_margin_pct: 22.7,
    latest_roe_pct: 15.2,
    latest_roce_pct: 11.8,
    latest_total_debt_cr: 65000.0,
    latest_net_worth_cr: 11500.0,
    overall_score: 78.0,
    financial_health_score: 20.0,
    valuation_score: 15.0,
    subscription_demand_score: 13.0,
    market_sentiment_score: 14.0,
    is_insufficient_data: false,
    industry: 'Housing Finance',
    latest_gmp_value: 55.0,
    latest_gmp_gain_pct: 78.57,
    latest_subscription_x: null, // Upcoming
    latest_retail_sub_x: null,
    latest_qib_sub_x: null,
    high_risk_count: 0,
    last_intelligence_update: '2026-09-10T08:00:00Z',
  },
  {
    id: 'c3333333-3333-3333-3333-333333333333',
    slug: 'paramount-specialty-forgings-limited',
    company_name: 'Paramount Speciality Forgings Limited',
    symbol: 'PARAMOUNT',
    category: 'sme_nse',
    issue_type: 'book_building',
    status: 'listed',
    price_band_low: 57.0,
    price_band_high: 59.0,
    lot_size: 2000,
    min_investment: 118000.0,
    issue_size_cr: 32.34,
    fresh_issue_cr: 28.0,
    ofs_cr: 4.34,
    open_date: '2026-09-17',
    close_date: '2026-09-20',
    allotment_date: '2026-09-23',
    listing_date: '2026-09-26',
    pe_ratio_high: 14.8,
    pb_ratio: 2.1,
    ev_ebitda: 8.4,
    industry_pe_median: 22.0,
    latest_financial_year: 'FY24',
    latest_revenue_cr: 112.5,
    latest_revenue_growth_pct: 18.2,
    latest_pat_margin_pct: 7.8,
    latest_roe_pct: 18.9,
    latest_roce_pct: 16.4,
    latest_total_debt_cr: 45.0,
    latest_net_worth_cr: 52.0,
    overall_score: 64.0,
    financial_health_score: 16.0,
    valuation_score: 18.0,
    subscription_demand_score: 12.0,
    market_sentiment_score: 12.0,
    is_insufficient_data: false,
    industry: 'Forgings & Industrial Components',
    latest_gmp_value: 12.0,
    latest_gmp_gain_pct: 20.34,
    latest_subscription_x: 18.4,
    latest_retail_sub_x: 22.1,
    latest_qib_sub_x: 4.8,
    high_risk_count: 2,
    last_intelligence_update: '2026-09-09T18:00:00Z',
  },
];

/**
 * Pure in-memory filtering function.
 */
export function filterInMemory(records: ScreenerRecord[], filters: ScreenerFilterPayload): ScreenerResult {
  const startTime = performance.now();
  let filtered = [...records];
  let activeFilterCount = 0;

  // 1. Search Query
  if (filters.searchQuery && filters.searchQuery.trim() !== '') {
    activeFilterCount++;
    const q = filters.searchQuery.toLowerCase().trim();
    filtered = filtered.filter(
      (r) =>
        r.company_name.toLowerCase().includes(q) ||
        (r.symbol && r.symbol.toLowerCase().includes(q)) ||
        (r.industry && r.industry.toLowerCase().includes(q))
    );
  }

  // 2. Status
  if (filters.status && filters.status.length > 0) {
    activeFilterCount++;
    filtered = filtered.filter((r) => filters.status!.includes(r.status));
  }

  // 3. Category
  if (filters.category && filters.category.length > 0) {
    activeFilterCount++;
    filtered = filtered.filter((r) => filters.category!.includes(r.category));
  }

  // 4. Issue Type
  if (filters.issueType && filters.issueType.length > 0) {
    activeFilterCount++;
    filtered = filtered.filter((r) => filters.issueType!.includes(r.issue_type));
  }

  // 5. Industry
  if (filters.industry && filters.industry.length > 0) {
    activeFilterCount++;
    filtered = filtered.filter((r) => r.industry && filters.industry!.includes(r.industry));
  }

  // 6. Minimum Investment Range
  if (filters.minInvestmentMax !== undefined) {
    activeFilterCount++;
    filtered = filtered.filter((r) => r.min_investment !== null && r.min_investment <= filters.minInvestmentMax!);
  }
  if (filters.minInvestmentMin !== undefined) {
    activeFilterCount++;
    filtered = filtered.filter((r) => r.min_investment !== null && r.min_investment >= filters.minInvestmentMin!);
  }

  // 7. Issue Size (Cr)
  if (filters.issueSizeMinCr !== undefined) {
    activeFilterCount++;
    filtered = filtered.filter((r) => r.issue_size_cr !== null && r.issue_size_cr >= filters.issueSizeMinCr!);
  }
  if (filters.issueSizeMaxCr !== undefined) {
    activeFilterCount++;
    filtered = filtered.filter((r) => r.issue_size_cr !== null && r.issue_size_cr <= filters.issueSizeMaxCr!);
  }

  // 8. Valuation P/E
  if (filters.peRatioMax !== undefined) {
    activeFilterCount++;
    filtered = filtered.filter((r) => {
      if (r.pe_ratio_high === null) return Boolean(filters.includeUnpriced);
      return r.pe_ratio_high <= filters.peRatioMax!;
    });
  }
  if (filters.peRatioMin !== undefined) {
    activeFilterCount++;
    filtered = filtered.filter((r) => {
      if (r.pe_ratio_high === null) return Boolean(filters.includeUnpriced);
      return r.pe_ratio_high >= filters.peRatioMin!;
    });
  }

  // 9. Financial Ratios
  if (filters.revenueGrowthMinPct !== undefined) {
    activeFilterCount++;
    filtered = filtered.filter(
      (r) => r.latest_revenue_growth_pct !== null && r.latest_revenue_growth_pct >= filters.revenueGrowthMinPct!
    );
  }
  if (filters.patMarginMinPct !== undefined) {
    activeFilterCount++;
    filtered = filtered.filter(
      (r) => r.latest_pat_margin_pct !== null && r.latest_pat_margin_pct >= filters.patMarginMinPct!
    );
  }
  if (filters.roeMinPct !== undefined) {
    activeFilterCount++;
    filtered = filtered.filter(
      (r) => r.latest_roe_pct !== null && r.latest_roe_pct >= filters.roeMinPct!
    );
  }
  if (filters.debtToEquityMax !== undefined) {
    activeFilterCount++;
    filtered = filtered.filter((r) => {
      if (r.latest_total_debt_cr === null || r.latest_net_worth_cr === null || r.latest_net_worth_cr <= 0) return false;
      const de = r.latest_total_debt_cr / r.latest_net_worth_cr;
      return de <= filters.debtToEquityMax!;
    });
  }

  // 10. IPO Score
  if (filters.overallScoreMin !== undefined) {
    activeFilterCount++;
    filtered = filtered.filter(
      (r) => r.overall_score !== null && r.overall_score >= filters.overallScoreMin!
    );
  }

  // 11. Subscription Demand
  if (filters.subscriptionMinX !== undefined) {
    activeFilterCount++;
    filtered = filtered.filter(
      (r) => r.latest_subscription_x !== null && r.latest_subscription_x >= filters.subscriptionMinX!
    );
  }
  if (filters.qibSubMinX !== undefined) {
    activeFilterCount++;
    filtered = filtered.filter(
      (r) => r.latest_qib_sub_x !== null && r.latest_qib_sub_x >= filters.qibSubMinX!
    );
  }

  // 12. Grey Market Sentiment (Unofficial)
  if (filters.gmpGainMinPct !== undefined) {
    activeFilterCount++;
    filtered = filtered.filter(
      (r) => r.latest_gmp_gain_pct !== null && r.latest_gmp_gain_pct >= filters.gmpGainMinPct!
    );
  }

  // 13. Sorting
  const sortBy = filters.sortBy || 'overall_score';
  const sortDir = filters.sortDirection === 'asc' ? 1 : -1;

  filtered.sort((a, b) => {
    const valA = (a as unknown as Record<string, unknown>)[sortBy];
    const valB = (b as unknown as Record<string, unknown>)[sortBy];

    if (valA === null || valA === undefined) return 1; // Nulls last
    if (valB === null || valB === undefined) return -1;

    if (typeof valA === 'number' && typeof valB === 'number') {
      return (valA - valB) * sortDir;
    }

    return String(valA).localeCompare(String(valB)) * sortDir;
  });

  const totalCount = filtered.length;
  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(100, Math.max(1, filters.limit || 20));
  const totalPages = Math.ceil(totalCount / limit) || 1;

  const startIndex = (page - 1) * limit;
  const paginated = filtered.slice(startIndex, startIndex + limit);
  const executionTimeMs = Math.round((performance.now() - startTime) * 100) / 100;

  return {
    records: paginated,
    totalCount,
    page,
    limit,
    totalPages,
    activeFilterCount,
    executionTimeMs,
  };
}
