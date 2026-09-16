/**
 * features/external-integrations/adapters/nseListingArchiveAdapter.ts
 *
 * Phase 9 Stage 3A.6: Official NSE Historical Listing Archive Adapter.
 * Ingests official exchange listing archives directly from nsearchives.nseindia.com:
 * 1. EQUITY_L.csv: Official Mainboard listed equities
 * 2. SME_EQUITY_L.csv: Official NSE Emerge (SME) listed equities
 *
 * Provides genuine exchange-confirmed historical records with exact listing dates,
 * symbols, market lots, and ISIN numbers for 2025, 2026, and historical periods.
 */

import {
  IngestionExtractionResult,
  NormalizedIpoMasterPayload,
  IpoProvenanceMap,
  MarketSegment,
  IPOInstrumentType,
} from '../ipo-master/ipoMasterTypes';

export interface NseArchiveRow {
  symbol: string;
  companyName: string;
  series: string;
  dateOfListing: string; // e.g. 06-OCT-2025 or 2025-10-06
  paidUpValue: number | null;
  marketLot: number | null;
  isin: string;
  faceValue: number | null;
}

export interface NseArchiveFilterOptions {
  from?: string; // YYYY-MM-DD
  to?: string;   // YYYY-MM-DD
  segments?: MarketSegment[];
  minYear?: number;
  maxYear?: number;
}

export class NseListingArchiveAdapter {
  public static readonly OFFICIAL_MAINBOARD_CSV =
    'https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv';
  public static readonly OFFICIAL_SME_CSV =
    'https://nsearchives.nseindia.com/emerge/corporates/content/SME_EQUITY_L.csv';

  private static readonly MONTH_MAP: Record<string, string> = {
    JAN: '01',
    FEB: '02',
    MAR: '03',
    APR: '04',
    MAY: '05',
    JUN: '06',
    JUL: '07',
    AUG: '08',
    SEP: '09',
    OCT: '10',
    NOV: '11',
    DEC: '12',
  };

  /**
   * Parses official NSE date format "DD-MMM-YYYY" or "DD-MMM-YY" into ISO "YYYY-MM-DD".
   */
  public static parseNseDate(dateStr: string): string | null {
    if (!dateStr || !dateStr.trim()) return null;
    const clean = dateStr.trim();

    // Already ISO?
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;

    // DD-MMM-YYYY or DD-MMM-YY
    const parts = clean.split('-');
    if (parts.length === 3) {
      const day = parts[0].padStart(2, '0');
      const month = this.MONTH_MAP[parts[1].toUpperCase()] || parts[1].padStart(2, '0');
      let year = parts[2];
      if (year.length === 2) {
        const yNum = parseInt(year, 10);
        year = yNum > 50 ? `19${year}` : `20${year}`;
      }
      return `${year}-${month}-${day}`;
    }

    return null;
  }

  /**
   * Fetches and parses official CSV listing archives from NSE.
   */
  public static async fetchArchive(
    csvUrl: string = NseListingArchiveAdapter.OFFICIAL_MAINBOARD_CSV
  ): Promise<string> {
    const res = await fetch(csvUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Accept': 'text/csv,text/plain,*/*',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch NSE listing archive from ${csvUrl}: ${res.status} ${res.statusText}`);
    }

    return await res.text();
  }

  private static splitCsvLine(line: string): string[] {
    const cols: string[] = [];
    let inQuote = false;
    let cur = '';

    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === '"') {
        inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        cols.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    cols.push(cur.trim());
    return cols;
  }

  /**
   * Parses CSV string into structured NseArchiveRow records using dynamic header mapping.
   */
  public static parseCsv(csvContent: string): NseArchiveRow[] {
    const lines = csvContent.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length < 2) return [];

    const headers = this.splitCsvLine(lines[0]);
    const colMap: Record<string, number> = {};
    headers.forEach((h, idx) => {
      colMap[h.replace(/[^a-zA-Z]/g, '').toUpperCase()] = idx;
    });

    const symbolIdx = colMap['SYMBOL'] ?? 0;
    const nameIdx = colMap['NAMEOFCOMPANY'] ?? 1;
    const seriesIdx = colMap['SERIES'] ?? 2;
    const dateIdx = colMap['DATEOFLISTING'] ?? 3;
    const paidUpIdx = colMap['PAIDUPVALUE'] ?? 4;
    const lotIdx = colMap['MARKETLOT'];
    const isinIdx = colMap['ISINNUMBER'] ?? (lotIdx !== undefined ? 6 : 5);
    const faceIdx = colMap['FACEVALUE'] ?? (lotIdx !== undefined ? 7 : 6);

    const rows: NseArchiveRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = this.splitCsvLine(lines[i]);
      if (cols.length >= 4) {
        const symbol = (cols[symbolIdx] || '').replace(/^"|"$/g, '').trim();
        const companyName = (cols[nameIdx] || '').replace(/^"|"$/g, '').trim();
        const series = (cols[seriesIdx] || '').replace(/^"|"$/g, '').trim();
        const dateOfListing = (cols[dateIdx] || '').replace(/^"|"$/g, '').trim();
        const paidUpRaw = cols[paidUpIdx];
        const paidUpValue = paidUpRaw ? parseFloat(paidUpRaw.replace(/,/g, '')) : null;
        const lotRaw = lotIdx !== undefined ? cols[lotIdx] : null;
        const marketLot = lotRaw ? parseInt(lotRaw.replace(/,/g, ''), 10) : null;
        const isin = (cols[isinIdx] || '').replace(/^"|"$/g, '').trim();
        const faceRaw = cols[faceIdx];
        const faceValue = faceRaw ? parseFloat(faceRaw.replace(/,/g, '')) : null;

        if (symbol && companyName) {
          rows.push({
            symbol,
            companyName,
            series,
            dateOfListing,
            paidUpValue: isNaN(paidUpValue as number) ? null : paidUpValue,
            marketLot: isNaN(marketLot as number) ? null : marketLot,
            isin,
            faceValue: isNaN(faceValue as number) ? null : faceValue,
          });
        }
      }
    }

    return rows;
  }

  /**
   * Normalizes an archive row into canonical IngestionExtractionResult.
   */
  public static normalizeRow(
    row: NseArchiveRow,
    segment: MarketSegment,
    sourceUrl: string
  ): IngestionExtractionResult {
    const isoListingDate = this.parseNseDate(row.dateOfListing);
    const yearMatch = isoListingDate ? isoListingDate.match(/^(\d{4})/) : null;
    const offeringYear = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();

    const cleanSlug = row.companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const instrumentType: IPOInstrumentType =
      segment === 'NSE_SME' || row.series.toUpperCase() === 'SM' ? 'SME_IPO' : 'IPO';

    const normalized: NormalizedIpoMasterPayload = {
      company_name: row.companyName,
      symbol: row.symbol,
      isin: row.isin || null,
      category: segment === 'NSE_SME' ? 'sme' : 'mainboard',
      issue_type: 'book_building',
      exchange: 'NSE',
      listing_date: isoListingDate,
      is_listing_confirmed: true,
      lot_size: row.marketLot && row.marketLot > 0 ? row.marketLot : null,
      market_segment: segment,
      instrument_type: instrumentType,
      data_quality: 'verified',
      offering_year: offeringYear,
      issue_identity: `historical-ipo-${cleanSlug}-${offeringYear}`,
      business_status: 'listed',
    };

    const observedAt = new Date().toISOString();
    const provenance: IpoProvenanceMap = {
      company_name: {
        value: row.companyName,
        source: 'nse_archive',
        source_url: sourceUrl,
        observed_at: observedAt,
        confidence: 'official_exchange',
        is_official: true,
      },
      symbol: {
        value: row.symbol,
        source: 'nse_archive',
        source_url: sourceUrl,
        observed_at: observedAt,
        confidence: 'official_exchange',
        is_official: true,
      },
      listing_date: {
        value: isoListingDate,
        source: 'nse_archive',
        source_url: sourceUrl,
        observed_at: observedAt,
        confidence: 'official_exchange',
        is_official: true,
      },
    };

    if (row.isin) {
      provenance.isin = {
        value: row.isin,
        source: 'nse_archive',
        source_url: sourceUrl,
        observed_at: observedAt,
        confidence: 'official_exchange',
        is_official: true,
      };
    }

    if (row.marketLot && row.marketLot > 0) {
      provenance.lot_size = {
        value: row.marketLot,
        source: 'nse_archive',
        source_url: sourceUrl,
        observed_at: observedAt,
        confidence: 'official_exchange',
        is_official: true,
      };
    }

    return {
      source: 'nse_archive',
      external_id: `nse-archive-${row.symbol}-${offeringYear}`,
      document_type: 'PROSPECTUS',
      raw_payload: row as unknown as Record<string, unknown>,
      normalized_payload: normalized,
      provenance,
    };
  }

  /**
   * Fetches, filters, and normalizes historical listings for requested segments and date range.
   */
  public static async getHistoricalListings(
    options: NseArchiveFilterOptions = {}
  ): Promise<IngestionExtractionResult[]> {
    const results: IngestionExtractionResult[] = [];
    const targetSegments = options.segments || ['MAINBOARD', 'NSE_SME'];

    if (targetSegments.includes('MAINBOARD')) {
      const csvText = await this.fetchArchive(this.OFFICIAL_MAINBOARD_CSV);
      const rows = this.parseCsv(csvText);

      for (const row of rows) {
        // If series is SM, it's SME; otherwise Mainboard
        const isSme = row.series.toUpperCase() === 'SM';
        const segment: MarketSegment = isSme ? 'NSE_SME' : 'MAINBOARD';

        const isoDate = this.parseNseDate(row.dateOfListing);
        if (!isoDate) continue;

        if (options.from && isoDate < options.from) continue;
        if (options.to && isoDate > options.to) continue;

        const year = parseInt(isoDate.slice(0, 4), 10);
        if (options.minYear && year < options.minYear) continue;
        if (options.maxYear && year > options.maxYear) continue;

        results.push(this.normalizeRow(row, segment, this.OFFICIAL_MAINBOARD_CSV));
      }
    }

    if (targetSegments.includes('NSE_SME')) {
      try {
        const smeCsvText = await this.fetchArchive(this.OFFICIAL_SME_CSV);
        const smeRows = this.parseCsv(smeCsvText);

        for (const row of smeRows) {
          const isoDate = this.parseNseDate(row.dateOfListing);
          if (!isoDate) continue;

          if (options.from && isoDate < options.from) continue;
          if (options.to && isoDate > options.to) continue;

          const year = parseInt(isoDate.slice(0, 4), 10);
          if (options.minYear && year < options.minYear) continue;
          if (options.maxYear && year > options.maxYear) continue;

          // Prevent duplicate if already added
          const already = results.some(
            (r) => r.normalized_payload.symbol === row.symbol && r.normalized_payload.offering_year === year
          );
          if (!already) {
            results.push(this.normalizeRow(row, 'NSE_SME', this.OFFICIAL_SME_CSV));
          }
        }
      } catch {
        // Continue if SME archive endpoint has transient issue
      }
    }

    return results;
  }
}
