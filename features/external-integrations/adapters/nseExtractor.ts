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

    const isSme = raw.series === 'SM' || raw.companyName.toLowerCase().includes('sme');
    const instrumentType = isSme ? 'SME_IPO' : 'IPO';
    const year = openDate ? parseInt(openDate.slice(0, 4), 10) : new Date().getFullYear();
    const cleanSym = (raw.symbol || 'issue').toLowerCase();
    const issueIdentity = `${cleanSym}-${instrumentType.toLowerCase()}-${year}`;

    let dataQuality: 'complete' | 'verified' | 'partial' = 'partial';
    if (low && high && openDate && closeDate && lotSize) {
      dataQuality = 'complete';
    } else if (low && high && openDate && closeDate) {
      dataQuality = 'verified';
    }

    const normalized: NormalizedIpoMasterPayload = {
      company_name: raw.companyName.trim(),
      symbol: raw.symbol ? raw.symbol.toUpperCase().trim() : null,
      isin: raw.isin ? raw.isin.toUpperCase().trim() : null,
      exchange: 'NSE',
      instrument_type: instrumentType,
      market_segment: instrumentType === 'SME_IPO' ? 'NSE_SME' : 'MAINBOARD',
      category: instrumentType === 'SME_IPO' ? 'sme' : 'mainboard',
      data_quality: dataQuality,
      issue_identity: issueIdentity,
      offering_year: year,
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

  public static parsePriceBand(raw?: string): { low: number | null; high: number | null } {
    if (!raw) return { low: null, high: null };
    const clean = raw.replace(/[₹,Rs.\s]/gi, ' ').trim();
    const matchTwo = clean.match(/(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)/i);
    if (matchTwo) {
      const low = parseFloat(matchTwo[1]);
      const high = parseFloat(matchTwo[2]);
      return {
        low: isNaN(low) || low <= 0 ? null : low,
        high: isNaN(high) || high <= 0 ? null : high,
      };
    }
    const matchOne = clean.match(/(\d+(?:\.\d+)?)/);
    if (matchOne) {
      const val = parseFloat(matchOne[1]);
      const safeVal = isNaN(val) || val <= 0 ? null : val;
      return { low: safeVal, high: safeVal };
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

  public static parseDate(raw?: string): string | null {
    if (!raw) return null;
    const trimmed = raw.trim();

    // 1. Direct match for DD-Mon-YYYY (e.g. "11-Sep-2026")
    const dmyMatch = trimmed.match(/^(\d{1,2})[-/ ]([A-Za-z]{3})[-/ ](\d{4})$/);
    if (dmyMatch) {
      const day = dmyMatch[1].padStart(2, '0');
      const monStr = dmyMatch[2].toLowerCase();
      const year = dmyMatch[3];
      const MONTHS: Record<string, string> = {
        jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
        jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
      };
      if (MONTHS[monStr]) {
        return `${year}-${MONTHS[monStr]}-${day}`;
      }
    }

    // 2. Direct match for YYYY-MM-DD
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }

    // 3. Fallback: Parse in IST (Asia/Kolkata) without UTC rollback
    const d = new Date(trimmed);
    if (isNaN(d.getTime())) return null;
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
    } catch {
      return d.toISOString().split('T')[0];
    }
  }
}
