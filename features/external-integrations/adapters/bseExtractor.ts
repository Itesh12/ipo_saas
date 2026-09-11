/**
 * features/external-integrations/adapters/bseExtractor.ts
 *
 * Phase 9 Stage 3A: BSE Ingestion Adapter (Tier 1 Exchange Authority).
 * Extracts public issues, book-building notices, and issue parameters from BSE India.
 */

import {
  IngestionExtractionResult,
  NormalizedIpoMasterPayload,
  IpoProvenanceMap,
} from '../ipo-master/ipoMasterTypes';

export interface BseRawIssue {
  scripCode?: string;
  companyName: string;
  securityType?: string;
  issueType?: string;
  startDate?: string;
  endDate?: string;
  priceBandLow?: number | string;
  priceBandHigh?: number | string;
  lotSize?: number | string;
  issueSizeCr?: number | string;
}

export class BseIngestionAdapter {
  public static readonly SOURCE_NAME = 'bse' as const;
  public static readonly BASE_URL = 'https://www.bseindia.com/markets/PublicIssues/';

  /**
   * Normalizes a raw BSE issue notice into canonical platform schema.
   */
  public static normalizeIssue(raw: BseRawIssue): IngestionExtractionResult {
    const low = this.parsePrice(raw.priceBandLow);
    const high = this.parsePrice(raw.priceBandHigh);
    const lotSize = this.parseLotSize(raw.lotSize);
    const issueSizeCr = this.parsePrice(raw.issueSizeCr);
    const openDate = this.parseDate(raw.startDate);
    const closeDate = this.parseDate(raw.endDate);
    const observedAt = new Date().toISOString();

    const normalized: NormalizedIpoMasterPayload = {
      company_name: raw.companyName.trim(),
      exchange: 'BSE',
      price_band_low: low,
      price_band_high: high,
      lot_size: lotSize,
      issue_size_cr: issueSizeCr,
      open_date: openDate,
      close_date: closeDate,
    };

    const provenance: IpoProvenanceMap = {
      company_name: {
        value: normalized.company_name,
        source: 'bse',
        source_url: this.BASE_URL,
        observed_at: observedAt,
        confidence: 'official_exchange',
        is_official: true,
      },
    };

    if (normalized.price_band_low !== null && normalized.price_band_low !== undefined) {
      provenance.price_band_low = {
        value: normalized.price_band_low,
        source: 'bse',
        source_url: this.BASE_URL,
        observed_at: observedAt,
        confidence: 'official_exchange',
        is_official: true,
      };
    }
    if (normalized.price_band_high !== null && normalized.price_band_high !== undefined) {
      provenance.price_band_high = {
        value: normalized.price_band_high,
        source: 'bse',
        source_url: this.BASE_URL,
        observed_at: observedAt,
        confidence: 'official_exchange',
        is_official: true,
      };
    }
    if (normalized.lot_size !== null && normalized.lot_size !== undefined) {
      provenance.lot_size = {
        value: normalized.lot_size,
        source: 'bse',
        source_url: this.BASE_URL,
        observed_at: observedAt,
        confidence: 'official_exchange',
        is_official: true,
      };
    }
    if (normalized.open_date) {
      provenance.open_date = {
        value: normalized.open_date,
        source: 'bse',
        source_url: this.BASE_URL,
        observed_at: observedAt,
        confidence: 'official_exchange',
        is_official: true,
      };
    }
    if (normalized.close_date) {
      provenance.close_date = {
        value: normalized.close_date,
        source: 'bse',
        source_url: this.BASE_URL,
        observed_at: observedAt,
        confidence: 'official_exchange',
        is_official: true,
      };
    }

    const scripOrSlug = raw.scripCode
      ? `bse-${raw.scripCode}`
      : `bse-${raw.companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

    return {
      source: 'bse',
      external_id: scripOrSlug,
      document_type: 'IPO_MASTER',
      raw_payload: raw as unknown as Record<string, unknown>,
      normalized_payload: normalized,
      provenance,
    };
  }

  private static parsePrice(raw?: number | string): number | null {
    if (raw === undefined || raw === null || raw === '') return null;
    const parsed = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/[^0-9.]/g, ''));
    return isNaN(parsed) || parsed <= 0 ? null : parsed;
  }

  private static parseLotSize(raw?: number | string): number | null {
    if (raw === undefined || raw === null || raw === '') return null;
    const parsed = typeof raw === 'number' ? raw : parseInt(String(raw).replace(/[^0-9]/g, ''), 10);
    return isNaN(parsed) || parsed <= 0 ? null : parsed;
  }

  private static parseDate(raw?: string): string | null {
    if (!raw) return null;
    const d = new Date(raw);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split('T')[0];
  }
}
