/**
 * features/analytics/types/analytics.types.ts
 *
 * Phase 6: Analytics, Screener & Investor Intelligence Type Definitions
 * Pure analytical consumer of Phases 2–5.
 */

export type FreshnessCategory =
  | 'subscription'
  | 'gmp'
  | 'market_price'
  | 'ipo_lifecycle'
  | 'financial_statements'
  | 'valuations';

export type FreshnessStatus = 'fresh' | 'recent' | 'stale' | 'historical';

export interface FreshnessRule {
  metricCategory: FreshnessCategory;
  freshDurationMs: number;
  staleDurationMs: number;
  historicalAfterEvent?: 'listing' | 'closure';
}

export interface ScreenerRecord {
  id: string;
  slug: string;
  company_name: string;
  symbol: string | null;
  category: 'mainboard' | 'sme_bse' | 'sme_nse';
  issue_type: 'book_building' | 'fixed_price';
  status: string;
  price_band_low: number | null;
  price_band_high: number | null;
  lot_size: number;
  min_investment: number | null;
  issue_size_cr: number | null;
  fresh_issue_cr: number | null;
  ofs_cr: number | null;
  open_date: string | null;
  close_date: string | null;
  allotment_date: string | null;
  listing_date: string | null;
  pe_ratio_high: number | null;
  pb_ratio: number | null;
  ev_ebitda: number | null;
  industry_pe_median: number | null;
  latest_financial_year: string | null;
  latest_revenue_cr: number | null;
  latest_revenue_growth_pct: number | null;
  latest_pat_margin_pct: number | null;
  latest_roe_pct: number | null;
  latest_roce_pct: number | null;
  latest_total_debt_cr: number | null;
  latest_net_worth_cr: number | null;
  overall_score: number | null;
  financial_health_score: number | null;
  valuation_score: number | null;
  subscription_demand_score: number | null;
  market_sentiment_score: number | null;
  is_insufficient_data: boolean | null;
  industry: string | null;
  latest_gmp_value: number | null;
  latest_gmp_gain_pct: number | null;
  latest_subscription_x: number | null;
  latest_retail_sub_x: number | null;
  latest_qib_sub_x: number | null;
  high_risk_count: number;
  last_intelligence_update: string | null;
}

export interface ScreenerFilterPayload {
  status?: string[];
  category?: string[];
  issueType?: string[];
  industry?: string[];
  minInvestmentMax?: number;
  minInvestmentMin?: number;
  issueSizeMinCr?: number;
  issueSizeMaxCr?: number;
  peRatioMax?: number;
  peRatioMin?: number;
  peDiscountMinPct?: number;
  pbRatioMax?: number;
  evEbitdaMax?: number;
  revenueGrowthMinPct?: number;
  patMarginMinPct?: number;
  roeMinPct?: number;
  roceMinPct?: number;
  debtToEquityMax?: number;
  overallScoreMin?: number;
  gmpGainMinPct?: number;
  subscriptionMinX?: number;
  retailSubMinX?: number;
  qibSubMinX?: number;
  includeUnpriced?: boolean;
  searchQuery?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface ScreenerResult {
  records: ScreenerRecord[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
  activeFilterCount: number;
  executionTimeMs?: number;
}

export interface SavedScreenRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  filter_config: ScreenerFilterPayload;
  sort_by: string;
  sort_direction: 'asc' | 'desc';
  selected_columns: string[];
  is_pinned: boolean;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface SavedScreenPreset {
  id: string;
  name: string;
  description: string;
  badgeText: string;
  filterConfig: ScreenerFilterPayload;
  sortBy: string;
  sortDirection: 'asc' | 'desc';
}

export interface ComparisonModuleItem {
  key: string;
  label: string;
  unit?: string;
  isUnofficial?: boolean;
  values: Record<string, string | number | null>;
}

export interface ComparisonMatrix {
  ipos: Array<{
    id: string;
    slug: string;
    companyName: string;
    symbol: string | null;
    status: string;
    category: string;
    score: number | null;
  }>;
  modules: {
    issueProfile: ComparisonModuleItem[];
    valuations: ComparisonModuleItem[];
    financialTrajectory: ComparisonModuleItem[];
    peerComparison: ComparisonModuleItem[];
    officialSubscription: ComparisonModuleItem[];
    unofficialSentiment: ComparisonModuleItem[];
    governanceAndRisk: ComparisonModuleItem[];
  };
}

export interface OpportunityRankingCard {
  ipoId: string;
  slug: string;
  symbol: string;
  companyName: string;
  rank: number;
  overallScore: number;
  status: string;
  category: string;
  openDate: string | null;
  closeDate: string | null;
  minInvestment: number | null;
  positiveDrivers: string[];
  riskWarnings: string[];
  freshnessStatus: FreshnessStatus;
  dataCompletenessPct: number;
  asOf: string;
  isIllustrativeDemo?: boolean;
}

export interface SectorExposureItem {
  sector: string;
  investedCost: number;
  investedPct: number;
  marketValue: number | null;
  marketValuePct: number | null;
  securitiesCount: number;
}

export interface PortfolioConcentrationReport {
  primaryHhiMarketValue: number | null;
  marketValueCoveragePct: number;
  isMarketValuePartial: boolean;
  fallbackHhiInvestedCost: number;
  concentrationClassification: 'low' | 'moderate' | 'high';
  topHoldingWeightPct: number;
  topSectorWeightPct: number;
  sectorBreakdown: SectorExposureItem[];
  ownershipScope: string;
  evaluatedAt: string;
}

export interface CurrentBookLiquidityContext {
  availableBookCash: number;
  encumberedLienCash: number;
  totalLiquidAndEncumberedCash: number;
  isSufficientForLot: boolean;
  requiredLotInvestment: number;
  cashDeficitOrSurplus: number;
  accountSource: string;
  auditProvenanceNotice: string;
}
