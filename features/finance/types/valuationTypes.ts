/**
 * features/finance/types/valuationTypes.ts
 *
 * Candidate D: Stage 6 Listing, Market Pricing & Portfolio Valuation Engine Types.
 * 
 * ARCHITECTURAL MANDATES:
 * 1. Gate 1: No JavaScript floating-point arithmetic may participate in authoritative valuation calculations.
 *    All monetary, cost, price, and quantity domain types use decimal-safe strings.
 * 2. Gate 2: Missing price invariant: price = null => marketValue = null, unrealizedPnl = null.
 * 3. Gate 3: Listing price (historical first-listing reference fact) vs current price (validated market quote) authority.
 * 4. Gate 4: Session-aware freshness contract (FRESH, STALE, MARKET_CLOSED, PROVIDER_UNAVAILABLE, UNKNOWN).
 */

export type ExchangeListingStatus = 
  | 'NOT_LISTED'
  | 'UPCOMING'
  | 'LISTED'
  | 'TRADING'
  | 'SUSPENDED'
  | 'DELISTED';

export type PriceFreshnessStatus = 
  | 'FRESH'
  | 'STALE'
  | 'MARKET_CLOSED'
  | 'PROVIDER_UNAVAILABLE'
  | 'UNKNOWN';

export type ListingEventType = 
  | 'LISTING_SCHEDULED'
  | 'LISTING_CONFIRMED'
  | 'FIRST_TRADE_OBSERVED'
  | 'STATUS_CHANGED'
  | 'CIRCUIT_TRIGGERED';

export type OwnershipScope = 'personal' | 'family_all' | 'applicant' | 'external';

export interface ListingEventInput {
  ipoId: string;
  securityId: string;
  exchange: string;
  eventType: ListingEventType | string;
  listingDate: string; // YYYY-MM-DD
  listingPrice: string | number; // NUMERIC(20,8)
  issuePrice: string | number; // NUMERIC(20,8)
  source: string;
  sourceRecordId?: string | null;
  idempotencyKey?: string;
  effectiveAt?: string;
  metadata?: Record<string, any>;
}

export interface ListingEventRecord {
  id: string;
  ipoId: string;
  securityId: string;
  exchange: string;
  eventType: string;
  listingDate: string;
  listingPrice: string;
  issuePrice: string;
  listingGain: string;
  listingGainPct: string;
  source: string;
  sourceRecordId: string | null;
  payloadHash: string;
  idempotencyKey: string;
  observedAt: string;
  effectiveAt: string;
  metadata: Record<string, any>;
  createdAt: string;
}

export interface MarketPriceObservationInput {
  securityId: string;
  price: string | number;
  dayOpen?: string | number | null;
  dayHigh?: string | number | null;
  dayLow?: string | number | null;
  previousClose?: string | number | null;
  provider: string;
  providerTimestamp: string; // ISO 8601 string
  metadata?: Record<string, any>;
}

export interface MarketPriceObservationRecord {
  id: string;
  securityId: string;
  price: string;
  dayOpen: string | null;
  dayHigh: string | null;
  dayLow: string | null;
  previousClose: string | null;
  changeAmount: string | null;
  changePct: string | null;
  provider: string;
  rawHash: string;
  isVerified: boolean;
  providerTimestamp: string;
  receivedAt: string;
  metadata: Record<string, any>;
  createdAt: string;
}

export interface PriceIngestionResult {
  observationId: string;
  rawHash: string;
  canonicalProjected: boolean;
  projectionReason: 'NEWEST_CANONICAL' | 'STALE_OUT_OF_ORDER' | 'TIE_BREAK_REJECTED' | 'PRICE_INVALID';
  currentCanonicalPrice: string;
  providerTimestamp: string;
}

export interface ValuedHoldingItem {
  holdingId: string;
  securityId: string;
  symbol: string;
  isin: string;
  companyName?: string;
  applicantId: string;
  applicantName: string;
  ownershipScope: OwnershipScope;
  
  // Gate 1: Exact Decimal-Safe Strings (Never JS number)
  quantity: string;
  costBasis: string;
  averageCost: string;
  currentPrice: string | null; // NULL if unquoted or missing, NEVER 0
  marketValue: string | null;  // NULL if currentPrice is NULL
  unrealizedPnl: string | null; // NULL if currentPrice is NULL
  unrealizedPnlPercent: string | null; // NULL if currentPrice is NULL

  // Freshness & Listing metadata
  priceFreshness: PriceFreshnessStatus;
  exchange: string;
  isListed: boolean;
  listingPrice: string | null; // Official first-listing fact
  listingGainPercent: string | null; // (listing_price - issue_price) / issue_price * 100
  currentGainPercent: string | null; // (current_price - issue_price) / issue_price * 100
  lastUpdated: string;
}

export interface PortfolioValuationResult {
  scope: OwnershipScope;
  targetApplicantId?: string;
  holdings: ValuedHoldingItem[];
  
  // Aggregated Decimal-Safe Strings
  totalCostBasis: string;
  totalMarketValue: string; // Excludes unpriced holdings or notes them
  totalUnrealizedPnl: string;
  totalUnrealizedPnlPercent: string;
  
  unpricedHoldingsCount: number;
  totalHoldingsCount: number;
  evaluatedAt: string;
}

export interface ListingDayAnalytics {
  ipoId: string;
  securityId: string;
  symbol: string;
  exchange: string;
  issuePrice: string;
  listingPrice: string;
  listingGainAmount: string;
  listingGainPercent: string;
  currentPrice: string | null;
  currentGainAmount: string | null;
  currentGainPercent: string | null;
  listingDate: string;
  exchangeStatus: ExchangeListingStatus;
}
