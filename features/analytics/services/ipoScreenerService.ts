/**
 * features/analytics/services/ipoScreenerService.ts
 *
 * Phase 6: Multi-Factor IPO Screener Service
 * Queries the normal PostgreSQL view v_ipo_screener_universe with server-side filtering,
 * strict null defense, and execution time benchmarking.
 */

import { createClient } from '@/lib/supabase/server';
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
    fresh_issue_cr: 32.34,
    ofs_cr: 0.0,
    open_date: '2026-08-10',
    close_date: '2026-08-14',
    allotment_date: '2026-08-17',
    listing_date: '2026-08-20',
    pe_ratio_high: 14.8,
    pb_ratio: 1.9,
    ev_ebitda: 7.2,
    industry_pe_median: 22.0,
    latest_financial_year: 'FY24',
    latest_revenue_cr: 112.5,
    latest_revenue_growth_pct: 18.2,
    latest_pat_margin_pct: 8.5,
    latest_roe_pct: 16.8,
    latest_roce_pct: 18.0,
    latest_total_debt_cr: 28.0,
    latest_net_worth_cr: 52.0,
    overall_score: 69.0,
    financial_health_score: 18.0,
    valuation_score: 18.0,
    subscription_demand_score: 12.0,
    market_sentiment_score: 10.0,
    is_insufficient_data: false,
    industry: 'Forgings & Engineering',
    latest_gmp_value: 9.0,
    latest_gmp_gain_pct: 15.25,
    latest_subscription_x: 68.2,
    latest_retail_sub_x: 52.1,
    latest_qib_sub_x: 45.0,
    high_risk_count: 2,
    last_intelligence_update: '2026-08-20T10:00:00Z',
  },
];

import { filterInMemory } from './screenerFilterEngine';

export class IpoScreenerService {
  /**
   * Filters in-memory seed records using exact screener logic.
   * Useful for unit testing, offline development, and zero-network verification.
   */
  static filterInMemory = filterInMemory;

  /**
   * Executes server-side query against the PostgreSQL view v_ipo_screener_universe.
   */
  static async queryScreener(filters: ScreenerFilterPayload = {}): Promise<ScreenerResult> {
    const startTime = performance.now();

    try {
      const supabase = await createClient();
      let query = supabase
        .from('v_ipo_screener_universe')
        .select('*', { count: 'exact' });

      let activeFilterCount = 0;

      // Status
      if (filters.status && filters.status.length > 0) {
        activeFilterCount++;
        query = query.in('status', filters.status);
      }

      // Category
      if (filters.category && filters.category.length > 0) {
        activeFilterCount++;
        query = query.in('category', filters.category);
      }

      // Issue Type
      if (filters.issueType && filters.issueType.length > 0) {
        activeFilterCount++;
        query = query.in('issue_type', filters.issueType);
      }

      // Min Investment
      if (filters.minInvestmentMax !== undefined) {
        activeFilterCount++;
        query = query.lte('min_investment', filters.minInvestmentMax);
      }
      if (filters.minInvestmentMin !== undefined) {
        activeFilterCount++;
        query = query.gte('min_investment', filters.minInvestmentMin);
      }

      // Issue Size
      if (filters.issueSizeMinCr !== undefined) {
        activeFilterCount++;
        query = query.gte('issue_size_cr', filters.issueSizeMinCr);
      }
      if (filters.issueSizeMaxCr !== undefined) {
        activeFilterCount++;
        query = query.lte('issue_size_cr', filters.issueSizeMaxCr);
      }

      // P/E Ratio (Strict Null Defense)
      if (filters.peRatioMax !== undefined) {
        activeFilterCount++;
        if (!filters.includeUnpriced) {
          query = query.not('pe_ratio_high', 'is', null).lte('pe_ratio_high', filters.peRatioMax);
        }
      }

      // Score
      if (filters.overallScoreMin !== undefined) {
        activeFilterCount++;
        query = query.gte('overall_score', filters.overallScoreMin);
      }

      // Subscription Multiple
      if (filters.subscriptionMinX !== undefined) {
        activeFilterCount++;
        query = query.gte('latest_subscription_x', filters.subscriptionMinX);
      }

      // Text search
      if (filters.searchQuery && filters.searchQuery.trim() !== '') {
        activeFilterCount++;
        query = query.or(`company_name.ilike.%${filters.searchQuery}%,symbol.ilike.%${filters.searchQuery}%`);
      }

      // Sorting
      const sortBy = filters.sortBy || 'overall_score';
      const ascending = filters.sortDirection === 'asc';
      query = query.order(sortBy, { ascending, nullsFirst: false });

      // Pagination
      const page = filters.page || 1;
      const limit = filters.limit || 20;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      query = query.range(from, to);

      const { data, count, error } = await query;
      const endTime = performance.now();

      if (error || !data || data.length === 0) {
        return {
          records: [],
          totalCount: 0,
          page,
          limit,
          totalPages: 0,
          activeFilterCount,
          executionTimeMs: Math.round((endTime - startTime) * 100) / 100,
        };
      }

      const records = data as unknown as ScreenerRecord[];
      const totalCount = count || records.length;

      return {
        records,
        totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit) || 1,
        activeFilterCount,
        executionTimeMs: Math.round((endTime - startTime) * 100) / 100,
      };
    } catch {
      return {
        records: [],
        totalCount: 0,
        page: filters.page || 1,
        limit: filters.limit || 20,
        totalPages: 0,
        activeFilterCount: 0,
        executionTimeMs: 0,
      };
    }
  }
}
