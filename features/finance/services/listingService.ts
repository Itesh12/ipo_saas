/**
 * features/finance/services/listingService.ts
 *
 * Candidate D: Listing Lifecycle & Performance Analytics Engine.
 *
 * ARCHITECTURAL MANDATES:
 * 1. Lifecycle Separation: Exchange listing/trading lifecycle (securities.listing_status) is distinct
 *    from IPO catalog lifecycle (deriveExplainableIPOStatus). Listing events must never corrupt ipos.status.
 * 2. Append-Only Listing Events: ipo_listing_events is an immutable ledger with SHA-256 audit hash
 *    and business idempotency (source, source_record_id).
 * 3. Authority Distinction:
 *    - listing_price = official/validated first-listing reference fact
 *    - security_prices.price = current validated market quote
 *    - Listing Gain % = (listing_price - issue_price) / issue_price * 100
 *    - Current Gain % = (current_price - issue_price) / issue_price * 100
 * 4. Zero mutations to Stage 5 financial state.
 */

import { createHash } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { DecimalPrecision } from '../utils/decimalPrecision';
import {
  ListingEventInput,
  ListingEventRecord,
  ListingDayAnalytics,
  ExchangeListingStatus,
} from '../types/valuationTypes';

export class ListingService {
  /**
   * Computes SHA-256 hash of listing event payload for tamper-evidence.
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
   * Records an immutable listing event and projects exchange listing status onto securities.
   */
  public static async recordListingEvent(
    input: ListingEventInput,
    customClient?: any
  ): Promise<ListingEventRecord> {
    const supabase = customClient || createAdminClient();

    // 1. Validation
    const listingPriceStr = input.listingPrice.toString();
    const issuePriceStr = input.issuePrice.toString();
    const listingPriceNum = parseFloat(listingPriceStr);
    const issuePriceNum = parseFloat(issuePriceStr);

    if (isNaN(listingPriceNum) || listingPriceNum <= 0) {
      throw new Error(`INVALID_LISTING_PRICE: listingPrice must be positive, got ${input.listingPrice}`);
    }
    if (isNaN(issuePriceNum) || issuePriceNum <= 0) {
      throw new Error(`INVALID_ISSUE_PRICE: issuePrice must be positive, got ${input.issuePrice}`);
    }

    const listingPrice = DecimalPrecision.fromBigInt(DecimalPrecision.toBigInt(listingPriceStr, 8), 8);
    const issuePrice = DecimalPrecision.fromBigInt(DecimalPrecision.toBigInt(issuePriceStr, 8), 8);

    // Exact decimal gain calculations
    const listingGain = DecimalPrecision.subtractStr(listingPrice, issuePrice, 8);
    const gainFraction = DecimalPrecision.divideStr(listingGain, issuePrice, 8);
    const listingGainPct = DecimalPrecision.multiplyStr(gainFraction, '100', 4);

    const idempotencyKey =
      input.idempotencyKey ||
      `listing_${input.ipoId}_${input.eventType}_${input.listingDate}_${input.source}`;

    // 2. Compute Payload Hash
    const hashPayload = {
      ipoId: input.ipoId,
      securityId: input.securityId,
      exchange: input.exchange || 'NSE',
      eventType: input.eventType,
      listingDate: input.listingDate,
      listingPrice,
      issuePrice,
      source: input.source,
      sourceRecordId: input.sourceRecordId || null,
      idempotencyKey,
    };
    const payloadHash = this.computePayloadHash(hashPayload);

    // 3. Check for existing idempotent record
    const { data: existing } = await supabase
      .from('ipo_listing_events')
      .select('*')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (existing) {
      return {
        id: existing.id,
        ipoId: existing.ipo_id,
        securityId: existing.security_id,
        exchange: existing.exchange,
        eventType: existing.event_type,
        listingDate: existing.listing_date,
        listingPrice: existing.listing_price.toString(),
        issuePrice: existing.issue_price.toString(),
        listingGain: existing.listing_gain.toString(),
        listingGainPct: existing.listing_gain_pct.toString(),
        source: existing.source,
        sourceRecordId: existing.source_record_id,
        payloadHash: existing.payload_hash,
        idempotencyKey: existing.idempotency_key,
        observedAt: existing.observed_at,
        effectiveAt: existing.effective_at,
        metadata: existing.metadata,
        createdAt: existing.created_at,
      };
    }

    // 4. Insert into immutable ipo_listing_events
    const { data: inserted, error: insErr } = await supabase
      .from('ipo_listing_events')
      .insert({
        ipo_id: input.ipoId,
        security_id: input.securityId,
        exchange: input.exchange || 'NSE',
        event_type: input.eventType,
        listing_date: input.listingDate,
        listing_price: listingPrice,
        issue_price: issuePrice,
        listing_gain: listingGain,
        listing_gain_pct: listingGainPct,
        source: input.source,
        source_record_id: input.sourceRecordId || null,
        payload_hash: payloadHash,
        idempotency_key: idempotencyKey,
        effective_at: input.effectiveAt || new Date().toISOString(),
        metadata: input.metadata || {},
      })
      .select('*')
      .single();

    if (insErr) {
      throw new Error(`LISTING_EVENT_INSERT_FAILED: ${insErr.message}`);
    }

    // 5. Update securities listing status (NEVER ipos.status)
    const newStatus: ExchangeListingStatus =
      input.eventType === 'FIRST_TRADE_OBSERVED' ? 'TRADING' : 'LISTED';

    await supabase
      .from('securities')
      .update({
        listing_status: newStatus,
        listing_date: input.listingDate,
        listing_price: listingPrice,
      })
      .eq('id', input.securityId);

    return {
      id: inserted.id,
      ipoId: inserted.ipo_id,
      securityId: inserted.security_id,
      exchange: inserted.exchange,
      eventType: inserted.event_type,
      listingDate: inserted.listing_date,
      listingPrice: inserted.listing_price.toString(),
      issuePrice: inserted.issue_price.toString(),
      listingGain: inserted.listing_gain.toString(),
      listingGainPct: inserted.listing_gain_pct.toString(),
      source: inserted.source,
      sourceRecordId: inserted.source_record_id,
      payloadHash: inserted.payload_hash,
      idempotencyKey: inserted.idempotency_key,
      observedAt: inserted.observed_at,
      effectiveAt: inserted.effective_at,
      metadata: inserted.metadata,
      createdAt: inserted.created_at,
    };
  }

  /**
   * Retrieves listing day analytics separating historical listing price from live market quote.
   */
  public static async getListingAnalytics(
    ipoId: string,
    customClient?: any
  ): Promise<ListingDayAnalytics | null> {
    const supabase = customClient || createAdminClient();

    // Query latest listing event for this IPO
    const { data: listingEvent } = await supabase
      .from('ipo_listing_events')
      .select('*')
      .eq('ipo_id', ipoId)
      .order('effective_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!listingEvent) {
      return null;
    }

    // Query security metadata
    const { data: security } = await supabase
      .from('securities')
      .select('id, symbol, exchange, listing_status')
      .eq('id', listingEvent.security_id)
      .single();

    // Query live canonical market price from security_prices
    const { data: canonicalPrice } = await supabase
      .from('security_prices')
      .select('price, is_verified')
      .eq('security_id', listingEvent.security_id)
      .eq('is_verified', true)
      .maybeSingle();

    const issuePrice = listingEvent.issue_price ? listingEvent.issue_price.toString() : '0.00000000';
    const listingPrice = listingEvent.listing_price ? listingEvent.listing_price.toString() : '0.00000000';
    const listingGainAmount = listingEvent.listing_gain ? listingEvent.listing_gain.toString() : '0.00000000';
    const listingGainPercent = listingEvent.listing_gain_pct ? listingEvent.listing_gain_pct.toString() : '0.0000';

    let currentPrice: string | null = null;
    let currentGainAmount: string | null = null;
    let currentGainPercent: string | null = null;

    if (canonicalPrice && canonicalPrice.price != null && parseFloat(canonicalPrice.price.toString()) > 0) {
      const pStr = canonicalPrice.price.toString();
      currentPrice = pStr;
      currentGainAmount = DecimalPrecision.subtractStr(pStr, issuePrice, 8);
      const curFraction = DecimalPrecision.divideStr(currentGainAmount, issuePrice, 8);
      currentGainPercent = DecimalPrecision.multiplyStr(curFraction, '100', 4);
    }

    return {
      ipoId,
      securityId: listingEvent.security_id,
      symbol: security?.symbol || 'UNKNOWN',
      exchange: listingEvent.exchange,
      issuePrice,
      listingPrice,
      listingGainAmount,
      listingGainPercent,
      currentPrice,
      currentGainAmount,
      currentGainPercent,
      listingDate: listingEvent.listing_date,
      exchangeStatus: (security?.listing_status as ExchangeListingStatus) || 'LISTED',
    };
  }
}
