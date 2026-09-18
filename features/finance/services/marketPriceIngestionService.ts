/**
 * features/finance/services/marketPriceIngestionService.ts
 *
 * Candidate D: Market Price Observation Ingestion & Monotonic Projection Engine.
 *
 * ARCHITECTURAL MANDATES:
 * 1. Single Price Truth: market_price_observations is the immutable audit/provenance layer.
 *    security_prices is the single canonical latest validated price projection.
 * 2. Monotonicity: Canonical projection must be monotonic by effective provider observation time
 *    (provider_timestamp) and must reject stale/out-of-order projection rollback.
 * 3. Session-Aware Freshness: Evaluates FRESH, STALE, MARKET_CLOSED, PROVIDER_UNAVAILABLE, UNKNOWN
 *    based on Indian market trading hours (09:15-15:30 IST, Mon-Fri).
 * 4. Zero mutations to Stage 5 financial state.
 */

import { createHash } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { DecimalPrecision } from '../utils/decimalPrecision';
import {
  MarketPriceObservationInput,
  PriceIngestionResult,
  PriceFreshnessStatus,
} from '../types/valuationTypes';

export class MarketPriceIngestionService {
  /**
   * Evaluates freshness based on IST trading session (09:15 to 15:30 IST, Mon-Fri).
   */
  public static evaluateFreshness(
    providerTimestampIso: string | null,
    referenceDate = new Date()
  ): PriceFreshnessStatus {
    if (!providerTimestampIso) {
      return 'PROVIDER_UNAVAILABLE';
    }

    const obsDate = new Date(providerTimestampIso);
    if (isNaN(obsDate.getTime())) {
      return 'UNKNOWN';
    }

    // Convert referenceDate to IST (UTC + 5 hours 30 mins)
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(referenceDate.getTime() + istOffsetMs);
    const dayOfWeek = istNow.getUTCDay(); // 0 = Sun, 6 = Sat
    const hour = istNow.getUTCHours();
    const minute = istNow.getUTCMinutes();
    const totalMinutes = hour * 60 + minute;

    // Market session: 09:15 (555 min) to 15:30 (930 min)
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
    const isMarketHours = isWeekday && totalMinutes >= 555 && totalMinutes <= 930;

    const ageMs = referenceDate.getTime() - obsDate.getTime();
    const ageMinutes = ageMs / (60 * 1000);

    if (isMarketHours) {
      // During market hours: fresh if within 15 minutes, stale otherwise
      if (ageMinutes <= 15 && ageMinutes >= -1) {
        return 'FRESH';
      }
      return 'STALE';
    } else {
      // Outside market hours
      return 'MARKET_CLOSED';
    }
  }

  /**
   * Computes deterministic SHA-256 payload hash for raw observation audit.
   */
  public static computePayloadHash(payload: Record<string, any>): string {
    const sortedKeys = Object.keys(payload).sort();
    const canonicalObj: Record<string, any> = {};
    for (const k of sortedKeys) {
      canonicalObj[k] = payload[k];
    }
    return createHash('sha256').update(JSON.stringify(canonicalObj)).digest('hex');
  }

  /**
   * Ingests a raw market quote into market_price_observations and atomically
   * projects into security_prices if and only if the quote is monotonically newer.
   */
  public static async ingestObservation(
    input: MarketPriceObservationInput,
    customClient?: any
  ): Promise<PriceIngestionResult> {
    const supabase = customClient || createAdminClient();

    // 1. Validation & Decimal Normalization
    const priceStr = input.price.toString();
    const priceNum = parseFloat(priceStr);
    if (isNaN(priceNum) || priceNum <= 0) {
      throw new Error(`INVALID_PRICE: Quote price must be positive numeric, got ${input.price}`);
    }

    const obsDate = new Date(input.providerTimestamp);
    if (isNaN(obsDate.getTime())) {
      throw new Error(`INVALID_TIMESTAMP: Invalid providerTimestamp ${input.providerTimestamp}`);
    }

    // Exact decimal representation
    const canonicalPrice = DecimalPrecision.fromBigInt(DecimalPrecision.toBigInt(priceStr, 8), 8);

    // Compute SHA-256 Hash
    const hashPayload = {
      securityId: input.securityId,
      price: canonicalPrice,
      provider: input.provider,
      providerTimestamp: obsDate.toISOString(),
    };
    const rawHash = this.computePayloadHash(hashPayload);

    // 2. Insert into immutable market_price_observations table
    const { data: insertedObs, error: obsErr } = await supabase
      .from('market_price_observations')
      .insert({
        security_id: input.securityId,
        price: canonicalPrice,
        day_open: input.dayOpen != null ? DecimalPrecision.fromBigInt(DecimalPrecision.toBigInt(input.dayOpen, 8), 8) : null,
        day_high: input.dayHigh != null ? DecimalPrecision.fromBigInt(DecimalPrecision.toBigInt(input.dayHigh, 8), 8) : null,
        day_low: input.dayLow != null ? DecimalPrecision.fromBigInt(DecimalPrecision.toBigInt(input.dayLow, 8), 8) : null,
        previous_close: input.previousClose != null ? DecimalPrecision.fromBigInt(DecimalPrecision.toBigInt(input.previousClose, 8), 8) : null,
        provider: input.provider,
        raw_hash: rawHash,
        is_verified: true,
        provider_timestamp: obsDate.toISOString(),
        received_at: new Date().toISOString(),
        metadata: input.metadata || {},
      })
      .select('id')
      .single();

    if (obsErr) {
      throw new Error(`OBSERVATION_INSERT_FAILED: ${obsErr.message}`);
    }

    const observationId = insertedObs.id;

    // 3. Query existing canonical record from security_prices
    const { data: existingPrices, error: selErr } = await supabase
      .from('security_prices')
      .select('id, price, provider_timestamp')
      .eq('security_id', input.securityId)
      .order('provider_timestamp', { ascending: false })
      .limit(1);

    if (selErr) {
      throw new Error(`SECURITY_PRICE_QUERY_FAILED: ${selErr.message}`);
    }

    const existingPrice = existingPrices && existingPrices.length > 0 ? existingPrices[0] : null;

    // 4. Monotonic Projection Decision
    if (!existingPrice) {
      // First price observation for this security -> Project
      const { error: insErr } = await supabase
        .from('security_prices')
        .insert({
          security_id: input.securityId,
          price: canonicalPrice,
          day_open: input.dayOpen != null ? DecimalPrecision.fromBigInt(DecimalPrecision.toBigInt(input.dayOpen, 8), 8) : null,
          day_high: input.dayHigh != null ? DecimalPrecision.fromBigInt(DecimalPrecision.toBigInt(input.dayHigh, 8), 8) : null,
          day_low: input.dayLow != null ? DecimalPrecision.fromBigInt(DecimalPrecision.toBigInt(input.dayLow, 8), 8) : null,
          previous_close: input.previousClose != null ? DecimalPrecision.fromBigInt(DecimalPrecision.toBigInt(input.previousClose, 8), 8) : null,
          source: input.provider,
          is_verified: true,
          provider_timestamp: obsDate.toISOString(),
          captured_at: new Date().toISOString(),
        });

      if (insErr) {
        throw new Error(`SECURITY_PRICE_INIT_FAILED: ${insErr.message}`);
      }

      return {
        observationId,
        rawHash,
        canonicalProjected: true,
        projectionReason: 'NEWEST_CANONICAL',
        currentCanonicalPrice: canonicalPrice,
        providerTimestamp: obsDate.toISOString(),
      };
    }

    // Existing price exists. Check timestamp monotonicity.
    const existingTime = new Date(existingPrice.provider_timestamp).getTime();
    const newTime = obsDate.getTime();

    if (newTime > existingTime) {
      // Monotonically NEWER -> Update canonical price
      const { error: updErr } = await supabase
        .from('security_prices')
        .update({
          price: canonicalPrice,
          day_open: input.dayOpen != null ? DecimalPrecision.fromBigInt(DecimalPrecision.toBigInt(input.dayOpen, 8), 8) : null,
          day_high: input.dayHigh != null ? DecimalPrecision.fromBigInt(DecimalPrecision.toBigInt(input.dayHigh, 8), 8) : null,
          day_low: input.dayLow != null ? DecimalPrecision.fromBigInt(DecimalPrecision.toBigInt(input.dayLow, 8), 8) : null,
          previous_close: input.previousClose != null ? DecimalPrecision.fromBigInt(DecimalPrecision.toBigInt(input.previousClose, 8), 8) : null,
          source: input.provider,
          is_verified: true,
          provider_timestamp: obsDate.toISOString(),
          captured_at: new Date().toISOString(),
        })
        .eq('id', existingPrice.id)
        .lt('provider_timestamp', obsDate.toISOString());

      if (updErr) {
        throw new Error(`SECURITY_PRICE_UPDATE_FAILED: ${updErr.message}`);
      }

      return {
        observationId,
        rawHash,
        canonicalProjected: true,
        projectionReason: 'NEWEST_CANONICAL',
        currentCanonicalPrice: canonicalPrice,
        providerTimestamp: obsDate.toISOString(),
      };
    } else if (newTime === existingTime) {
      // Identical timestamp -> Deterministic rejection (first-seen wins)
      return {
        observationId,
        rawHash,
        canonicalProjected: false,
        projectionReason: 'TIE_BREAK_REJECTED',
        currentCanonicalPrice: existingPrice.price.toString(),
        providerTimestamp: existingPrice.provider_timestamp,
      };
    } else {
      // OUT-OF-ORDER / STALE ARRIVAL -> Strictly reject rollback
      return {
        observationId,
        rawHash,
        canonicalProjected: false,
        projectionReason: 'STALE_OUT_OF_ORDER',
        currentCanonicalPrice: existingPrice.price.toString(),
        providerTimestamp: existingPrice.provider_timestamp,
      };
    }
  }
}
