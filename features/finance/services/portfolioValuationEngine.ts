/**
 * features/finance/services/portfolioValuationEngine.ts
 *
 * Candidate D: Authoritative Portfolio Valuation Engine.
 *
 * ARCHITECTURAL MANDATES:
 * 1. Financial Quarantine: Candidate D can observe Stage 5 holdings (portfolio_positions),
 *    but STRICTLY CANNOT MUTATE any Stage 5 tables (portfolio_positions, investment_transactions,
 *    journal_entries, journal_lines, financial_accounts, ipo_application_settlements).
 * 2. No JavaScript floating-point arithmetic may participate in authoritative valuation calculations.
 *    All quantities, prices, cost bases, market values, and unrealized P&Ls use decimal-safe strings.
 * 3. Single Price Truth: Reads canonical latest validated prices strictly from security_prices.
 * 4. Missing Price Invariant: Missing or unverified quote => price = null, marketValue = null,
 *    unrealizedPnl = null. Never fabricate ₹0 or synthetic fallback.
 * 5. Session-Aware Freshness: Evaluates FRESH, STALE, MARKET_CLOSED, PROVIDER_UNAVAILABLE.
 * 6. Stage 5 Ownership Scopes: Inherits 'personal', 'family_all', 'applicant', 'external'.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { DecimalPrecision } from '../utils/decimalPrecision';
import { MarketPriceIngestionService } from './marketPriceIngestionService';
import {
  OwnershipScope,
  PortfolioValuationResult,
  ValuedHoldingItem,
  PriceFreshnessStatus,
} from '../types/valuationTypes';

export interface PortfolioValuationOptions {
  userId?: string;
  applicantId?: string;
  scope?: OwnershipScope;
  customClient?: any;
}

export class PortfolioValuationEngine {
  /**
   * Evaluates portfolio valuation with high-precision decimal arithmetic.
   * Purely READ-ONLY query on portfolio_positions and security_prices.
   */
  public static async evaluatePortfolio(
    options: PortfolioValuationOptions = {}
  ): Promise<PortfolioValuationResult> {
    const supabase = options.customClient || createAdminClient();
    const scope = options.scope || 'family_all';

    // 1. Build Query on Stage 5 portfolio_positions
    let query = supabase
      .from('portfolio_positions')
      .select(`
        id,
        user_id,
        applicant_id,
        security_id,
        quantity,
        average_cost_price,
        total_invested_cost,
        realized_pnl,
        is_external_tracked,
        updated_at,
        securities (
          id,
          symbol,
          company_name,
          exchange,
          isin,
          listing_status,
          listing_date,
          listing_price,
          ipo_id,
          ipos (
            price_band_high
          )
        ),
        applicant_profiles (
          id,
          display_name,
          user_id
        )
      `)
      .gt('quantity', 0); // Only positions with positive holdings

    if (options.userId) {
      query = query.eq('user_id', options.userId);
    }
    if (options.applicantId) {
      query = query.eq('applicant_id', options.applicantId);
    }

    const { data: rawPositions, error: posErr } = await query;
    if (posErr) {
      throw new Error(`PORTFOLIO_QUERY_FAILED: ${posErr.message}`);
    }

    // 2. Filter by Ownership Scope
    let positions = rawPositions || [];
    if (scope === 'external') {
      positions = positions.filter((p: any) => p.is_external_tracked);
    } else if (scope === 'personal') {
      positions = positions.filter((p: any) => !p.is_external_tracked);
    } else if (scope === 'applicant' && options.applicantId) {
      positions = positions.filter((p: any) => p.applicant_id === options.applicantId);
    }

    if (positions.length === 0) {
      return {
        scope,
        targetApplicantId: options.applicantId,
        holdings: [],
        totalCostBasis: '0.00000000',
        totalMarketValue: '0.00000000',
        totalUnrealizedPnl: '0.00000000',
        totalUnrealizedPnlPercent: '0.0000',
        unpricedHoldingsCount: 0,
        totalHoldingsCount: 0,
        evaluatedAt: new Date().toISOString(),
      };
    }

    // 3. Batch Query Canonical Latest Prices from security_prices
    const securityIds = Array.from(new Set(positions.map((p: any) => p.security_id)));
    const { data: rawPrices, error: priceErr } = await supabase
      .from('security_prices')
      .select('security_id, price, provider_timestamp, is_verified, source')
      .in('security_id', securityIds)
      .eq('is_verified', true);

    if (priceErr) {
      throw new Error(`SECURITY_PRICES_QUERY_FAILED: ${priceErr.message}`);
    }

    const priceMap = new Map<string, { price: string; providerTimestamp: string }>();
    if (rawPrices) {
      for (const p of rawPrices) {
        if (p.price != null && parseFloat(p.price.toString()) > 0) {
          priceMap.set(p.security_id, {
            price: p.price.toString(),
            providerTimestamp: p.provider_timestamp,
          });
        }
      }
    }

    // 4. Compute Valuations for Each Holding with Decimal-Safe Arithmetic
    let unpricedCount = 0;
    const pricedMarketValues: string[] = [];
    const pricedCostBases: string[] = [];
    const allCostBases: string[] = [];

    const holdings: ValuedHoldingItem[] = positions.map((pos: any) => {
      const quote = priceMap.get(pos.security_id);
      const quantityStr = pos.quantity.toString();
      const costBasisStr = pos.total_invested_cost.toString();
      const avgCostStr = pos.average_cost_price.toString();

      // Normalize to 8 decimals
      const quantity = DecimalPrecision.fromBigInt(DecimalPrecision.toBigInt(quantityStr, 8), 8);
      const costBasis = DecimalPrecision.fromBigInt(DecimalPrecision.toBigInt(costBasisStr, 8), 8);
      const averageCost = DecimalPrecision.fromBigInt(DecimalPrecision.toBigInt(avgCostStr, 8), 8);
      allCostBases.push(costBasis);

      const sec = pos.securities;
      const isin = sec?.isin || 'UNKNOWN';
      const symbol = sec?.symbol || 'UNKNOWN';
      const exchange = sec?.exchange || 'NSE';
      const companyName = sec?.company_name || symbol;
      const isListed = sec?.listing_status === 'LISTED' || sec?.listing_status === 'TRADING';

      const listingPrice = sec?.listing_price ? sec.listing_price.toString() : null;
      const issuePrice = sec?.ipos?.price_band_high ? sec.ipos.price_band_high.toString() : null;

      let listingGainPercent: string | null = null;
      if (listingPrice && issuePrice && parseFloat(issuePrice) > 0) {
        const diff = DecimalPrecision.subtractStr(listingPrice, issuePrice, 8);
        const ratio = DecimalPrecision.divideStr(diff, issuePrice, 8);
        listingGainPercent = DecimalPrecision.multiplyStr(ratio, '100', 4);
      }

      let currentPrice: string | null = null;
      let marketValue: string | null = null;
      let unrealizedPnl: string | null = null;
      let unrealizedPnlPercent: string | null = null;
      let currentGainPercent: string | null = null;
      let priceFreshness: PriceFreshnessStatus = 'PROVIDER_UNAVAILABLE';

      if (quote) {
        currentPrice = DecimalPrecision.fromBigInt(DecimalPrecision.toBigInt(quote.price, 8), 8);
        priceFreshness = MarketPriceIngestionService.evaluateFreshness(quote.providerTimestamp);

        // Authoritative valuation calculation (Gate 1: Exact decimal math)
        marketValue = DecimalPrecision.multiplyStr(quantity, currentPrice, 8);
        unrealizedPnl = DecimalPrecision.subtractStr(marketValue, costBasis, 8);

        if (parseFloat(costBasis) > 0) {
          const pnlRatio = DecimalPrecision.divideStr(unrealizedPnl, costBasis, 8);
          unrealizedPnlPercent = DecimalPrecision.multiplyStr(pnlRatio, '100', 4);
        } else {
          unrealizedPnlPercent = '0.0000';
        }

        if (issuePrice && parseFloat(issuePrice) > 0) {
          const curDiff = DecimalPrecision.subtractStr(currentPrice, issuePrice, 8);
          const curRatio = DecimalPrecision.divideStr(curDiff, issuePrice, 8);
          currentGainPercent = DecimalPrecision.multiplyStr(curRatio, '100', 4);
        }

        pricedMarketValues.push(marketValue);
        pricedCostBases.push(costBasis);
      } else {
        // Missing Price Invariant: NEVER fabricate 0 or fallback to costBasis!
        unpricedCount++;
      }

      return {
        holdingId: pos.id,
        securityId: pos.security_id,
        symbol,
        isin,
        companyName,
        applicantId: pos.applicant_id || pos.user_id,
        applicantName: pos.applicant_profiles?.display_name || 'Primary Investor',
        ownershipScope: (pos.is_external_tracked ? 'external' : 'personal') as OwnershipScope,
        quantity,
        costBasis,
        averageCost,
        currentPrice,
        marketValue,
        unrealizedPnl,
        unrealizedPnlPercent,
        priceFreshness,
        exchange,
        isListed,
        listingPrice,
        listingGainPercent,
        currentGainPercent,
        lastUpdated: pos.updated_at,
      };
    });

    // 5. Aggregate Portfolio Totals
    const totalCostBasis = DecimalPrecision.addStr(allCostBases, 8);
    const totalMarketValue = DecimalPrecision.addStr(pricedMarketValues, 8);
    const totalPricedCostBasis = DecimalPrecision.addStr(pricedCostBases, 8);
    const totalUnrealizedPnl = DecimalPrecision.subtractStr(totalMarketValue, totalPricedCostBasis, 8);

    let totalUnrealizedPnlPercent = '0.0000';
    if (parseFloat(totalPricedCostBasis) > 0) {
      const overallRatio = DecimalPrecision.divideStr(totalUnrealizedPnl, totalPricedCostBasis, 8);
      totalUnrealizedPnlPercent = DecimalPrecision.multiplyStr(overallRatio, '100', 4);
    }

    return {
      scope,
      targetApplicantId: options.applicantId,
      holdings,
      totalCostBasis,
      totalMarketValue,
      totalUnrealizedPnl,
      totalUnrealizedPnlPercent,
      unpricedHoldingsCount: unpricedCount,
      totalHoldingsCount: holdings.length,
      evaluatedAt: new Date().toISOString(),
    };
  }
}
