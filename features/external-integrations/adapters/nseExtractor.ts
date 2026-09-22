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

export type IssueSizeRawUnit =
  | 'INR_CRORES'
  | 'INR_LAKHS'
  | 'INR_ABSOLUTE'
  | 'SHARES'
  | 'AMBIGUOUS'
  | 'NONE';

export interface IssueSizeNormalizationResult {
  raw_value: number | string | null | undefined;
  raw_unit: IssueSizeRawUnit;
  normalized_unit: 'INR_CRORES';
  conversion_factor: number | null;
  issue_size_cr: number | null;
  confidence: 'official_exchange' | 'pending';
  status: 'NORMALIZED' | 'SHARES_DETECTED' | 'AMBIGUOUS' | 'EMPTY';
}

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
    const issueSizeResult = this.parseIssueSizeContract(raw.issueSize);
    const issueSizeCr = issueSizeResult.issue_size_cr;
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
    if (normalized.issue_size_cr !== null && normalized.issue_size_cr !== undefined) {
      provenance.issue_size_cr = {
        value: normalized.issue_size_cr,
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

  /**
   * Authoritative normalization contract for issueSize.
   * STRICT CONTRACT: Never infer unit solely from numeric magnitude!
   * - Explicit Crores: parsed value (conversion factor: 1.0)
   * - Explicit Lakhs: parsed value * 0.01
   * - Explicit INR Absolute: parsed value / 10,000,000
   * - Explicit Shares: issue_size_cr = null (never store shares in issue_size_cr)
   * - Bare number with no unit marker: AMBIGUOUS -> issue_size_cr = null
   * - Null, empty, 0, malformed: issue_size_cr = null
   */
  public static parseIssueSizeContract(raw?: number | string | null): IssueSizeNormalizationResult {
    if (raw === undefined || raw === null || raw === '' || raw === 0) {
      return {
        raw_value: raw,
        raw_unit: 'NONE',
        normalized_unit: 'INR_CRORES',
        conversion_factor: null,
        issue_size_cr: null,
        confidence: 'official_exchange',
        status: 'EMPTY',
      };
    }

    const str = String(raw).trim();
    if (!str || str === '-' || str === '--' || str.toLowerCase() === 'n/a') {
      return {
        raw_value: raw,
        raw_unit: 'NONE',
        normalized_unit: 'INR_CRORES',
        conversion_factor: null,
        issue_size_cr: null,
        confidence: 'official_exchange',
        status: 'EMPTY',
      };
    }

    const lower = str.toLowerCase();

    // 1. Explicit share count indicators
    if (lower.includes('share') || lower.includes('eq shares') || lower.includes('equity')) {
      return {
        raw_value: raw,
        raw_unit: 'SHARES',
        normalized_unit: 'INR_CRORES',
        conversion_factor: null,
        issue_size_cr: null,
        confidence: 'official_exchange',
        status: 'SHARES_DETECTED',
      };
    }

    const cleanCurrency = (s: string): string => {
      return s.replace(/₹/g, '').replace(/Rs\./gi, '').replace(/Rs/gi, '').replace(/inr/gi, '').replace(/,/g, '');
    };

    // 2. Explicit Crores (e.g. "500 Cr", "500.5 Crores", "₹ 1,200 crore")
    if (lower.includes('cr') || lower.includes('crore')) {
      const numMatch = cleanCurrency(str).match(/(\d+(?:\.\d+)?)/);
      if (numMatch) {
        const parsed = parseFloat(numMatch[1]);
        if (!isNaN(parsed) && parsed > 0) {
          return {
            raw_value: raw,
            raw_unit: 'INR_CRORES',
            normalized_unit: 'INR_CRORES',
            conversion_factor: 1.0,
            issue_size_cr: Math.round(parsed * 100) / 100,
            confidence: 'official_exchange',
            status: 'NORMALIZED',
          };
        }
      }
    }

    // 3. Explicit Lakhs (e.g. "500 Lakhs", "2500 Lacs", "₹5000 lac")
    if (lower.includes('lakh') || lower.includes('lac')) {
      const numMatch = cleanCurrency(str).match(/(\d+(?:\.\d+)?)/);
      if (numMatch) {
        const parsed = parseFloat(numMatch[1]);
        if (!isNaN(parsed) && parsed > 0) {
          return {
            raw_value: raw,
            raw_unit: 'INR_LAKHS',
            normalized_unit: 'INR_CRORES',
            conversion_factor: 0.01,
            issue_size_cr: Math.round(parsed * 0.01 * 100) / 100,
            confidence: 'official_exchange',
            status: 'NORMALIZED',
          };
        }
      }
    }

    // 4. Explicit INR absolute currency marker without crore/lakh suffix (e.g. "₹50,00,00,000", "Rs. 100000000", "INR 50000000")
    if (str.includes('₹') || lower.includes('rs.') || lower.includes('inr')) {
      const numMatch = cleanCurrency(str).match(/(\d+(?:\.\d+)?)/);
      if (numMatch) {
        const parsed = parseFloat(numMatch[1]);
        if (!isNaN(parsed) && parsed > 0) {
          return {
            raw_value: raw,
            raw_unit: 'INR_ABSOLUTE',
            normalized_unit: 'INR_CRORES',
            conversion_factor: 1e-7,
            issue_size_cr: Math.round((parsed / 10000000) * 100) / 100,
            confidence: 'official_exchange',
            status: 'NORMALIZED',
          };
        }
      }
    }

    // 5. Bare number with no unit marker whatsoever:
    // Strictly follow rule: NEVER infer unit from magnitude!
    // Ambiguous -> return issue_size_cr = null
    return {
      raw_value: raw,
      raw_unit: 'AMBIGUOUS',
      normalized_unit: 'INR_CRORES',
      conversion_factor: null,
      issue_size_cr: null,
      confidence: 'pending',
      status: 'AMBIGUOUS',
    };
  }

  public static parseIssueSize(raw?: number | string | null): number | null {
    const result = this.parseIssueSizeContract(raw);
    return result.issue_size_cr;
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
