/**
 * tests/candidate-b-reconciliation.test.ts
 *
 * Candidate B (Revision 3): Stage 4 Invariant & Reconciliation Engine Unit Tests.
 *
 * Enforces:
 * 1. shares_allotted <= shares_applied (Quantity conservation).
 * 2. record_not_found strictly yields unknown / UNVERIFIED / BLOCKED (Never not_allotted).
 * 3. Exact full allotment, partial allotment, and non-allotment classification.
 * 4. Stale evidence protection (Does not downgrade newer verified state).
 * 5. Deterministic financial dispatch status derivation (BLOCKED -> ELIGIBLE -> NOT_APPLICABLE).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  ApplicationReconciliationContext,
  ReconciliationEngine,
} from '../features/allotment-verification/services/reconciliationEngine';
import {
  ApplicationAllotmentProjection,
  NormalizedAllotmentResult,
} from '../features/allotment-verification/types/verificationTypes';

describe('Candidate B: Stage 4 Reconciliation Engine & Invariants', () => {
  const mockApp: ApplicationReconciliationContext = {
    id: 'app-001',
    total_quantity: 150,
    total_lots: 1,
    bid_price: 100,
    application_amount: 15000,
    blocked_amount: 15000,
    status: 'submitted',
    price_band_high: 100,
    price_band_low: 95,
  };

  it('RULE 1: Full Allotment with REGISTRAR_CONFIRMED yields ELIGIBLE dispatch status', () => {
    const incoming: NormalizedAllotmentResult = {
      resultType: 'allotted',
      sharesApplied: 150,
      sharesAllotted: 150,
      lotsAllotted: 1,
      allotmentPrice: 100,
      reportedRefundAmount: 0,
      sourceObservedAt: '2026-09-17T12:00:00Z',
    };

    const outcome = ReconciliationEngine.reconcile({
      application: mockApp,
      incoming,
      incomingClassification: 'REGISTRAR_CONFIRMED',
    });

    assert.strictEqual(outcome.hasConflict, false);
    assert.strictEqual(outcome.computedResultType, 'allotted');
    assert.strictEqual(outcome.sharesAllotted, 150);
    assert.strictEqual(outcome.computedClassification, 'REGISTRAR_CONFIRMED');
    assert.strictEqual(outcome.financialDispatchStatus, 'ELIGIBLE');
    assert.strictEqual(outcome.reportedRefundAmount, 0);
  });

  it('RULE 2: Partial Allotment with REGISTRAR_CONFIRMED calculates correct refund and yields ELIGIBLE', () => {
    const incoming: NormalizedAllotmentResult = {
      resultType: 'partially_allotted',
      sharesApplied: 150,
      sharesAllotted: 75,
      allotmentPrice: 100,
      reportedRefundAmount: 7500,
      sourceObservedAt: '2026-09-17T12:00:00Z',
    };

    const outcome = ReconciliationEngine.reconcile({
      application: mockApp,
      incoming,
      incomingClassification: 'REGISTRAR_CONFIRMED',
    });

    assert.strictEqual(outcome.hasConflict, false);
    assert.strictEqual(outcome.computedResultType, 'partially_allotted');
    assert.strictEqual(outcome.sharesAllotted, 75);
    assert.strictEqual(outcome.financialDispatchStatus, 'ELIGIBLE');
    assert.strictEqual(outcome.reportedRefundAmount, 7500);
  });

  it('RULE 3: Explicit Non-Allotment yields NOT_APPLICABLE dispatch status (no securities transfer)', () => {
    const incoming: NormalizedAllotmentResult = {
      resultType: 'not_allotted',
      sharesApplied: 150,
      sharesAllotted: 0,
      allotmentPrice: 100,
      reportedRefundAmount: 15000,
      sourceObservedAt: '2026-09-17T12:00:00Z',
    };

    const outcome = ReconciliationEngine.reconcile({
      application: mockApp,
      incoming,
      incomingClassification: 'REGISTRAR_CONFIRMED',
    });

    assert.strictEqual(outcome.hasConflict, false);
    assert.strictEqual(outcome.computedResultType, 'not_allotted');
    assert.strictEqual(outcome.sharesAllotted, 0);
    assert.strictEqual(outcome.financialDispatchStatus, 'NOT_APPLICABLE');
  });

  it('RULE 4 (NEGATIVE INVARIANT): record_not_found strictly yields unknown, UNVERIFIED, and BLOCKED', () => {
    const incoming: NormalizedAllotmentResult = {
      resultType: 'unknown',
      sharesApplied: 150,
      sharesAllotted: 0,
      reportedRefundAmount: 0,
    };

    const outcome = ReconciliationEngine.reconcile({
      application: mockApp,
      incoming,
      incomingClassification: 'UNVERIFIED',
      attemptStatus: 'record_not_found',
    });

    assert.strictEqual(outcome.hasConflict, false);
    assert.strictEqual(outcome.computedResultType, 'unknown');
    assert.strictEqual(outcome.computedClassification, 'UNVERIFIED');
    assert.strictEqual(outcome.financialDispatchStatus, 'BLOCKED');
    assert.strictEqual(outcome.sharesAllotted, 0);
    assert.notStrictEqual(outcome.computedResultType, 'not_allotted', 'record_not_found must NEVER be marked as not_allotted');
  });

  it('RULE 5 (QUANTITY CONSERVATION): Excess shares reported yields CONFLICTED and BLOCKED', () => {
    const incoming: NormalizedAllotmentResult = {
      resultType: 'allotted',
      sharesApplied: 150,
      sharesAllotted: 300, // Violation: 300 > 150
      allotmentPrice: 100,
      reportedRefundAmount: 0,
    };

    const outcome = ReconciliationEngine.reconcile({
      application: mockApp,
      incoming,
      incomingClassification: 'REGISTRAR_CONFIRMED',
    });

    assert.strictEqual(outcome.hasConflict, true);
    assert.strictEqual(outcome.computedResultType, 'unknown');
    assert.strictEqual(outcome.computedClassification, 'CONFLICTED');
    assert.strictEqual(outcome.financialDispatchStatus, 'BLOCKED');
    assert.ok(outcome.conflictReason?.includes('Excess shares reported'));
  });

  it('RULE 6 (STALE EVIDENCE PROTECTION): Older observation cannot downgrade newer verified projection', () => {
    const existingProjection: ApplicationAllotmentProjection = {
      application_id: 'app-001',
      applicant_id: 'applicant-001',
      ipo_id: 'ipo-001',
      evidence_classification: 'REGISTRAR_CONFIRMED',
      shares_applied: 150,
      shares_allotted: 150,
      lots_allotted: 1,
      allotment_price: 100,
      reported_refund_amount: 0,
      has_conflict: false,
      financial_dispatch_status: 'ELIGIBLE',
      source_observed_at: '2026-09-17T14:00:00Z',
      updated_at: '2026-09-17T14:00:00Z',
    };

    // Incoming observation timestamped 2 hours before existing projection
    const incoming: NormalizedAllotmentResult = {
      resultType: 'not_allotted',
      sharesApplied: 150,
      sharesAllotted: 0,
      reportedRefundAmount: 15000,
      sourceObservedAt: '2026-09-17T12:00:00Z', // Stale
    };

    const outcome = ReconciliationEngine.reconcile({
      application: mockApp,
      incoming,
      incomingClassification: 'REGISTRAR_CONFIRMED',
      existingProjection,
    });

    assert.strictEqual(outcome.hasConflict, true);
    assert.ok(outcome.conflictReason?.includes('Stale evidence'));
    assert.strictEqual(outcome.sharesAllotted, 150, 'Existing 150 shares preserved');
    assert.strictEqual(outcome.financialDispatchStatus, 'ELIGIBLE');
  });

  it('RULE 7: USER_PROVIDED evidence classification remains BLOCKED from financial dispatch', () => {
    const incoming: NormalizedAllotmentResult = {
      resultType: 'allotted',
      sharesApplied: 150,
      sharesAllotted: 150,
      allotmentPrice: 100,
      reportedRefundAmount: 0,
      sourceObservedAt: '2026-09-17T12:00:00Z',
    };

    const outcome = ReconciliationEngine.reconcile({
      application: mockApp,
      incoming,
      incomingClassification: 'USER_PROVIDED', // Requires admin dual review
    });

    assert.strictEqual(outcome.hasConflict, false);
    assert.strictEqual(outcome.computedClassification, 'USER_PROVIDED');
    assert.strictEqual(outcome.financialDispatchStatus, 'BLOCKED', 'User provided allotment evidence must remain BLOCKED until verified');
  });

  it('RULE 8: MANUAL_ADMIN dual-reviewed classification yields ELIGIBLE dispatch', () => {
    const incoming: NormalizedAllotmentResult = {
      resultType: 'allotted',
      sharesApplied: 150,
      sharesAllotted: 150,
      allotmentPrice: 100,
      reportedRefundAmount: 0,
      sourceObservedAt: '2026-09-17T12:00:00Z',
    };

    const outcome = ReconciliationEngine.reconcile({
      application: mockApp,
      incoming,
      incomingClassification: 'MANUAL_ADMIN',
    });

    assert.strictEqual(outcome.hasConflict, false);
    assert.strictEqual(outcome.computedClassification, 'MANUAL_ADMIN');
    assert.strictEqual(outcome.financialDispatchStatus, 'ELIGIBLE');
  });
});
