/**
 * features/external-integrations/adapters/nseExtractor.ts
 *
 * Phase 9 Stage 3A: NSE Ingestion Adapter (Tier 1 Exchange Authority).
 * Extracts public issue parameters, advertisements, and corporate filings from NSE India.
 */

import {
  IngestionExtractionResult,
  NormalizedIpoMasterPayload,
  IpoProvenanceMap,
} from '../ipo-master/ipoMasterTypes';

export interface NseRawIssue {
  symbol: string;
  companyName: string;
  isin?: string;
  series?: string;
  issueStartDate?: string;
  issueEndDate?: string;
  priceBand?: string; // e.g. "450-475" or "450.00 to 475.00"
  lotSize?: number | string;
  issueSize?: number | string; // in Cr
  documentUrl?: string;
  status?: string;
}

export class NseIngestionAdapter {
  public static readonly SOURCE_NAME = 'nse' as const;
  public static readonly BASE_URL = 'https://www.nseindia.com/companies-listing/corporate-filings-offer-documents';

  /**
   * Normalizes a raw NSE issue record into canonical platform schema.
   */
  public static normalizeIssue(raw: NseRawIssue): IngestionExtractionResult {
    const { low, high } = this.parsePriceBand(raw.priceBand);
    const lotSize = this.parseLotSize(raw.lotSize);
    const openDate = this.parseDate(raw.issueStartDate);
    const closeDate = this.parseDate(raw.issueEndDate);
    const issueSizeCr = this.parseIssueSize(raw.issueSize);
    const observedAt = new Date().toISOString();

    const normalized: NormalizedIpoMasterPayload = {
      company_name: raw.companyName.trim(),
      symbol: raw.symbol ? raw.symbol.toUpperCase().trim() : null,
      isin: raw.isin ? raw.isin.toUpperCase().trim() : null,
      exchange: 'NSE',
      price_band_low: low,
      price_band_high: high,
      lot_size: lotSize,
      issue_size_cr: issueSizeCr,
      open_date: openDate,
      close_date: closeDate,
      rhp_url: raw.documentUrl || null,
    };

    const provenance: IpoProvenanceMap = {
      company_name: {
        value: normalized.company_name,
        source: 'nse',
        source_url: this.BASE_URL,
        observed_at: observedAt,
        confidence: 'official_exchange',
        is_official: true,
      },
    };

    if (normalized.symbol) {
      provenance.symbol = {
        value: normalized.symbol,
        source: 'nse',
        source_url: this.BASE_URL,
        observed_at: observedAt,
        confidence: 'official_exchange',
        is_official: true,
      };
    }
    if (normalized.isin) {
      provenance.isin = {
        value: normalized.isin,
        source: 'nse',
        source_url: this.BASE_URL,
        observed_at: observedAt,
        confidence: 'official_exchange',
        is_official: true,
      };
    }
    if (normalized.price_band_low !== null && normalized.price_band_low !== undefined) {
      provenance.price_band_low = {
        value: normalized.price_band_low,
        source: 'nse',
        source_url: this.BASE_URL,
        observed_at: observedAt,
        confidence: 'official_exchange',
        is_official: true,
      };
    }
    if (normalized.price_band_high !== null && normalized.price_band_high !== undefined) {
      provenance.price_band_high = {
        value: normalized.price_band_high,
        source: 'nse',
        source_url: this.BASE_URL,
        observed_at: observedAt,
        confidence: 'official_exchange',
        is_official: true,
      };
    }
    if (normalized.lot_size !== null && normalized.lot_size !== undefined) {
      provenance.lot_size = {
        value: normalized.lot_size,
        source: 'nse',
        source_url: this.BASE_URL,
        observed_at: observedAt,
        confidence: 'official_exchange',
        is_official: true,
      };
    }
    if (normalized.open_date) {
      provenance.open_date = {
        value: normalized.open_date,
        source: 'nse',
        source_url: this.BASE_URL,
        observed_at: observedAt,
        confidence: 'official_exchange',
        is_official: true,
      };
    }
    if (normalized.close_date) {
      provenance.close_date = {
        value: normalized.close_date,
        source: 'nse',
        source_url: this.BASE_URL,
        observed_at: observedAt,
        confidence: 'official_exchange',
        is_official: true,
      };
    }

    const externalId = `nse-${raw.symbol.toLowerCase()}`;

    return {
      source: 'nse',
      external_id: externalId,
      document_type: 'IPO_MASTER',
      raw_payload: raw as unknown as Record<string, unknown>,
      normalized_payload: normalized,
      provenance,
    };
  }

  private static parsePriceBand(raw?: string): { low: number | null; high: number | null } {
    if (!raw) return { low: null, high: null };
    const clean = raw.replace(/[₹,Rs.\s]/gi, '');
    const parts = clean.split(/[-to]/i).map((p) => parseFloat(p)).filter((n) => !isNaN(n));
    if (parts.length === 2) {
      const low = parts[0] <= 0 ? null : parts[0];
      const high = parts[1] <= 0 ? null : parts[1];
      return { low, high };
    }
    if (parts.length === 1) {
      const val = parts[0] <= 0 ? null : parts[0];
      return { low: val, high: val };
    }
    return { low: null, high: null };
  }

  private static parseLotSize(raw?: number | string): number | null {
    if (raw === undefined || raw === null || raw === '') return null;
    const parsed = typeof raw === 'number' ? raw : parseInt(String(raw).replace(/[^0-9]/g, ''), 10);
    return isNaN(parsed) || parsed <= 0 ? null : parsed;
  }

  private static parseIssueSize(raw?: number | string): number | null {
    if (raw === undefined || raw === null || raw === '') return null;
    const parsed = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/[^0-9.]/g, ''));
    return isNaN(parsed) || parsed <= 0 ? null : parsed;
  }

  private static parseDate(raw?: string): string | null {
    if (!raw) return null;
    const d = new Date(raw);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split('T')[0];
  }
}
