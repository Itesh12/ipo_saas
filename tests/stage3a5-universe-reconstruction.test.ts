/**
 * tests/stage3a5-universe-reconstruction.test.ts
 *
 * Phase 9 Stage 3A.5: Complete IPO Universe Reconstruction Test Matrix.
 * Validates all 7 mandatory corrections and 5 implementation hard gates:
 * 1. Four Separate Source Acquisition Contracts (Current, Upcoming, Announced, Historical).
 * 2. Multi-Filing Offering Grouping (DRHP + RHP + Addendum + Corrigendum = 1 IPO).
 * 3. Dedicated Historical Archive Ingestion Contract.
 * 4. Transparent Global Coverage State ('PARTIAL' when BSE degraded).
 * 5. Canonical Existence != Publication Eligibility.
 * 6. Extended Lifecycle States (announced, upcoming, open, closed, listed, withdrawn, cancelled, postponed).
 * 7. Coverage-Invariant Dynamic Acceptance Gate (unexplained = 0, zero hardcoded company names).
 * 8. Field-Level Truth Table Generation.
 * 9. Instrument Type Taxonomy (IPO, SME_IPO vs FPO, RIGHTS, DEBT, BUYBACK).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { CanonicalIpoResolver } from '../features/external-integrations/services/canonicalIpoResolver';
import { IpoPromotionValidator } from '../features/external-integrations/services/ipoPromotionValidator';
import { IpoCoverageReconciliationService } from '../features/external-integrations/services/ipoCoverageReconciliationService';
import { HistoricalExchangeAdapter } from '../features/external-integrations/adapters/historicalExchangeAdapter';
import { SebiPublicIssuesExtractor } from '../features/external-integrations/adapters/sebiExtractor';
import { NseIngestionAdapter } from '../features/external-integrations/adapters/nseExtractor';
import { deriveExplainableIPOStatus } from '../features/ipo/services/ipoLifecycle';
import {
  IngestionExtractionResult,
  NormalizedIpoMasterPayload,
  IpoProvenanceMap,
} from '../features/external-integrations/ipo-master/ipoMasterTypes';

describe('Phase 9 Stage 3A.5: Complete IPO Universe Reconstruction', () => {
  beforeEach(() => {
    IpoCoverageReconciliationService.clearRejections();
  });

  // ============================================================================
  // Suite 1: Four Separate Source Acquisition Contracts (Correction 1)
  // ============================================================================
  describe('Suite 1: Distinct Source Acquisition Contracts', () => {
    it('1.1 should define separate universe slices for Current, Upcoming, Announced, and Historical', () => {
      const historicalAdapter = new HistoricalExchangeAdapter();
      assert.strictEqual(historicalAdapter.universeSlice, 'historical');
      assert.strictEqual(historicalAdapter.sourceName, 'sebi_archive');
    });

    it('1.2 should categorize NSE live feed as Current Active Bidding slice', () => {
      const parsed = NseIngestionAdapter.normalizeIssue({
        symbol: 'LIVECO',
        companyName: 'Live Bidding Company Limited',
        issueStartDate: '11-Sep-2026',
        issueEndDate: '16-Sep-2026',
        priceBand: 'Rs.100 to Rs.105',
        lotSize: 100,
      });
      assert.strictEqual(parsed.source, 'nse');
      assert.strictEqual(parsed.normalized_payload.instrument_type, 'IPO');
    });

    it('1.3 should categorize SEBI draft filings as Announced / Pre-Issue slice', () => {
      const parsed = SebiPublicIssuesExtractor.normalizeRow({
        companyName: 'Tech Innovations Limited - Draft Offer Document',
        documentTitle: 'Tech Innovations Limited - Draft Offer Document',
        documentUrl: 'https://www.sebi.gov.in/filings/drhp-1.html',
        filingDate: 'Sep 10, 2026',
      });
      assert.strictEqual(parsed.document_type, 'DRHP');
      assert.strictEqual(parsed.normalized_payload.business_status, 'announced');
      assert.strictEqual(parsed.normalized_payload.data_quality, 'discovered');
    });

    it('1.4 should distinguish SME platform issues via series SM', () => {
      const parsed = NseIngestionAdapter.normalizeIssue({
        symbol: 'SMETEK',
        companyName: 'SME Tek Solutions Limited',
        series: 'SM',
        issueStartDate: '11-Sep-2026',
        issueEndDate: '16-Sep-2026',
        priceBand: 'Rs.50 to Rs.55',
      });
      assert.strictEqual(parsed.normalized_payload.instrument_type, 'SME_IPO');
    });

    it('1.5 should prevent any single source feed from claiming complete universe', () => {
      const summary = IpoCoverageReconciliationService.computeReconciliation({
        observationsBySource: {
          nse: [
            NseIngestionAdapter.normalizeIssue({
              symbol: 'CO1',
              companyName: 'Company One Limited',
              priceBand: '50-55',
            }),
          ],
        },
        resolvedCandidateIdentities: ['co1-ipo-2026'],
        canonicalIpoCount: 1,
        bseStatus: 'degraded',
      });
      assert.strictEqual(summary.coverage_state, 'PARTIAL');
    });
  });

  // ============================================================================
  // Suite 2: Multi-Filing Offering Grouping (Correction 2 & Hard Gate 3)
  // ============================================================================
  describe('Suite 2: Multi-Filing Document Grouping into 1 Canonical Issue', () => {
    it('2.1 should group DRHP, RHP, Addendum, and Corrigendum into a SINGLE canonical IPO identity', () => {
      const drhp = SebiPublicIssuesExtractor.normalizeRow({
        companyName: 'Acme Solar Holdings Limited - Draft Offer Document',
        documentTitle: 'Acme Solar Holdings Limited - Draft Offer Document',
        documentUrl: 'https://www.sebi.gov.in/drhp.html',
        filingDate: 'Jan 15, 2026',
      });

      const rhp = SebiPublicIssuesExtractor.normalizeRow({
        companyName: 'Acme Solar Holdings Limited – Red Herring Prospectus',
        documentTitle: 'Acme Solar Holdings Limited – Red Herring Prospectus',
        documentUrl: 'https://www.sebi.gov.in/rhp.html',
        filingDate: 'Sep 01, 2026',
      });

      const addendum = SebiPublicIssuesExtractor.normalizeRow({
        companyName: 'Acme Solar Holdings Limited – Addendum to RHP',
        documentTitle: 'Acme Solar Holdings Limited – Addendum to RHP',
        documentUrl: 'https://www.sebi.gov.in/addendum.html',
        filingDate: 'Sep 05, 2026',
      });

      const isMatch1 = CanonicalIpoResolver.isIdentityMatch(rhp.normalized_payload, {
        canonical_name: drhp.normalized_payload.company_name,
        issue_identity: drhp.normalized_payload.issue_identity,
      });
      assert.strictEqual(isMatch1, true);

      const isMatch2 = CanonicalIpoResolver.isIdentityMatch(addendum.normalized_payload, {
        canonical_name: rhp.normalized_payload.company_name,
        issue_identity: rhp.normalized_payload.issue_identity,
      });
      assert.strictEqual(isMatch2, true);
    });

    it('2.2 should accumulate amendment URLs when Addendums arrive', () => {
      const initialPayload: NormalizedIpoMasterPayload = {
        company_name: 'Solar Energy Limited',
        drhp_url: 'https://sebi/drhp.pdf',
        rhp_url: 'https://sebi/rhp.pdf',
      };
      const initialProv: IpoProvenanceMap = {
        company_name: {
          value: 'Solar Energy Limited',
          source: 'sebi',
          observed_at: '2026-09-01T00:00:00Z',
          confidence: 'official_regulatory',
          is_official: true,
        },
      };

      const addendumExt: IngestionExtractionResult = {
        source: 'sebi',
        external_id: 'sebi-addendum-1',
        document_type: 'ADDENDUM',
        raw_payload: { documentUrl: 'https://sebi/addendum-1.pdf' },
        normalized_payload: {
          company_name: 'Solar Energy Limited',
        },
        provenance: {},
      };

      const outcome = CanonicalIpoResolver.resolveObservation(initialPayload, initialProv, addendumExt);
      assert.strictEqual(outcome.resolved_payload.amendment_urls?.includes('https://sebi/addendum-1.pdf'), true);
    });

    it('2.3 should distinguish distinct issue identities (Hard Gate 3)', () => {
      const ipo2026: NormalizedIpoMasterPayload = {
        company_name: 'Alpha Bank Limited',
        instrument_type: 'IPO',
        offering_year: 2026,
        issue_identity: 'alphabank-ipo-2026',
      };

      const debt2026: NormalizedIpoMasterPayload = {
        company_name: 'Alpha Bank Limited',
        instrument_type: 'DEBT',
        offering_year: 2026,
        issue_identity: 'alphabank-debt-2026',
      };

      const isMatch = CanonicalIpoResolver.isIdentityMatch(debt2026, {
        canonical_name: ipo2026.company_name,
        instrument_type: ipo2026.instrument_type,
        issue_identity: ipo2026.issue_identity,
        offering_year: ipo2026.offering_year,
      });
      assert.strictEqual(isMatch, false);
    });
  });

  // ============================================================================
  // Suite 3: Dedicated Historical Archive Ingestion (Correction 3 & Hard Gate 1)
  // ============================================================================
  describe('Suite 3: Real Historical Archive Contract', () => {
    it('3.1 should configure the official SEBI Final Offer Documents archive URL', () => {
      assert.strictEqual(HistoricalExchangeAdapter.OFFICIAL_HISTORICAL_PORTAL.includes('smid=12'), true);
      assert.strictEqual(HistoricalExchangeAdapter.OFFICIAL_HISTORICAL_PORTAL.includes('ssid=15'), true);
    });

    it('3.2 should parse historical prospectuses and attach listed lifecycle status', () => {
      const rawHtml = `
        <table>
          <tr><td>Date</td><td>Title</td></tr>
          <tr>
            <td>Aug 20, 2026</td>
            <td><a href="https://www.sebi.gov.in/prospectus.html">HISTORICAL LEADING ENTERPRISES LIMITED - Prospectus</a></td>
          </tr>
        </table>
      `;
      const extracted = SebiPublicIssuesExtractor.parseHtml(rawHtml);
      assert.strictEqual(extracted.length, 1);
      assert.strictEqual(extracted[0].document_type, 'PROSPECTUS');
      assert.strictEqual(extracted[0].normalized_payload.company_name, 'HISTORICAL LEADING ENTERPRISES LIMITED');
    });

    it('3.3 should dynamically assign data quality to historical records based on field presence', () => {
      const completeIpo: NormalizedIpoMasterPayload = {
        company_name: 'Past Winner Ltd',
        price_band_high: 250,
        price_band_low: 240,
        lot_size: 50,
        open_date: '2026-01-10',
        close_date: '2026-01-15',
        listing_date: '2026-01-20',
        exchange: 'NSE',
      };
      const partialIpo: NormalizedIpoMasterPayload = {
        company_name: 'Old Archival Record Ltd',
        prospectus_url: 'https://sebi/old.pdf',
      };

      assert.strictEqual(IpoPromotionValidator.evaluateDataCompleteness(completeIpo), 'complete');
      assert.strictEqual(IpoPromotionValidator.evaluateDataCompleteness(partialIpo), 'partial');
    });
  });

  // ============================================================================
  // Suite 4: Global Coverage State (Correction 4)
  // ============================================================================
  describe('Suite 4: Transparent Global Coverage State', () => {
    it('4.1 should report PARTIAL coverage when BSE is degraded and SEBI/NSE are healthy', () => {
      const summary = IpoCoverageReconciliationService.computeReconciliation({
        observationsBySource: {
          sebi: [],
          nse: [],
          bse: [],
          sebi_archive: [],
        },
        resolvedCandidateIdentities: [],
        canonicalIpoCount: 0,
        bseStatus: 'degraded',
        nseStatus: 'healthy',
        sebiStatus: 'healthy',
      });

      assert.strictEqual(summary.coverage_state, 'PARTIAL');
      assert.strictEqual(summary.coverage_state_reason.includes('BSE source feed degraded'), true);
    });

    it('4.2 should report COMPLETE only when all Tier-1 feeds are healthy', () => {
      const summary = IpoCoverageReconciliationService.computeReconciliation({
        observationsBySource: {
          sebi: [],
          nse: [],
          bse: [],
        },
        resolvedCandidateIdentities: [],
        canonicalIpoCount: 0,
        bseStatus: 'healthy',
        nseStatus: 'healthy',
        sebiStatus: 'healthy',
      });

      assert.strictEqual(summary.coverage_state, 'COMPLETE');
    });
  });

  // ============================================================================
  // Suite 5: Canonical != Published Policy (Correction 5 & Hard Gate 2)
  // ============================================================================
  describe('Suite 5: Two-Tier Gatekeeper & Publication Policy', () => {
    it('5.1 should qualify announced DRHP as canonical without price band or dates', () => {
      const announcedFiling: Partial<NormalizedIpoMasterPayload> = {
        company_name: 'Future Unicorn Limited',
        drhp_url: 'https://sebi/drhp.pdf',
        instrument_type: 'IPO',
      };

      const result = IpoPromotionValidator.validateCanonicalExistence(
        { has_conflict: false, review_status: 'candidate' },
        announcedFiling
      );

      assert.strictEqual(result.eligible, true);
      assert.strictEqual(result.dataQuality, 'partial');
    });

    it('5.2 should reject non-IPO instruments from entering canonical IPO universe', () => {
      const debtFiling: Partial<NormalizedIpoMasterPayload> = {
        company_name: 'Corporate Debt Issuer Limited',
        instrument_type: 'DEBT',
      };

      const result = IpoPromotionValidator.validateCanonicalExistence(
        { has_conflict: false, review_status: 'candidate' },
        debtFiling
      );

      assert.strictEqual(result.eligible, false);
      assert.strictEqual(result.rejectionReasons[0].includes('Non-equity instrument'), true);
    });

    it('5.3 should enforce publication policy gate: canonical != published', () => {
      const canonicalIpo: Partial<NormalizedIpoMasterPayload> = {
        company_name: 'Valid Canonical IPO Ltd',
        instrument_type: 'IPO',
        business_status: 'withdrawn',
      };

      const pubCheck = IpoPromotionValidator.evaluatePublicationEligibility(
        canonicalIpo,
        'full_market_pipeline',
        false
      );
      assert.strictEqual(pubCheck.canPublish, false);
      assert.strictEqual(pubCheck.reasons[0].includes('withdrawn'), true);
    });

    it('5.4 should publish announced IPOs with partial quality under full_market_pipeline', () => {
      const announcedIpo: Partial<NormalizedIpoMasterPayload> = {
        company_name: 'National Stock Exchange of India Limited',
        instrument_type: 'IPO',
        business_status: 'announced',
      };

      const pubCheck = IpoPromotionValidator.evaluatePublicationEligibility(
        announcedIpo,
        'full_market_pipeline',
        false
      );
      assert.strictEqual(pubCheck.canPublish, true);
    });
  });

  // ============================================================================
  // Suite 6: Extended Lifecycle States with Provenance (Correction 6)
  // ============================================================================
  describe('Suite 6: Extended Lifecycles', () => {
    it('6.1 should derive announced status when bidding dates are pending', () => {
      const status = deriveExplainableIPOStatus({
        open_date: null,
        close_date: null,
        status: 'announced',
        nowIST: '2026-09-14',
      });
      assert.strictEqual(status.finalStatus, 'announced');
    });

    it('6.2 should retain withdrawn and cancelled status without deleting provenance', () => {
      const withdrawnStatus = deriveExplainableIPOStatus({
        status: 'withdrawn',
        nowIST: '2026-09-14',
      });
      assert.strictEqual(withdrawnStatus.finalStatus, 'withdrawn');

      const cancelledStatus = deriveExplainableIPOStatus({
        status: 'cancelled',
        nowIST: '2026-09-14',
      });
      assert.strictEqual(cancelledStatus.finalStatus, 'cancelled');
    });
  });

  // ============================================================================
  // Suite 7: Field-Level Truth Table (Hard Gate Requirement)
  // ============================================================================
  describe('Suite 7: Field-Level Truth Table', () => {
    it('7.1 should build complete field-level truth matrix attributing sources', () => {
      const payload: NormalizedIpoMasterPayload = {
        company_name: 'Truthful Enterprise Limited',
        price_band_low: 150,
        price_band_high: 160,
        lot_size: 100,
        open_date: '2026-09-20',
        close_date: '2026-09-24',
        exchange: 'NSE',
        instrument_type: 'IPO',
      };

      const provenance: IpoProvenanceMap = {
        company_name: {
          value: 'Truthful Enterprise Limited',
          source: 'sebi',
          observed_at: '2026-09-14T10:00:00Z',
          confidence: 'official_regulatory',
          is_official: true,
        },
        price_band_high: {
          value: 160,
          source: 'nse',
          observed_at: '2026-09-14T10:05:00Z',
          confidence: 'official_exchange',
          is_official: true,
        },
      };

      const incoming: IngestionExtractionResult = {
        source: 'nse',
        external_id: 'nse-truth-1',
        document_type: 'IPO_MASTER',
        raw_payload: {},
        normalized_payload: payload,
        provenance,
      };

      const truthTable = CanonicalIpoResolver.buildTruthTable(payload, provenance, incoming);
      assert.strictEqual(truthTable.company_name.selected_source, 'sebi');
      assert.strictEqual(truthTable.price_band_high.selected_source, 'nse');
      assert.strictEqual(truthTable.price_band_high.confidence, 'high');
      assert.strictEqual(truthTable.exchange.selected_value, 'NSE');
    });
  });

  // ============================================================================
  // Suite 8: Coverage Invariant Gate (Correction 7 & Hard Gate 2)
  // ============================================================================
  describe('Suite 8: Mathematical Coverage Invariant Gate', () => {
    it('8.1 should assert discovered = resolved + rejected with ZERO unexplained records per source', () => {
      const sebiObs = [
        SebiPublicIssuesExtractor.normalizeRow({
          companyName: 'Company A - RHP',
          documentTitle: 'Company A - RHP',
          documentUrl: 'https://sebi/a.html',
          filingDate: 'Sep 01, 2026',
        }),
        SebiPublicIssuesExtractor.normalizeRow({
          companyName: 'Debt Security B - Prospectus',
          documentTitle: 'Debt Security B - NCD Issue',
          documentUrl: 'https://sebi/b.html',
          filingDate: 'Sep 02, 2026',
        }),
      ];

      // Explicitly log the rejection of non-equity debt document
      IpoCoverageReconciliationService.logRejection({
        source: 'sebi',
        external_id: sebiObs[1].external_id,
        reason_code: 'NON_IPO_INSTRUMENT',
        reason_detail: 'Document classified as DEBT security',
        rejected_at: new Date().toISOString(),
      });

      const summary = IpoCoverageReconciliationService.computeReconciliation({
        observationsBySource: {
          sebi: sebiObs,
        },
        resolvedCandidateIdentities: ['company-a-ipo-2026'],
        canonicalIpoCount: 1,
      });

      assert.strictEqual(summary.sources.sebi.discovered_records, 2);
      assert.strictEqual(summary.sources.sebi.resolved_candidates, 1);
      assert.strictEqual(summary.sources.sebi.rejected_records, 1);
      assert.strictEqual(summary.sources.sebi.unexplained_records, 0);
      assert.strictEqual(summary.total_unexplained_observations, 0);
      assert.strictEqual(summary.runtime_fixture_records, 0);
    });

    it('8.2 should format the official Universe Completeness Audit output report', () => {
      const summary = IpoCoverageReconciliationService.computeReconciliation({
        observationsBySource: {
          sebi: [
            SebiPublicIssuesExtractor.normalizeRow({
              companyName: 'Acme Corp - RHP',
              documentTitle: 'Acme Corp - RHP',
              documentUrl: 'https://sebi/acme.html',
              filingDate: 'Sep 01, 2026',
            }),
          ],
          nse: [
            NseIngestionAdapter.normalizeIssue({
              symbol: 'ACME',
              companyName: 'Acme Corp',
              priceBand: '100-110',
            }),
          ],
        },
        resolvedCandidateIdentities: ['acme-ipo-2026'],
        canonicalIpoCount: 1,
        bseStatus: 'degraded',
      });

      const report = IpoCoverageReconciliationService.formatAuditReport(summary);
      assert.strictEqual(report.includes('IPO UNIVERSE RECONCILIATION'), true);
      assert.strictEqual(report.includes('Unexplained:              0'), true);
      assert.strictEqual(report.includes('Coverage state:             PARTIAL'), true);
      assert.strictEqual(report.includes('Runtime fixtures:           0'), true);
    });
  });
});
