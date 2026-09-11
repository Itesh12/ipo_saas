/**
 * features/external-integrations/adapters/upstoxAdapter.ts
 *
 * Phase 9 Stage 3A: Upstox IPO Adapter (Tier 3 Optional Operational Adapter).
 * Strictly read-only adapter with zero-price defense, strict lot-size defense,
 * and contract-exact INR Crores handling.
 *
 * STRICT INVARIANT: APPLICATION AND ORDER APIS ARE STRICTLY PROHIBITED.
 */

import {
  IngestionExtractionResult,
  NormalizedIpoMasterPayload,
  IpoProvenanceMap,
} from '../ipo-master/ipoMasterTypes';
import { CapabilityNotAvailableError } from '../providers/providerTypes';

export interface UpstoxRawIpoSummary {
  id: string;
  name: string;
  symbol?: string;
  isin?: string;
  issue_type?: string; // 'regular' | 'sme'
  issue_size?: number; // In INR Crores per contract
  minimum_price?: number; // 0 denotes unannounced
  maximum_price?: number; // 0 denotes unannounced
  lot_size?: number;
  minimum_quantity?: number; // NOT interchangeable with lot_size!
  bidding_start_date?: string;
  bidding_end_date?: string;
  listing_date?: string;
  listing_exchange?: string; // e.g. 'NSE' | 'BSE' | 'NSE,BSE'
  rhp_url?: string;
  drhp_url?: string;
  status?: string; // 'upcoming' | 'open' | 'closed' | 'listed'
}

export class UpstoxIpoAdapter {
  public static readonly SOURCE_NAME = 'upstox' as const;
  public static readonly BASE_URL = 'https://api.upstox.com/v2/ipos';

  /**
   * Normalizes Upstox v2 IPO response into canonical platform schema.
   */
  public static normalizeIpo(raw: UpstoxRawIpoSummary): IngestionExtractionResult {
    // 1. Zero-Price Defense: Upstox documents 0 as unannounced price band
    const priceBandLow = raw.minimum_price !== undefined && raw.minimum_price > 0 ? raw.minimum_price : null;
    const priceBandHigh = raw.maximum_price !== undefined && raw.maximum_price > 0 ? raw.maximum_price : null;

    // 2. Strict Lot Size Defense: NEVER infer from minimum_quantity
    const lotSize = raw.lot_size !== undefined && raw.lot_size > 0 ? raw.lot_size : null;

    // 3. Issue Size Contract Rule: Directly stored as INR Crores (no heuristic division)
    const issueSizeCr = raw.issue_size !== undefined && raw.issue_size > 0 ? raw.issue_size : null;

    // 4. Market Segment Mapping (Does not infer pricing method)
    let category: 'mainboard' | 'sme' | null = null;
    if (raw.issue_type) {
      const lower = raw.issue_type.toLowerCase();
      if (lower === 'regular') category = 'mainboard';
      else if (lower === 'sme') category = 'sme';
    }

    // 5. Exchange Mapping
    let exchange: 'NSE' | 'BSE' | 'BOTH' | null = null;
    if (raw.listing_exchange) {
      const upper = raw.listing_exchange.toUpperCase();
      if (upper.includes('NSE') && upper.includes('BSE')) exchange = 'BOTH';
      else if (upper.includes('NSE')) exchange = 'NSE';
      else if (upper.includes('BSE')) exchange = 'BSE';
    }

    // 6. Deterministic Business Lifecycle Mapping
    let businessStatus: 'upcoming' | 'open' | 'closed' | 'listed' | null = null;
    if (raw.status) {
      const st = raw.status.toLowerCase();
      if (st === 'upcoming') businessStatus = 'upcoming';
      else if (st === 'open') businessStatus = 'open';
      else if (st === 'closed') businessStatus = 'closed';
      else if (st === 'listed') businessStatus = 'listed';
    }

    const observedAt = new Date().toISOString();

    const normalized: NormalizedIpoMasterPayload = {
      company_name: raw.name.trim(),
      symbol: raw.symbol ? raw.symbol.toUpperCase().trim() : null,
      isin: raw.isin ? raw.isin.toUpperCase().trim() : null,
      category,
      price_band_low: priceBandLow,
      price_band_high: priceBandHigh,
      lot_size: lotSize,
      issue_size_cr: issueSizeCr,
      open_date: raw.bidding_start_date ? raw.bidding_start_date.split('T')[0] : null,
      close_date: raw.bidding_end_date ? raw.bidding_end_date.split('T')[0] : null,
      listing_date: raw.listing_date ? raw.listing_date.split('T')[0] : null,
      exchange,
      rhp_url: raw.rhp_url || null,
      drhp_url: raw.drhp_url || null,
      business_status: businessStatus,
    };

    const provenance: IpoProvenanceMap = {
      company_name: {
        value: normalized.company_name,
        source: 'upstox',
        source_url: `${this.BASE_URL}/${raw.id}`,
        observed_at: observedAt,
        confidence: 'licensed_feed',
        is_official: false,
      },
    };

    if (normalized.symbol) {
      provenance.symbol = {
        value: normalized.symbol,
        source: 'upstox',
        source_url: `${this.BASE_URL}/${raw.id}`,
        observed_at: observedAt,
        confidence: 'licensed_feed',
        is_official: false,
      };
    }
    if (normalized.isin) {
      provenance.isin = {
        value: normalized.isin,
        source: 'upstox',
        source_url: `${this.BASE_URL}/${raw.id}`,
        observed_at: observedAt,
        confidence: 'licensed_feed',
        is_official: false,
      };
    }
    if (normalized.price_band_low !== null && normalized.price_band_low !== undefined) {
      provenance.price_band_low = {
        value: normalized.price_band_low,
        source: 'upstox',
        source_url: `${this.BASE_URL}/${raw.id}`,
        observed_at: observedAt,
        confidence: 'licensed_feed',
        is_official: false,
      };
    }
    if (normalized.price_band_high !== null && normalized.price_band_high !== undefined) {
      provenance.price_band_high = {
        value: normalized.price_band_high,
        source: 'upstox',
        source_url: `${this.BASE_URL}/${raw.id}`,
        observed_at: observedAt,
        confidence: 'licensed_feed',
        is_official: false,
      };
    }
    if (normalized.lot_size !== null && normalized.lot_size !== undefined) {
      provenance.lot_size = {
        value: normalized.lot_size,
        source: 'upstox',
        source_url: `${this.BASE_URL}/${raw.id}`,
        observed_at: observedAt,
        confidence: 'licensed_feed',
        is_official: false,
      };
    }

    return {
      source: 'upstox',
      external_id: raw.id,
      document_type: 'IPO_MASTER',
      raw_payload: raw as unknown as Record<string, unknown>,
      normalized_payload: normalized,
      provenance,
    };
  }

  /**
   * Prohibited execution endpoint: Order submission must fail closed.
   */
  public static async submitApplication(): Promise<never> {
    throw new CapabilityNotAvailableError(
      'upstox',
      'submit_application',
      'disabled'
    );
  }

  /**
   * Prohibited execution endpoint: Mandate creation must fail closed.
   */
  public static async createMandate(): Promise<never> {
    throw new CapabilityNotAvailableError(
      'upstox',
      'create_mandate',
      'disabled'
    );
  }
}
