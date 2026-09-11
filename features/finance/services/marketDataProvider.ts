/**
 * Market Data Provider Abstraction
 * Fetches verified market price quotes with missing-price safeguards.
 * Never uses unofficial Phase 3 GMP quotes for portfolio valuation.
 */

import { createClient } from "@/lib/supabase/server";
import { MarketPriceQuote } from "../types/finance.types";

export interface IMarketDataProvider {
  getQuote(securityId: string): Promise<MarketPriceQuote | null>;
  getBatchQuotes(securityIds: string[]): Promise<Map<string, MarketPriceQuote>>;
}

export class DefaultMarketDataProvider implements IMarketDataProvider {
  /**
   * Static helper to get quote
   */
  static async getQuote(securityId: string): Promise<MarketPriceQuote | null> {
    const provider = new DefaultMarketDataProvider();
    return provider.getQuote(securityId);
  }

  /**
   * Static helper to record price
   */
  static async recordPrice(params: {
    securityId: string;
    price: number;
    dayOpen?: number | null;
    dayHigh?: number | null;
    dayLow?: number | null;
    previousClose?: number | null;
    source?: string;
    isVerified?: boolean;
    priceDate?: string;
  }): Promise<{ success: boolean; error?: string }> {
    return recordSecurityPriceSnapshot(params);
  }

  /**
   * Retrieves the most recent verified price quote for a security.
   */
  async getQuote(securityId: string): Promise<MarketPriceQuote | null> {
    const supabase = await createClient();

    // 1. Check security_prices for latest verified quote
    const { data: quote } = await supabase
      .from("security_prices")
      .select(`
        price,
        day_open,
        day_high,
        day_low,
        previous_close,
        source,
        is_verified,
        captured_at,
        securities (
          symbol,
          exchange,
          isin
        )
      `)
      .eq("security_id", securityId)
      .eq("is_verified", true)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (quote) {
      const rawQuote = quote as unknown as {
        price: number;
        day_open: number | null;
        day_high: number | null;
        day_low: number | null;
        previous_close: number | null;
        source: string;
        is_verified: boolean;
        captured_at: string;
        securities: {
          symbol: string;
          exchange: string;
          isin: string | null;
        } | null;
      };

      return {
        symbol: rawQuote.securities?.symbol || "UNKNOWN",
        exchange: rawQuote.securities?.exchange || "NSE",
        isin: rawQuote.securities?.isin || null,
        currentPrice: rawQuote.price,
        dayOpen: rawQuote.day_open,
        dayHigh: rawQuote.day_high,
        dayLow: rawQuote.day_low,
        previousClose: rawQuote.previous_close,
        capturedAt: rawQuote.captured_at,
        source: rawQuote.source,
        isVerified: true,
      };
    }

    // 2. Fallback: Check if linked IPO has a verified listing_price
    const { data: sec } = await supabase
      .from("securities")
      .select("symbol, exchange, isin, ipo_id, ipos (listing_price, status)")
      .eq("id", securityId)
      .single();

    if (sec) {
      const rawSec = sec as unknown as {
        symbol: string;
        exchange: string;
        isin: string | null;
        ipo_id: string | null;
        ipos: { listing_price: number | null; status: string } | null;
      };

      if (rawSec.ipos && rawSec.ipos.status === "listed" && rawSec.ipos.listing_price) {
        return {
          symbol: rawSec.symbol,
          exchange: rawSec.exchange,
          isin: rawSec.isin,
          currentPrice: rawSec.ipos.listing_price,
          capturedAt: new Date().toISOString(),
          source: "ipo_listing_price",
          isVerified: true,
        };
      }
    }

    // 3. No verified price found -> return null (safeguard)
    return null;
  }

  /**
   * Batch retrieves quotes for multiple securities.
   */
  async getBatchQuotes(securityIds: string[]): Promise<Map<string, MarketPriceQuote>> {
    const results = new Map<string, MarketPriceQuote>();
    if (!securityIds || securityIds.length === 0) return results;

    const supabase = await createClient();

    const { data: quotes } = await supabase
      .from("security_prices")
      .select(`
        security_id,
        price,
        day_open,
        day_high,
        day_low,
        previous_close,
        source,
        is_verified,
        captured_at,
        securities (
          symbol,
          exchange,
          isin
        )
      `)
      .in("security_id", securityIds)
      .eq("is_verified", true)
      .order("captured_at", { ascending: false });

    if (quotes) {
      const rawQuotes = quotes as unknown as Array<{
        security_id: string;
        price: number;
        day_open: number | null;
        day_high: number | null;
        day_low: number | null;
        previous_close: number | null;
        source: string;
        is_verified: boolean;
        captured_at: string;
        securities: {
          symbol: string;
          exchange: string;
          isin: string | null;
        } | null;
      }>;

      for (const q of rawQuotes) {
        if (!results.has(q.security_id)) {
          results.set(q.security_id, {
            symbol: q.securities?.symbol || "UNKNOWN",
            exchange: q.securities?.exchange || "NSE",
            isin: q.securities?.isin || null,
            currentPrice: q.price,
            dayOpen: q.day_open,
            dayHigh: q.day_high,
            dayLow: q.day_low,
            previousClose: q.previous_close,
            capturedAt: q.captured_at,
            source: q.source,
            isVerified: true,
          });
        }
      }
    }

    return results;
  }
}

export const marketDataProvider = new DefaultMarketDataProvider();

/**
 * Records a new price snapshot for a security.
 */
export async function recordSecurityPriceSnapshot(params: {
  securityId: string;
  price: number;
  dayOpen?: number | null;
  dayHigh?: number | null;
  dayLow?: number | null;
  previousClose?: number | null;
  source?: string;
  isVerified?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const { error } = await supabase.from("security_prices").insert({
    security_id: params.securityId,
    price: params.price,
    day_open: params.dayOpen || null,
    day_high: params.dayHigh || null,
    day_low: params.dayLow || null,
    previous_close: params.previousClose || null,
    source: params.source || "manual_admin",
    is_verified: params.isVerified ?? true,
    captured_at: new Date().toISOString(),
  } as never);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}
