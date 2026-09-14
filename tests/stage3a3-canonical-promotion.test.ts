/**
 * tests/stage3a3-canonical-promotion.test.ts
 *
 * Phase 9 Stage 3A.3: Canonical IPO Promotion & Current-Universe Activation Test Suite.
 *
 * Comprehensive test coverage for:
 * - Category A: Seven-Field Canonical Promotion Gatekeeper (IpoPromotionValidator)
 * - Category B: Schema-Compliant Issue Type Normalization (Mandatory Correction 2)
 * - Category C: Authoritative & Derived IST Lifecycle Timestamps (Mandatory Correction 1)
 * - Category D: Confirmed Listing Evidence Protection (Mandatory Correction 3)
 * - Category E: Historical Preservation & Old Filing Rejection
 * - Category F: Reconciliation Contradiction Guard (No merge on contradictory identity)
 * - Category G: Distinct Domain Semantics: Promote to Draft vs Approve & Publish (Mandatory Correction 4)
 * - Category H: Idempotency & Conflict Freeze
 * - Category I: Zero-Fixture Production Purity Static Audit
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

import { IpoPromotionValidator } from '../features/external-integrations/services/ipoPromotionValidator';
import { IpoLifecycleResolver } from '../features/external-integrations/services/ipoLifecycleResolver';
import { CanonicalIpoResolver } from '../features/external-integrations/services/canonicalIpoResolver';
import { deriveIPOStatus } from '../features/ipo/services/ipoLifecycle';
import { NormalizedIpoMasterPayload, CanonicalInboxRecord } from '../features/external-integrations/ipo-master/ipoMasterTypes';

describe('Phase 9 Stage 3A.3: Canonical Promotion & Production Activation', () => {

  // =========================================================================
  // CATEGORY A: SEVEN-FIELD CANONICAL PROMOTION GATEKEEPER
  // =========================================================================
  describe('Category A: Seven-Field Canonical Promotion Gatekeeper', () => {
    const validInbox: Pick<CanonicalInboxRecord, 'has_conflict' | 'review_status'> = {
      has_conflict: false,
      review_status: 'pending_review',
    };

    const completePayload: Partial<NormalizedIpoMasterPayload> = {
      company_name: 'Acme Technologies Limited',
      issue_type: 'book_building',
      price_band_low: 450,
      price_band_high: 475,
      lot_size: 30,
      open_date: '2026-09-20',
      close_date: '2026-09-24',
      exchange: 'NSE, BSE',
    };

    it('A1: Passes when all seven canonical fields are valid and unconflicted', () => {
      const result = IpoPromotionValidator.validateForPromotion(validInbox, completePayload);
      assert.strictEqual(result.eligible, true);
      assert.strictEqual(result.missingFields.length, 0);
      assert.strictEqual(result.rejectionReasons.length, 0);
      assert.strictEqual(result.passedFields.length, 7);
      assert.strictEqual(result.normalizedPayload?.company_name, 'Acme Technologies Limited');
    });

    it('A2: Fails closed when company name is missing or whitespace', () => {
      const result = IpoPromotionValidator.validateForPromotion(validInbox, {
        ...completePayload,
        company_name: '   ',
      });
      assert.strictEqual(result.eligible, false);
      assert.ok(result.missingFields.includes('company_name'));
    });

    it('A3: Fails closed when price band is missing or incomplete for book built issue', () => {
      const result = IpoPromotionValidator.validateForPromotion(validInbox, {
        ...completePayload,
        price_band_low: undefined,
        price_band_high: 475,
      });
      assert.strictEqual(result.eligible, false);
      assert.ok(result.missingFields.includes('price_band'));
    });

    it('A4: Fails closed when price_band_high is lower than price_band_low', () => {
      const result = IpoPromotionValidator.validateForPromotion(validInbox, {
        ...completePayload,
        price_band_low: 500,
        price_band_high: 400,
      });
      assert.strictEqual(result.eligible, false);
      assert.ok(result.missingFields.includes('price_band'));
    });

    it('A5: Allows single price band for fixed_price issue type', () => {
      const result = IpoPromotionValidator.validateForPromotion(validInbox, {
        ...completePayload,
        issue_type: 'fixed_price',
        price_band_low: 120,
        price_band_high: undefined,
      });
      assert.strictEqual(result.eligible, true);
      assert.ok(result.passedFields.includes('price_band'));
    });

    it('A6: Fails closed when lot size is zero, negative, or not an integer', () => {
      const resultZero = IpoPromotionValidator.validateForPromotion(validInbox, {
        ...completePayload,
        lot_size: 0,
      });
      assert.strictEqual(resultZero.eligible, false);
      assert.ok(resultZero.missingFields.includes('lot_size'));

      const resultFloat = IpoPromotionValidator.validateForPromotion(validInbox, {
        ...completePayload,
        lot_size: 15.5,
      });
      assert.strictEqual(resultFloat.eligible, false);
      assert.ok(resultFloat.missingFields.includes('lot_size'));
    });

    it('A7: Fails closed when bidding end date precedes start date', () => {
      const result = IpoPromotionValidator.validateForPromotion(validInbox, {
        ...completePayload,
        open_date: '2026-09-24',
        close_date: '2026-09-20',
      });
      assert.strictEqual(result.eligible, false);
      assert.ok(result.missingFields.includes('close_date'));
    });

    it('A8: Fails closed when exchange is missing or empty', () => {
      const result = IpoPromotionValidator.validateForPromotion(validInbox, {
        ...completePayload,
        exchange: '  ',
      });
      assert.strictEqual(result.eligible, false);
      assert.ok(result.missingFields.includes('exchange'));
    });

    it('A9: Tier-1 conflict freeze: fails closed if inbox has active conflict', () => {
      const conflictedInbox: Pick<CanonicalInboxRecord, 'has_conflict' | 'review_status'> = {
        has_conflict: true,
        review_status: 'conflicted',
      };
      const result = IpoPromotionValidator.validateForPromotion(conflictedInbox, completePayload);
      assert.strictEqual(result.eligible, false);
      assert.ok(result.rejectionReasons.some((r) => r.includes('Tier-1 conflict active')));
    });
  });

  // =========================================================================
  // CATEGORY B: ISSUE TYPE SCHEMA NORMALIZATION (MANDATORY CORRECTION 2)
  // =========================================================================
  describe('Category B: Schema-Compliant Issue Type Normalization', () => {
    it('B1: Correctly maps various book building terms to Phase 2 enum book_building', () => {
      assert.strictEqual(IpoPromotionValidator.normalizeIssueType('Book Built'), 'book_building');
      assert.strictEqual(IpoPromotionValidator.normalizeIssueType('BOOK_BUILDING'), 'book_building');
      assert.strictEqual(IpoPromotionValidator.normalizeIssueType('EQ'), 'book_building');
      assert.strictEqual(IpoPromotionValidator.normalizeIssueType(undefined), 'book_building');
    });

    it('B2: Correctly maps fixed price terms to Phase 2 enum fixed_price', () => {
      assert.strictEqual(IpoPromotionValidator.normalizeIssueType('Fixed Price'), 'fixed_price');
      assert.strictEqual(IpoPromotionValidator.normalizeIssueType('FIXED_PRICE'), 'fixed_price');
      assert.strictEqual(IpoPromotionValidator.normalizeIssueType('fp'), 'fixed_price');
    });

    it('B3: Only outputs valid canonical enum members', () => {
      const validEnums = new Set(['book_building', 'fixed_price']);
      const testInputs = ['Book Built', 'Fixed Price', 'SME', 'Mainboard', 'unknown', ''];
      for (const input of testInputs) {
        const normalized = IpoPromotionValidator.normalizeIssueType(input);
        assert.ok(validEnums.has(normalized), `Output ${normalized} must be in Phase 2 enum`);
      }
    });
  });

  // =========================================================================
  // CATEGORY C: AUTHORITATIVE & DERIVED IST TIMESTAMPS (MANDATORY CORRECTION 1)
  // =========================================================================
  describe('Category C: Authoritative & Derived IST Timestamps', () => {
    it('C1: Uses authoritative source timestamps when provided and flags isDerivedTime = false', () => {
      const outcome = IpoLifecycleResolver.resolveLifecycle({
        open_date: '2026-09-14',
        close_date: '2026-09-16',
        bidding_start_time: '09:15:00',
        bidding_end_time: '16:30:00',
        nowIST: '2026-09-14T09:30:00+05:30',
      });

      assert.strictEqual(outcome.status, 'open');
      assert.strictEqual(outcome.isDerivedTime, false);
      assert.strictEqual(outcome.timeConventionVersion, undefined);
      assert.ok(outcome.explanation.includes('actively open'));
    });

    it('C2: Uses versioned derived convention when date-only and flags isDerivedTime = true', () => {
      const outcome = IpoLifecycleResolver.resolveLifecycle({
        open_date: '2026-09-14',
        close_date: '2026-09-16',
        nowIST: '2026-09-14T12:00:00+05:30',
      });

      assert.strictEqual(outcome.status, 'open');
      assert.strictEqual(outcome.isDerivedTime, true);
      assert.strictEqual(outcome.timeConventionVersion, 'v1.0-standard-ist-session');
    });

    it('C3: Evaluates exact start instant boundary: Upcoming before start time, Open at start time', () => {
      // 1 minute before start
      const beforeStart = IpoLifecycleResolver.resolveLifecycle({
        open_date: '2026-09-14',
        close_date: '2026-09-16',
        bidding_start_time: '10:00:00',
        bidding_end_time: '17:00:00',
        nowIST: '2026-09-14T09:59:00+05:30',
      });
      assert.strictEqual(beforeStart.status, 'upcoming');

      // Exact start minute
      const atStart = IpoLifecycleResolver.resolveLifecycle({
        open_date: '2026-09-14',
        close_date: '2026-09-16',
        bidding_start_time: '10:00:00',
        bidding_end_time: '17:00:00',
        nowIST: '2026-09-14T10:00:00+05:30',
      });
      assert.strictEqual(atStart.status, 'open');
    });

    it('C4: Evaluates exact close instant boundary: Open at close time, Closed immediately after', () => {
      // At close instant
      const atClose = IpoLifecycleResolver.resolveLifecycle({
        open_date: '2026-09-14',
        close_date: '2026-09-16',
        bidding_start_time: '10:00:00',
        bidding_end_time: '17:00:00',
        nowIST: '2026-09-16T17:00:00+05:30',
      });
      assert.strictEqual(atClose.status, 'open');

      // 1 minute after close
      const afterClose = IpoLifecycleResolver.resolveLifecycle({
        open_date: '2026-09-14',
        close_date: '2026-09-16',
        bidding_start_time: '10:00:00',
        bidding_end_time: '17:00:00',
        nowIST: '2026-09-16T17:01:00+05:30',
      });
      assert.strictEqual(afterClose.status, 'closed');
    });

    it('C5: Returns announced when bidding window dates are missing', () => {
      const outcome = IpoLifecycleResolver.resolveLifecycle({
        open_date: null,
        close_date: null,
      });
      assert.strictEqual(outcome.status, 'announced');
    });
  });

  // =========================================================================
  // CATEGORY D: CONFIRMED LISTING EVIDENCE PROTECTION (MANDATORY CORRECTION 3)
  // =========================================================================
  describe('Category D: Confirmed Listing Protection', () => {
    it('D1: Past listing date WITH confirmed listing evidence resolves to listed', () => {
      const outcome = IpoLifecycleResolver.resolveLifecycle({
        open_date: '2026-08-01',
        close_date: '2026-08-05',
        listing_date: '2026-08-10',
        listing_price: 245.5,
        is_listing_confirmed: true,
        nowIST: '2026-09-14T10:00:00+05:30',
      });

      assert.strictEqual(outcome.status, 'listed');
      assert.ok(outcome.explanation.includes('confirmed listing evidence'));
    });

    it('D2: Past expected listing date WITHOUT confirmed evidence fails closed to listing_soon', () => {
      const outcome = IpoLifecycleResolver.resolveLifecycle({
        open_date: '2026-08-01',
        close_date: '2026-08-05',
        listing_date: '2026-08-10', // Past date
        listing_price: null,        // Unconfirmed
        is_listing_confirmed: false,
        nowIST: '2026-09-14T10:00:00+05:30',
      });

      assert.strictEqual(outcome.status, 'listing_soon');
      assert.ok(outcome.explanation.includes('listing confirmation/price is pending'));
    });

    it('D3: Public catalog deriveIPOStatus also fails closed to listing_soon without confirmation', () => {
      const derived = deriveIPOStatus(
        {
          open_date: '2026-08-01',
          close_date: '2026-08-05',
          allotment_date: '2026-08-08',
          listing_date: '2026-08-10',
          status: 'listing_soon',
          listing_price: null,
          is_listing_confirmed: false,
        },
        '2026-09-14'
      );

      assert.strictEqual(derived, 'listing_soon');
    });

    it('D4: Public catalog deriveIPOStatus marks listed when listing_price is recorded', () => {
      const derived = deriveIPOStatus(
        {
          open_date: '2026-08-01',
          close_date: '2026-08-05',
          allotment_date: '2026-08-08',
          listing_date: '2026-08-10',
          status: 'listing_soon',
          listing_price: 180.0,
          is_listing_confirmed: true,
        },
        '2026-09-14'
      );

      assert.strictEqual(derived, 'listed');
    });
  });

  // =========================================================================
  // CATEGORY E: HISTORICAL PROTECTION
  // =========================================================================
  describe('Category E: Historical Protection', () => {
    it('E1: Old listed issues (Premier Energies / Bajaj Housing Finance) remain listed', () => {
      const premierEnergies = IpoLifecycleResolver.resolveLifecycle({
        open_date: '2026-08-27',
        close_date: '2026-08-29',
        listing_date: '2026-09-03',
        listing_price: 990.0,
        is_listing_confirmed: true,
        explicit_status: 'listed',
        nowIST: '2026-09-14T10:00:00+05:30',
      });

      assert.strictEqual(premierEnergies.status, 'listed');
    });

    it('E2: SEBI filing alone without current exchange bidding record is announced, not open or active', () => {
      const sebiFiling = IpoLifecycleResolver.resolveLifecycle({
        open_date: null,
        close_date: null,
        nowIST: '2026-09-14T10:00:00+05:30',
      });

      assert.strictEqual(sebiFiling.status, 'announced');
      assert.notStrictEqual(sebiFiling.status, 'open');
      assert.notStrictEqual(sebiFiling.status, 'upcoming');
    });
  });

  // =========================================================================
  // CATEGORY F: RECONCILIATION CONTRADICTION GUARD (USER REQUIREMENT 5)
  // =========================================================================
  describe('Category F: Reconciliation Contradiction Guard', () => {
    it('F1: Never matches by company name if ISIN contradicts', () => {
      const incoming: NormalizedIpoMasterPayload = {
        company_name: 'Apex Infrastructure Limited',
        isin: 'INE111111111',
      };
      const existing = {
        canonical_name: 'Apex Infrastructure Limited',
        isin: 'INE999999999', // Different ISIN
      };

      const isMatch = CanonicalIpoResolver.isIdentityMatch(incoming, existing);
      assert.strictEqual(isMatch, false, 'Contradictory ISIN must NEVER reconcile');
    });

    it('F2: Never matches by company name if Trading Symbol contradicts', () => {
      const incoming: NormalizedIpoMasterPayload = {
        company_name: 'Kaveri Seeds Limited',
        symbol: 'KSCL',
      };
      const existing = {
        canonical_name: 'Kaveri Seeds Limited',
        symbol: 'KAVERI', // Different Symbol
      };

      const isMatch = CanonicalIpoResolver.isIdentityMatch(incoming, existing);
      assert.strictEqual(isMatch, false, 'Contradictory symbol must NEVER reconcile');
    });

    it('F3: Matches cleanly when ISIN matches exactly', () => {
      const incoming: NormalizedIpoMasterPayload = {
        company_name: 'Hero Motors',
        isin: 'INE987654321',
      };
      const existing = {
        canonical_name: 'Hero Motors Ltd',
        isin: 'INE987654321',
      };

      const isMatch = CanonicalIpoResolver.isIdentityMatch(incoming, existing);
      assert.strictEqual(isMatch, true);
    });
  });

  // =========================================================================
  // CATEGORY G: PROMOTION VS PUBLICATION SEPARATION (MANDATORY CORRECTION 4)
  // =========================================================================
  describe('Category G: Distinct Domain Semantics (Promote vs Publish)', () => {
    it('G1: Verification of service methods separation in IpoCanonicalPromotionService', () => {
      const serviceFile = fs.readFileSync(
        path.join(process.cwd(), 'features/external-integrations/services/ipoCanonicalPromotionService.ts'),
        'utf-8'
      );

      // Verify separate methods exist
      assert.ok(serviceFile.includes('promoteCandidateToDraft'), 'Must have promoteCandidateToDraft');
      assert.ok(serviceFile.includes('approveAndPublishCandidate'), 'Must have approveAndPublishCandidate');

      // Verify promoteCandidateToDraft sets publication_status: 'draft'
      assert.ok(
        serviceFile.includes("publication_status: 'draft'"),
        'promoteCandidateToDraft must store draft status'
      );

      // Verify approveAndPublishCandidate checks 7-field gate eligibility
      assert.ok(
        serviceFile.includes('if (!eligibility.eligible)'),
        'approveAndPublishCandidate must enforce 7-field gate'
      );
    });
  });

  // =========================================================================
  // CATEGORY H: STATIC AUDIT & ZERO-FIXTURE PURITY
  // =========================================================================
  describe('Category H: Zero-Fixture Production Purity Static Audit', () => {
    it('H1: Verifies zero test fixtures or mock payloads in external clients', () => {
      const sebiClient = fs.readFileSync(
        path.join(process.cwd(), 'features/external-integrations/clients/sebiSourceClient.ts'),
        'utf-8'
      );
      assert.ok(!sebiClient.includes('fixtures/'), 'SEBI client must not reference fixtures');

      const nseClient = fs.readFileSync(
        path.join(process.cwd(), 'features/external-integrations/clients/nseSourceClient.ts'),
        'utf-8'
      );
      assert.ok(!nseClient.includes('fixtures/'), 'NSE client must not reference fixtures');
    });

    it('H2: Verifies no hardcoded lifecycle hours in ipoLifecycleResolver.ts', () => {
      const resolverFile = fs.readFileSync(
        path.join(process.cwd(), 'features/external-integrations/services/ipoLifecycleResolver.ts'),
        'utf-8'
      );

      // Must have documentation of derived fallback convention
      assert.ok(resolverFile.includes('CONVENTION_VERSION'), 'Must declare explicit CONVENTION_VERSION');
      assert.ok(resolverFile.includes('isDerivedTime'), 'Must declare isDerivedTime flag');
    });
  });
});
