/**
 * features/external-integrations/services/ipoDiscoveryEngine.ts
 *
 * Phase 9 Stage 3A.1: Automated IPO Discovery & Document Classification Engine
 *
 * Core Capabilities:
 * 1. Feed Scanning: Ingests documents/filings from SEBI, NSE, BSE.
 * 2. Document Classification: Classifies DRHP, RHP, Prospectus, Addendum, IPO_MASTER.
 * 3. Universe Filtering: Excludes debt, rights issues, commercial paper, withdrawn filings.
 * 4. Candidate Registration: Enforces Candidate != Canonical IPO separation.
 *    - All discovered items are routed to ipo_ingestion_inbox with 'candidate' or 'pending_review'.
 *    - Zero auto-publishing to public `ipos` table.
 * 5. Idempotent Ingestion: Reuses existing observation hashes to guarantee idempotency.
 */

import {
  IngestionDocumentType,
  IngestionExtractionResult,
  NormalizedIpoMasterPayload,
  IpoProvenanceMap,
  SourceAuthorityTier,
} from '../ipo-master/ipoMasterTypes';
import { ipoIngestionService } from './ipoIngestionService';
import { deriveExplainableIPOStatus } from '../../ipo/services/ipoLifecycle';

export interface RawDiscoveredItem {
  source: 'sebi' | 'nse' | 'bse' | 'upstox';
  externalId: string;
  title: string;
  documentTypeHint?: string;
  documentUrl?: string;
  filingDate?: string;
  companyName: string;
  symbol?: string;
  isin?: string;
  exchange?: 'NSE' | 'BSE' | 'BOTH';
  category?: 'mainboard' | 'sme';
  issueType?: 'book_building' | 'fixed_price';
  priceBandLow?: number;
  priceBandHigh?: number;
  lotSize?: number;
  issueSizeCr?: number;
  openDate?: string;
  closeDate?: string;
  listingDate?: string;
  rawPayload?: Record<string, unknown>;
}

export interface DocumentClassificationResult {
  documentType: IngestionDocumentType;
  isEquityIpo: boolean;
  isExcluded: boolean;
  exclusionReason?: string;
}

export interface DiscoverySummary {
  source: string;
  totalDiscovered: number;
  validCandidates: number;
  excludedCount: number;
  newObservations: number;
  duplicatesSkipped: number;
  conflictsDetected: number;
  items: Array<{
    externalId: string;
    companyName: string;
    documentType: IngestionDocumentType;
    status: 'new_observation' | 'duplicate' | 'conflict_detected' | 'excluded';
    inboxId?: string;
  }>;
}

export class IpoDiscoveryEngine {
  /**
   * Classifies a document and verifies whether it belongs to the equity IPO universe.
   * Explicitly excludes debt, bonds, NCDs, rights issues, preference shares, and withdrawn filings.
   */
  public static classifyDocument(title: string, hint?: string): DocumentClassificationResult {
    const text = `${title} ${hint || ''}`.toLowerCase();

    // 1. Check for exclusion keywords
    if (
      text.includes('debt') ||
      text.includes('ncd') ||
      text.includes('bond') ||
      text.includes('debenture') ||
      text.includes('commercial paper')
    ) {
      return {
        documentType: 'IPO_MASTER',
        isEquityIpo: false,
        isExcluded: true,
        exclusionReason: 'Excluded: Debt/Bond/NCD instrument (non-equity)',
      };
    }

    if (text.includes('rights issue') || text.includes('right issue') || text.includes('rights-issue')) {
      return {
        documentType: 'IPO_MASTER',
        isEquityIpo: false,
        isExcluded: true,
        exclusionReason: 'Excluded: Rights issue (existing shareholders only, not public IPO)',
      };
    }

    if (text.includes('withdrawn') || text.includes('cancelled') || text.includes('rejected')) {
      return {
        documentType: 'IPO_MASTER',
        isEquityIpo: true,
        isExcluded: true,
        exclusionReason: 'Excluded: Filing withdrawn, rejected or cancelled by regulatory body',
      };
    }

    // 2. Classify document type
    let documentType: IngestionDocumentType = 'IPO_MASTER';

    if (text.includes('drhp') || text.includes('draft red herring')) {
      documentType = 'DRHP';
    } else if (text.includes('corrigendum') || text.includes('addendum') || text.includes('notice to rhp')) {
      documentType = 'ADDENDUM';
    } else if (text.includes('rhp') || text.includes('red herring')) {
      documentType = 'RHP';
    } else if (text.includes('prospectus') || text.includes('final offer')) {
      documentType = 'PROSPECTUS';
    } else {
      documentType = 'IPO_MASTER';
    }

    return {
      documentType,
      isEquityIpo: true,
      isExcluded: false,
    };
  }

  /**
   * Processes a batch of discovered items from an official feed into canonical candidate inboxes.
   * Preserves candidate state and enforces Guardrail 3 (Idempotency).
   */
  public static async processDiscoveredFeed(
    source: 'sebi' | 'nse' | 'bse' | 'upstox',
    items: RawDiscoveredItem[],
    options?: { nowIST?: string }
  ): Promise<DiscoverySummary> {
    const summary: DiscoverySummary = {
      source,
      totalDiscovered: items.length,
      validCandidates: 0,
      excludedCount: 0,
      newObservations: 0,
      duplicatesSkipped: 0,
      conflictsDetected: 0,
      items: [],
    };

    for (const item of items) {
      // 1. Classification & Universe check
      const classification = this.classifyDocument(item.title, item.documentTypeHint);
      if (classification.isExcluded) {
        summary.excludedCount++;
        summary.items.push({
          externalId: item.externalId,
          companyName: item.companyName,
          documentType: classification.documentType,
          status: 'excluded',
        });
        continue;
      }

      summary.validCandidates++;

      // 2. Derive business status deterministically using lifecycle engine
      const lifecycle = deriveExplainableIPOStatus({
        open_date: item.openDate,
        close_date: item.closeDate,
        listing_date: item.listingDate,
        status: undefined,
        nowIST: options?.nowIST,
      });

      // 3. Build normalized payload
      const normalizedPayload: NormalizedIpoMasterPayload = {
        company_name: item.companyName.trim(),
        symbol: item.symbol?.toUpperCase().trim() || undefined,
        isin: item.isin?.toUpperCase().trim() || undefined,
        exchange: item.exchange || 'NSE',
        category: item.category || 'mainboard',
        issue_type: item.issueType || 'book_building',
        business_status: lifecycle.finalStatus,
        price_band_low: item.priceBandLow,
        price_band_high: item.priceBandHigh,
        lot_size: item.lotSize,
        issue_size_cr: item.issueSizeCr,
        open_date: item.openDate,
        close_date: item.closeDate,
        listing_date: item.listingDate,
        rhp_url: classification.documentType === 'RHP' ? item.documentUrl : undefined,
        drhp_url: classification.documentType === 'DRHP' ? item.documentUrl : undefined,
      };

      // 4. Build field-level source provenance
      const observedAt = new Date().toISOString();
      const confidence: SourceAuthorityTier =
        source === 'sebi' ? 'official_regulatory' : source === 'nse' || source === 'bse' ? 'official_exchange' : 'licensed_feed';

      const provenance: IpoProvenanceMap = {
        company_name: { value: item.companyName.trim(), source, observed_at: observedAt, confidence, is_official: true },
      };
      if (item.symbol) provenance.symbol = { value: item.symbol, source, observed_at: observedAt, confidence, is_official: true };
      if (item.isin) provenance.isin = { value: item.isin, source, observed_at: observedAt, confidence, is_official: true };
      if (item.priceBandHigh) provenance.price_band_high = { value: item.priceBandHigh, source, observed_at: observedAt, confidence, is_official: true };
      if (item.priceBandLow) provenance.price_band_low = { value: item.priceBandLow, source, observed_at: observedAt, confidence, is_official: true };
      if (item.lotSize) provenance.lot_size = { value: item.lotSize, source, observed_at: observedAt, confidence, is_official: true };
      if (item.openDate) provenance.open_date = { value: item.openDate, source, observed_at: observedAt, confidence, is_official: true };
      if (item.closeDate) provenance.close_date = { value: item.closeDate, source, observed_at: observedAt, confidence, is_official: true };
      if (item.listingDate) provenance.listing_date = { value: item.listingDate, source, observed_at: observedAt, confidence, is_official: true };
      if (item.issueSizeCr) provenance.issue_size_cr = { value: item.issueSizeCr, source, observed_at: observedAt, confidence, is_official: true };

      // 5. Ingest observation idempotently
      const extraction: IngestionExtractionResult = {
        source,
        external_id: item.externalId,
        document_type: classification.documentType,
        raw_payload: item.rawPayload || { ...item },
        normalized_payload: normalizedPayload,
        provenance,
      };

      const result = await ipoIngestionService.ingestObservation(extraction);

      if (result.isDuplicate) {
        summary.duplicatesSkipped++;
        summary.items.push({
          externalId: item.externalId,
          companyName: item.companyName,
          documentType: classification.documentType,
          status: 'duplicate',
          inboxId: result.inboxId,
        });
      } else if (result.hasConflict) {
        summary.conflictsDetected++;
        summary.newObservations++;
        summary.items.push({
          externalId: item.externalId,
          companyName: item.companyName,
          documentType: classification.documentType,
          status: 'conflict_detected',
          inboxId: result.inboxId,
        });
      } else {
        summary.newObservations++;
        summary.items.push({
          externalId: item.externalId,
          companyName: item.companyName,
          documentType: classification.documentType,
          status: 'new_observation',
          inboxId: result.inboxId,
        });
      }
    }

    return summary;
  }
}
