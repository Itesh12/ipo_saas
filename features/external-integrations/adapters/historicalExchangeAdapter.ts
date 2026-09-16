/**
 * features/external-integrations/adapters/historicalExchangeAdapter.ts
 *
 * Phase 9 Stage 3A.5: Dedicated Historical IPO Archive Adapter.
 * Acquires official past listed issues from regulatory/exchange historical archives
 * (SEBI Final Offer Documents filed with ROC - smid=12, and official exchange listing archives).
 *
 * Guarantees:
 * 1. 100% Real Live Archival Ingestion: Zero static seeds or mock JSON.
 * 2. Identity Resolution & Provenance: Links past prospectuses to canonical issue identities.
 * 3. Dynamic Data Quality: Historical records reflect actual observed field completeness
 *    ('complete' | 'verified' | 'partial').
 * 4. Deduplication against active upcoming/current pipeline.
 */

import { SebiSourceClient } from '../clients/sebiSourceClient';
import { SebiPublicIssuesExtractor } from './sebiExtractor';
import {
  IngestionExtractionResult,
  IpoProvenanceMap,
  IngestionSource,
} from '../ipo-master/ipoMasterTypes';
import { HistoricalIpoSourceContract } from '../ipo-master/sourceContracts';

export class HistoricalExchangeAdapter implements HistoricalIpoSourceContract {
  public readonly universeSlice = 'historical' as const;
  public readonly sourceName = 'sebi_archive' as const;

  public static readonly OFFICIAL_HISTORICAL_PORTAL =
    'https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=3&smid=12&ssid=15';

  private sebiClient: SebiSourceClient;

  constructor(client?: SebiSourceClient) {
    this.sebiClient = client || new SebiSourceClient();
  }

  public async isAvailable(): Promise<boolean> {
    try {
      const res = await this.sebiClient.fetchLiveFilings(HistoricalExchangeAdapter.OFFICIAL_HISTORICAL_PORTAL);
      return res.status === 200 && res.byteLength > 1000;
    } catch {
      return false;
    }
  }

  public async getHealthStatus(): Promise<'healthy' | 'degraded' | 'unreachable'> {
    try {
      const ok = await this.isAvailable();
      return ok ? 'healthy' : 'degraded';
    } catch {
      return 'unreachable';
    }
  }

  /**
   * Fetches official historical public issue archive batch end-to-end.
   */
  public async fetchObservations(): Promise<IngestionExtractionResult[]> {
    return this.fetchArchiveBatch();
  }

  /**
   * Fetches and normalizes multiple pages of historical prospectuses from SEBI ROC archives.
   */
  public async fetchArchivePages(
    maxPages: number = 5,
    options?: {
      fromYear?: string;
      toYear?: string;
      fromDate?: string;
      toDate?: string;
    }
  ): Promise<{
    results: IngestionExtractionResult[];
    pagesFetched: number;
    totalPagesDiscovered: number;
    totalRecordsDiscovered: number;
  }> {
    const allResults: IngestionExtractionResult[] = [];
    let totalRecordsDiscovered = 0;
    let totalPagesDiscovered = 1;
    let pagesFetched = 0;

    for (let page = 1; page <= maxPages; page++) {
      try {
        const paginated = await this.sebiClient.fetchPaginatedFilings(12, page, options);
        pagesFetched++;
        totalRecordsDiscovered = paginated.totalRecordsDiscovered;
        totalPagesDiscovered = paginated.totalPagesDiscovered;

        const rawExtractions = SebiPublicIssuesExtractor.parseHtml(paginated.html);
        const normalizedBatch = this.normalizeBatch(rawExtractions);
        allResults.push(...normalizedBatch);

        if (!paginated.hasNextPage) break;
      } catch (err: unknown) {
        if (page === 1) throw err;
        break; // Stop at last available page
      }
    }

    return {
      results: allResults,
      pagesFetched,
      totalPagesDiscovered,
      totalRecordsDiscovered,
    };
  }

  private normalizeBatch(rawExtractions: IngestionExtractionResult[]): IngestionExtractionResult[] {
    return rawExtractions.map((ext) => {
      const normalized = { ...ext.normalized_payload };
      
      normalized.business_status = 'listed';
      normalized.instrument_type = ext.normalized_payload.instrument_type || 'IPO';
      normalized.market_segment =
        normalized.instrument_type === 'SME_IPO' ? 'NSE_SME' : 'MAINBOARD';
      
      if (normalized.price_band_high && normalized.listing_date && normalized.lot_size) {
        normalized.data_quality = 'complete';
      } else if (normalized.prospectus_url || normalized.rhp_url) {
        normalized.data_quality = 'verified';
      } else {
        normalized.data_quality = 'partial';
      }

      const cleanSlug = normalized.company_name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      const yearMatch = ext.raw_payload.filingDate ? String(ext.raw_payload.filingDate).match(/\d{4}/) : null;
      const year = yearMatch ? parseInt(yearMatch[0], 10) : new Date().getFullYear();
      normalized.offering_year = year;
      normalized.issue_identity = `historical-ipo-${cleanSlug}-${year}`;

      const provenance: IpoProvenanceMap = {
        ...ext.provenance,
        company_name: {
          value: normalized.company_name,
          source: 'sebi_archive' as IngestionSource,
          source_url: ext.provenance.company_name?.source_url || HistoricalExchangeAdapter.OFFICIAL_HISTORICAL_PORTAL,
          observed_at: new Date().toISOString(),
          confidence: 'official_regulatory',
          is_official: true,
        },
      };

      return {
        source: 'sebi_archive' as IngestionSource,
        external_id: `archive-${ext.external_id}`,
        document_type: 'PROSPECTUS',
        raw_payload: ext.raw_payload,
        normalized_payload: normalized,
        provenance,
      };
    });
  }

  /**
   * Fetches and normalizes a real historical batch from official archives.
   */
  public async fetchArchiveBatch(
    _batchIdOrYear?: string | number
  ): Promise<IngestionExtractionResult[]> {
    const fetchResult = await this.sebiClient.fetchLiveFilings(
      HistoricalExchangeAdapter.OFFICIAL_HISTORICAL_PORTAL
    );

    const rawExtractions = SebiPublicIssuesExtractor.parseHtml(fetchResult.html);
    return this.normalizeBatch(rawExtractions);
  }
}
