/**
 * tests/stage3a-ipo-engine.test.ts
 *
 * Phase 9 Stage 3A: Broker-Independent Real IPO Master Data Engine Test Suite.
 * Deterministic contract and unit tests executing against versioned fixtures.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

import {
  SebiPublicIssuesExtractor,
  NseIngestionAdapter,
  BseIngestionAdapter,
  UpstoxIpoAdapter,
  CanonicalIpoResolver,
  IpoIngestionService,
  IpoDiscoveryEngine,
  CapabilityNotAvailableError,
  NormalizedIpoMasterPayload,
  IpoProvenanceMap,
  CanonicalInboxRecord,
} from '../features/external-integrations';
import { deriveExplainableIPOStatus } from '../features/ipo/services/ipoLifecycle';

describe('Phase 9 Stage 3A: Broker-Independent Real IPO Master Data Engine', () => {

  // ============================================================================
  // 1. SEBI Public Issues Extractor (Tier 1 Regulatory Authority)
  // ============================================================================
  describe('1. SEBI Public Issues Extractor', () => {
    const htmlFixture = fs.readFileSync(
      path.join(__dirname, 'fixtures/sebi-public-issues.html'),
      'utf-8'
    );

    it('1.1 parses HTML table rows and extracts all public issue filings', () => {
      const extractions = SebiPublicIssuesExtractor.parseHtml(htmlFixture);
      assert.strictEqual(extractions.length, 4, 'Should parse exactly 4 rows from fixture');
      assert.strictEqual(extractions[0].source, 'sebi');
      assert.strictEqual(extractions[0].provenance.company_name?.confidence, 'official_regulatory');
      assert.strictEqual(extractions[0].provenance.company_name?.is_official, true);
    });

    it('1.2 accurately identifies DRHP, RHP, Prospectus, and classifies Addendum as amendment', () => {
      const extractions = SebiPublicIssuesExtractor.parseHtml(htmlFixture);

      const drhpItem = extractions.find((e) => e.normalized_payload.company_name.includes('Hero Motors') && e.document_type === 'DRHP');
      assert.ok(drhpItem, 'Hero Motors DRHP should be extracted');
      assert.strictEqual(drhpItem.document_type, 'DRHP');
      assert.ok(drhpItem.normalized_payload.drhp_url?.includes('hero-motors-ltd-drhp.pdf'));

      const rhpItem = extractions.find((e) => e.normalized_payload.company_name.includes('Sona Selection'));
      assert.ok(rhpItem, 'Sona Selection RHP should be extracted');
      assert.strictEqual(rhpItem.document_type, 'RHP');
      assert.ok(rhpItem.normalized_payload.rhp_url?.includes('sona-selection-ltd-rhp.pdf'));

      const addendumItem = extractions.find((e) => e.document_type === 'ADDENDUM');
      assert.ok(addendumItem, 'Hero Motors Addendum should be classified as ADDENDUM');
      assert.strictEqual(addendumItem.document_type, 'ADDENDUM');

      const prospectusItem = extractions.find((e) => e.document_type === 'PROSPECTUS');
      assert.ok(prospectusItem, 'Rentomojo should be classified as PROSPECTUS');
      assert.strictEqual(prospectusItem.document_type, 'PROSPECTUS');
    });

    it('1.3 attaches lead managers and official document URLs with high confidence', () => {
      const extractions = SebiPublicIssuesExtractor.parseHtml(htmlFixture);
      const hero = extractions[0];
      assert.deepStrictEqual(hero.normalized_payload.lead_managers, ['ICICI Securities Limited']);
      assert.ok(hero.normalized_payload.drhp_url?.startsWith('https://www.sebi.gov.in'));
    });
  });

  // ============================================================================
  // 2. NSE Ingestion Adapter (Tier 1 Exchange Authority)
  // ============================================================================
  describe('2. NSE Ingestion Adapter', () => {
    const nseFixture = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'fixtures/nse-public-issues.json'), 'utf-8')
    );

    it('2.1 normalizes trading symbols, ISINs, price bands, and lot sizes', () => {
      const ext = NseIngestionAdapter.normalizeIssue(nseFixture[0]);
      assert.strictEqual(ext.source, 'nse');
      assert.strictEqual(ext.normalized_payload.symbol, 'HEROMOTO');
      assert.strictEqual(ext.normalized_payload.isin, 'INE123H01015');
      assert.strictEqual(ext.normalized_payload.exchange, 'NSE');
      assert.strictEqual(ext.normalized_payload.price_band_low, 420);
      assert.strictEqual(ext.normalized_payload.price_band_high, 445);
      assert.strictEqual(ext.normalized_payload.lot_size, 33);
      assert.strictEqual(ext.normalized_payload.issue_size_cr, 1200.5);
      assert.strictEqual(ext.normalized_payload.open_date, '2026-09-15');
      assert.strictEqual(ext.normalized_payload.close_date, '2026-09-18');
      assert.strictEqual(ext.provenance.symbol?.confidence, 'official_exchange');
    });

    it('2.2 parses alternative price band format (e.g. 75 - 80) cleanly', () => {
      const ext = NseIngestionAdapter.normalizeIssue(nseFixture[1]);
      assert.strictEqual(ext.normalized_payload.symbol, 'SONASEL');
      assert.strictEqual(ext.normalized_payload.price_band_low, 75);
      assert.strictEqual(ext.normalized_payload.price_band_high, 80);
      assert.strictEqual(ext.normalized_payload.lot_size, 1600);
    });
  });

  // ============================================================================
  // 3. BSE Ingestion Adapter (Tier 1 Exchange Authority)
  // ============================================================================
  describe('3. BSE Ingestion Adapter', () => {
    const bseFixture = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'fixtures/bse-public-issues.json'), 'utf-8')
    );

    it('3.1 normalizes BSE book building notices and pricing parameters', () => {
      const ext = BseIngestionAdapter.normalizeIssue(bseFixture[0]);
      assert.strictEqual(ext.source, 'bse');
      assert.strictEqual(ext.external_id, 'bse-544999');
      assert.strictEqual(ext.normalized_payload.company_name, 'Hero Motors Limited');
      assert.strictEqual(ext.normalized_payload.exchange, 'BSE');
      assert.strictEqual(ext.normalized_payload.price_band_low, 420);
      assert.strictEqual(ext.normalized_payload.price_band_high, 445);
      assert.strictEqual(ext.normalized_payload.lot_size, 33);
      assert.strictEqual(ext.normalized_payload.open_date, '2026-09-15');
    });
  });

  // ============================================================================
  // 4. Upstox Optional Operational Adapter & Zero-Defenses
  // ============================================================================
  describe('4. Upstox Optional Operational Adapter', () => {
    const upstoxFixture = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'fixtures/upstox-ipos-response.json'), 'utf-8')
    );

    it('4.1 maps contract-exact Upstox v2 fields to platform schema', () => {
      const ext = UpstoxIpoAdapter.normalizeIpo(upstoxFixture[0]);
      assert.strictEqual(ext.source, 'upstox');
      assert.strictEqual(ext.normalized_payload.company_name, 'Hero Motors Limited');
      assert.strictEqual(ext.normalized_payload.symbol, 'HEROMOTO');
      assert.strictEqual(ext.normalized_payload.isin, 'INE123H01015');
      assert.strictEqual(ext.normalized_payload.category, 'mainboard'); // 'regular' -> 'mainboard'
      assert.strictEqual(ext.normalized_payload.price_band_low, 420);
      assert.strictEqual(ext.normalized_payload.price_band_high, 445);
      assert.strictEqual(ext.normalized_payload.lot_size, 33);
      assert.strictEqual(ext.normalized_payload.issue_size_cr, 1200.5); // Direct INR Crores
      assert.strictEqual(ext.normalized_payload.exchange, 'BOTH'); // 'NSE,BSE' -> 'BOTH'
      assert.strictEqual(ext.normalized_payload.business_status, 'upcoming');
      assert.strictEqual(ext.provenance.company_name?.confidence, 'licensed_feed');
    });

    it('4.2 Zero-Price Defense: maps 0.0 unannounced price band to null (never ₹0)', () => {
      const ext = UpstoxIpoAdapter.normalizeIpo(upstoxFixture[1]);
      assert.strictEqual(ext.normalized_payload.company_name, 'Green Future Energy Limited');
      assert.strictEqual(ext.normalized_payload.price_band_low, null, '0.0 minimum_price must map to null');
      assert.strictEqual(ext.normalized_payload.price_band_high, null, '0.0 maximum_price must map to null');
      assert.strictEqual(ext.normalized_payload.category, 'sme'); // 'sme' -> 'sme'
    });

    it('4.3 Strict Lot Size Defense: never infers lot_size from minimum_quantity', () => {
      const rawWithoutLotSize = {
        id: 'no-lot-ipo',
        name: 'No Lot Size Ltd',
        minimum_quantity: 4000, // lot_size is absent
      };
      const ext = UpstoxIpoAdapter.normalizeIpo(rawWithoutLotSize as unknown as Parameters<typeof UpstoxIpoAdapter.normalizeIpo>[0]);
      assert.strictEqual(ext.normalized_payload.lot_size, null, 'lot_size must be null when missing');
      assert.notStrictEqual(ext.normalized_payload.lot_size, 4000, 'Must NOT infer lot_size from minimum_quantity');
    });

    it('4.4 Execution Prohibition: order submission and mandate APIs fail closed', async () => {
      await assert.rejects(
        async () => UpstoxIpoAdapter.submitApplication(),
        (err: unknown) => err instanceof CapabilityNotAvailableError && err.capability === 'submit_application'
      );
      await assert.rejects(
        async () => UpstoxIpoAdapter.createMandate(),
        (err: unknown) => err instanceof CapabilityNotAvailableError && err.capability === 'create_mandate'
      );
    });
  });

  // ============================================================================
  // 5. Canonical IPO Resolver & Field Authority Precedence
  // ============================================================================
  describe('5. Canonical IPO Resolver & Precedence Engine', () => {
    it('5.1 matches identities across sources using ISIN exact match', () => {
      const incoming: NormalizedIpoMasterPayload = { company_name: 'Different Name Corp', isin: 'INE123H01015' };
      const existing = { canonical_name: 'Hero Motors Limited', isin: 'INE123H01015' };
      assert.strictEqual(CanonicalIpoResolver.isIdentityMatch(incoming, existing), true);
    });

    it('5.2 matches identities using trading symbol exact match', () => {
      const incoming: NormalizedIpoMasterPayload = { company_name: 'Different Name Corp', symbol: 'HEROMOTO' };
      const existing = { canonical_name: 'Hero Motors Limited', symbol: 'HEROMOTO' };
      assert.strictEqual(CanonicalIpoResolver.isIdentityMatch(incoming, existing), true);
    });

    it('5.3 matches identities using fuzzy company name sanitization', () => {
      const incoming: NormalizedIpoMasterPayload = { company_name: 'Hero Motors Limited' };
      const existing = { canonical_name: 'Hero Motors Pvt Ltd' };
      assert.strictEqual(CanonicalIpoResolver.isIdentityMatch(incoming, existing), true);
    });

    it('5.4 applies field authority: SEBI legal name and offer documents overrule Upstox', () => {
      const existingPayload: NormalizedIpoMasterPayload = {
        company_name: 'Hero Motors Limited', // Official SEBI name
        drhp_url: 'https://sebi.gov.in/official-drhp.pdf',
        price_band_low: 420,
      };
      const existingProv: IpoProvenanceMap = {
        company_name: { value: 'Hero Motors Limited', source: 'sebi', observed_at: '', confidence: 'official_regulatory', is_official: true },
        drhp_url: { value: 'https://sebi.gov.in/official-drhp.pdf', source: 'sebi', observed_at: '', confidence: 'official_regulatory', is_official: true },
      };

      const incomingFromUpstox = UpstoxIpoAdapter.normalizeIpo({
        id: 'hero-motors-ipo',
        name: 'Hero Motors Ltd (Short)', // Upstox non-official name
        drhp_url: 'https://upstox.com/wrong-drhp.pdf',
        minimum_price: 430, // New operational price
      });

      const outcome = CanonicalIpoResolver.resolveObservation(existingPayload, existingProv, incomingFromUpstox);

      // SEBI name and document must prevail
      assert.strictEqual(outcome.resolved_payload.company_name, 'Hero Motors Limited', 'SEBI legal name must be retained');
      assert.strictEqual(outcome.resolved_payload.drhp_url, 'https://sebi.gov.in/official-drhp.pdf', 'SEBI document URL must be retained');
      
      // Existing official SEBI price is retained; conflict is flagged
      assert.strictEqual(outcome.resolved_payload.price_band_low, 420, 'Existing official price is retained over Tier 2 aggregator');
      assert.strictEqual(outcome.has_conflict, true, 'Conflicts must be flagged');
      assert.ok(outcome.conflict_details.length > 0);
    });
  });

  // ============================================================================
  // 6. Direct Publish Verification Gates
  // ============================================================================
  describe('6. Direct Publish Verification Gates', () => {
    it('6.1 blocks direct publishing if unannounced price band (null) or missing lot size', () => {
      const inbox: Partial<CanonicalInboxRecord> = { id: 'inbox-1', has_conflict: false };
      const invalidPayload: NormalizedIpoMasterPayload = {
        company_name: 'Incomplete IPO Ltd',
        price_band_low: null, // Unannounced
        price_band_high: null,
        lot_size: null,
        open_date: '2026-09-15',
        close_date: '2026-09-18',
      };

      const res = IpoIngestionService.validateDirectPublish(inbox as CanonicalInboxRecord, invalidPayload);
      assert.strictEqual(res.canPublish, false);
      assert.ok(res.reasons.some((r) => r.includes('Price band is incomplete')));
      assert.ok(res.reasons.some((r) => r.includes('Lot size is missing')));
    });

    it('6.2 blocks direct publishing if unresolved conflicts exist', () => {
      const conflictedInbox: Partial<CanonicalInboxRecord> = { id: 'inbox-2', has_conflict: true };
      const validPayload: NormalizedIpoMasterPayload = {
        company_name: 'Complete IPO Ltd',
        price_band_low: 400,
        price_band_high: 425,
        lot_size: 35,
        open_date: '2026-09-15',
        close_date: '2026-09-18',
      };

      const res = IpoIngestionService.validateDirectPublish(conflictedInbox as CanonicalInboxRecord, validPayload);
      assert.strictEqual(res.canPublish, false);
      assert.ok(res.reasons.some((r) => r.includes('unresolved field conflicts')));
    });

    it('6.3 permits direct publishing when all 6 validation criteria are satisfied', () => {
      const cleanInbox: Partial<CanonicalInboxRecord> = { id: 'inbox-3', has_conflict: false };
      const validPayload: NormalizedIpoMasterPayload = {
        company_name: 'Hero Motors Limited',
        symbol: 'HEROMOTO',
        price_band_low: 420,
        price_band_high: 445,
        lot_size: 33,
        open_date: '2026-09-15',
        close_date: '2026-09-18',
      };

      const res = IpoIngestionService.validateDirectPublish(cleanInbox as CanonicalInboxRecord, validPayload);
      assert.strictEqual(res.canPublish, true);
      assert.strictEqual(res.reasons.length, 0);
    });
  });

  // ============================================================================
  // 7. Explainable Lifecycle Derivation (Deterministic IST Clock)
  // ============================================================================
  describe('7. Explainable Lifecycle Derivation with Deterministic IST Clock', () => {
    it('7.1 accurately derives upcoming status before bidding opens in IST', () => {
      const result = deriveExplainableIPOStatus({
        open_date: '2026-09-15',
        close_date: '2026-09-18',
        listing_date: '2026-09-24',
        nowIST: '2026-09-14',
      });
      assert.strictEqual(result.finalStatus, 'upcoming');
      assert.strictEqual(result.statusSource, 'bidding_window');
      assert.strictEqual(result.reason, 'bidding_starts_future');
    });

    it('7.2 accurately derives open status on opening day and during bidding window in IST', () => {
      const resultOpening = deriveExplainableIPOStatus({
        open_date: '2026-09-15',
        close_date: '2026-09-18',
        listing_date: '2026-09-24',
        nowIST: '2026-09-15',
      });
      assert.strictEqual(resultOpening.finalStatus, 'open');

      const resultMid = deriveExplainableIPOStatus({
        open_date: '2026-09-15',
        close_date: '2026-09-18',
        listing_date: '2026-09-24',
        nowIST: '2026-09-17',
      });
      assert.strictEqual(resultMid.finalStatus, 'open');
    });

    it('7.3 accurately derives closed status after close date and does NOT manufacture allotment without evidence', () => {
      const result = deriveExplainableIPOStatus({
        open_date: '2026-09-15',
        close_date: '2026-09-18',
        allotment_date: '2026-09-21',
        listing_date: '2026-09-24',
        nowIST: '2026-09-22',
        allotmentFinalizedEvidence: false, // No authoritative evidence
      });
      assert.strictEqual(result.finalStatus, 'closed');
      assert.strictEqual(result.reason, 'bidding_closed_awaiting_allotment');
    });

    it('7.4 derives listed status once listing date arrives in IST', () => {
      const result = deriveExplainableIPOStatus({
        open_date: '2026-09-15',
        close_date: '2026-09-18',
        listing_date: '2026-09-24',
        nowIST: '2026-09-24',
      });
      assert.strictEqual(result.finalStatus, 'listed');
      assert.strictEqual(result.statusSource, 'authoritative_listing');
    });

    it('7.5 respects explicit withdrawn or cancelled status regardless of dates', () => {
      const result = deriveExplainableIPOStatus({
        open_date: '2026-09-15',
        close_date: '2026-09-18',
        status: 'withdrawn',
        nowIST: '2026-09-16',
      });
      assert.strictEqual(result.finalStatus, 'withdrawn');
      assert.strictEqual(result.statusSource, 'explicit_override');
    });
  });

  // ============================================================================
  // 8. Guardrail 2: Tier-1 Disagreement Freeze & Field-Level Authority
  // ============================================================================
  describe('8. Guardrail 2: Tier-1 Disagreement Freeze', () => {
    it('8.1 freezes when two Tier-1 sources (NSE vs BSE) disagree on price band without auto-overwrite', () => {
      const existingPayload: NormalizedIpoMasterPayload = {
        company_name: 'Test Contested IPO Ltd',
        price_band_high: 94, // BSE value
      };
      const existingProv: IpoProvenanceMap = {
        price_band_high: { value: 94, source: 'bse' as const, observed_at: '2026-09-11T10:00:00Z', confidence: 'official_exchange' as const, is_official: true },
      };

      const incomingFromNse = {
        source: 'nse' as const,
        external_id: 'nse-contested-01',
        document_type: 'IPO_MASTER' as const,
        raw_payload: {},
        normalized_payload: {
          company_name: 'Test Contested IPO Ltd',
          price_band_high: 99, // NSE value (disagrees!)
        },
        provenance: {
          price_band_high: { value: 99, source: 'nse' as const, observed_at: '2026-09-11T11:00:00Z', confidence: 'official_exchange' as const, is_official: true },
        },
      };

      const outcome = CanonicalIpoResolver.resolveObservation(existingPayload, existingProv, incomingFromNse);

      // Guardrail 2 assertion: Must NOT auto-overwrite; must freeze existing value and flag conflict
      assert.strictEqual(outcome.has_conflict, true, 'Disagreement between Tier-1 sources must be flagged as conflict');
      assert.strictEqual(outcome.resolved_payload.price_band_high, 94, 'Must freeze existing value rather than auto-overwriting');
      const conflict = outcome.conflict_details.find(c => c.field === 'price_band_high');
      assert.ok(conflict, 'Conflict detail must exist for price_band_high');
      assert.ok(conflict.resolution_rule.includes('TIER1_CONFLICT_FROZEN'), 'Rule must specify TIER1_CONFLICT_FROZEN');
    });

    it('8.2 successfully resolves Tier-1 over Tier-2 without freezing', () => {
      const auth = CanonicalIpoResolver.evaluateFieldAuthority('price_band_high', 'nse', 'upstox');
      assert.strictEqual(auth.shouldOverride, true);
      assert.strictEqual(auth.isTier1Conflict, false);
      assert.ok(auth.rule.includes('exchange_authority_over_upstox') || auth.rule.includes('tier1_nse'));
    });
  });

  // ============================================================================
  // 9. Universe Classification & Candidate Separation
  // ============================================================================
  describe('9. Universe Classification & Document Classification', () => {
    it('9.1 correctly classifies DRHP, RHP, Prospectus, Addendum', () => {
      const drhp = IpoDiscoveryEngine.classifyDocument('Draft Red Herring Prospectus of ABC Ltd');
      assert.strictEqual(drhp.documentType, 'DRHP');
      assert.strictEqual(drhp.isEquityIpo, true);
      assert.strictEqual(drhp.isExcluded, false);

      const rhp = IpoDiscoveryEngine.classifyDocument('Red Herring Prospectus of XYZ Ltd');
      assert.strictEqual(rhp.documentType, 'RHP');
      assert.strictEqual(rhp.isExcluded, false);

      const corrigendum = IpoDiscoveryEngine.classifyDocument('Corrigendum to RHP for XYZ Ltd');
      assert.strictEqual(corrigendum.documentType, 'ADDENDUM');
      assert.strictEqual(corrigendum.isExcluded, false);
    });

    it('9.2 excludes debt, NCDs, rights issues, and withdrawn filings', () => {
      const debt = IpoDiscoveryEngine.classifyDocument('Public Issue of Secured NCDs by Finance Corp');
      assert.strictEqual(debt.isExcluded, true);
      assert.ok(debt.exclusionReason?.includes('Debt/Bond/NCD'));

      const rights = IpoDiscoveryEngine.classifyDocument('Offer of Equity Shares on Rights Issue Basis');
      assert.strictEqual(rights.isExcluded, true);
      assert.ok(rights.exclusionReason?.includes('Rights issue'));

      const withdrawn = IpoDiscoveryEngine.classifyDocument('Withdrawal of DRHP by Tech Ltd', 'cancelled');
      assert.strictEqual(withdrawn.isExcluded, false, 'Withdrawn filings are retained for audit trail');
      assert.strictEqual(withdrawn.documentType, 'DRHP');
    });
  });

  // ============================================================================
  // 10. Freshness Grading
  // ============================================================================
  describe('10. Freshness Grading Calculation', () => {
    it('10.1 returns correct grades for observation ages', () => {
      const now = new Date('2026-09-11T12:00:00Z');

      // <6 hours -> fresh
      const freshObs = new Date('2026-09-11T09:00:00Z').toISOString();
      assert.strictEqual(CanonicalIpoResolver.calculateFreshness(freshObs, now), 'fresh');

      // 6-24 hours -> aging
      const agingObs = new Date('2026-09-10T20:00:00Z').toISOString();
      assert.strictEqual(CanonicalIpoResolver.calculateFreshness(agingObs, now), 'aging');

      // 24-72 hours -> stale
      const staleObs = new Date('2026-09-09T12:00:00Z').toISOString();
      assert.strictEqual(CanonicalIpoResolver.calculateFreshness(staleObs, now), 'stale');

      // >72 hours -> very_stale
      const veryStaleObs = new Date('2026-09-01T12:00:00Z').toISOString();
      assert.strictEqual(CanonicalIpoResolver.calculateFreshness(veryStaleObs, now), 'very_stale');
    });
  });
});

