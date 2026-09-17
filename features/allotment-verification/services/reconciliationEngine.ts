/**
 * features/allotment-verification/services/reconciliationEngine.ts
 *
 * Stage 4 Reconciliation Engine for Candidate B (Revision 3).
 * Pure deterministic reconciliation between Candidate A application facts
 * and normalized registrar observations.
 *
 * Enforces:
 * 1. Hard Invariant: shares_allotted <= shares_applied (Quantity conservation)
 * 2. Hard Invariant: record_not_found != not_allotted (Always UNVERIFIED + BLOCKED)
 * 3. Exact vs Partial vs Zero vs Conflicted reconciliation
 * 4. Stale evidence protection (Does not downgrade newer verified evidence)
 * 5. Deterministic Financial Dispatch status derivation:
 *    BLOCKED -> ELIGIBLE -> EMITTED -> ACKNOWLEDGED (terminal)
 */

import {
  ApplicationAllotmentProjection,
  FinancialDispatchStatus,
  NormalizedAllotmentResult,
  VerificationEvidenceClassification,
  VerificationResultType,
} from '../types/verificationTypes';

export interface ApplicationReconciliationContext {
  id: string;
  total_quantity: number;
  total_lots: number;
  bid_price: number;
  application_amount: number;
  blocked_amount: number;
  status: string;
  price_band_high?: number | null;
  price_band_low?: number | null;
}

export interface ReconciliationOutcome {
  hasConflict: boolean;
  conflictReason?: string;
  computedResultType: VerificationResultType;
  computedClassification: VerificationEvidenceClassification;
  financialDispatchStatus: FinancialDispatchStatus;
  sharesAllotted: number;
  lotsAllotted: number;
  allotmentPrice: number;
  reportedRefundAmount: number;
  notes?: string;
}

export class ReconciliationEngine {
  /**
   * Reconciles an incoming normalized observation against application context and existing projection.
   */
  static reconcile(params: {
    application: ApplicationReconciliationContext;
    incoming: NormalizedAllotmentResult;
    incomingClassification: VerificationEvidenceClassification;
    existingProjection?: ApplicationAllotmentProjection | null;
    attemptStatus?: string;
  }): ReconciliationOutcome {
    const {
      application,
      incoming,
      incomingClassification,
      existingProjection,
      attemptStatus,
    } = params;

    const sharesApplied = application.total_quantity;

    // RULE 1: Negative invariant - record_not_found must NEVER yield not_allotted
    if (attemptStatus === 'record_not_found' || incoming.resultType === 'unknown') {
      return {
        hasConflict: false,
        computedResultType: 'unknown',
        computedClassification: 'UNVERIFIED',
        financialDispatchStatus: 'BLOCKED',
        sharesAllotted: 0,
        lotsAllotted: 0,
        allotmentPrice: application.bid_price || 0,
        reportedRefundAmount: 0,
        notes: 'Record not found on registrar portal or observation incomplete. Kept BLOCKED.',
      };
    }

    // RULE 2: Quantity Conservation - shares_allotted <= shares_applied
    if (incoming.sharesAllotted > sharesApplied) {
      return {
        hasConflict: true,
        conflictReason: `Excess shares reported by registrar: allotted ${incoming.sharesAllotted} > applied ${sharesApplied}.`,
        computedResultType: 'unknown',
        computedClassification: 'CONFLICTED',
        financialDispatchStatus: 'BLOCKED',
        sharesAllotted: 0,
        lotsAllotted: 0,
        allotmentPrice: 0,
        reportedRefundAmount: 0,
        notes: 'Quantity violation: reported shares exceed applied quantity.',
      };
    }

    // RULE 3: Stale evidence protection
    if (existingProjection && existingProjection.source_observed_at && incoming.sourceObservedAt) {
      const existingTime = new Date(existingProjection.source_observed_at).getTime();
      const incomingTime = new Date(incoming.sourceObservedAt).getTime();

      // If incoming evidence is older than current verified projection, reject downgrade
      if (incomingTime < existingTime && existingProjection.evidence_classification === 'REGISTRAR_CONFIRMED') {
        return {
          hasConflict: true,
          conflictReason: `Stale evidence: incoming observation dated ${incoming.sourceObservedAt} is older than current verified state (${existingProjection.source_observed_at}).`,
          computedResultType: existingProjection.shares_allotted > 0 ? 'allotted' : 'not_allotted',
          computedClassification: existingProjection.evidence_classification,
          financialDispatchStatus: existingProjection.financial_dispatch_status,
          sharesAllotted: existingProjection.shares_allotted,
          lotsAllotted: existingProjection.lots_allotted,
          allotmentPrice: existingProjection.allotment_price || 0,
          reportedRefundAmount: existingProjection.reported_refund_amount,
          notes: 'Rejected stale observation; existing projection preserved.',
        };
      }
    }

    // RULE 4: Result Type Normalization
    let computedResultType: VerificationResultType = 'unknown';
    if (incoming.sharesAllotted === sharesApplied && sharesApplied > 0) {
      computedResultType = 'allotted';
    } else if (incoming.sharesAllotted > 0 && incoming.sharesAllotted < sharesApplied) {
      computedResultType = 'partially_allotted';
    } else if (incoming.sharesAllotted === 0 && incoming.resultType === 'not_allotted') {
      computedResultType = 'not_allotted';
    }

    // RULE 5: Financial Dispatch Eligibility Derivation
    let financialDispatchStatus: FinancialDispatchStatus = 'BLOCKED';

    const isHighConfidenceEvidence =
      incomingClassification === 'REGISTRAR_CONFIRMED' ||
      incomingClassification === 'DEPOSITORY_CONFIRMED' ||
      incomingClassification === 'MANUAL_ADMIN';

    if (computedResultType === 'not_allotted') {
      // Zero allotment requires no positive securities settlement
      financialDispatchStatus = 'NOT_APPLICABLE';
    } else if (
      (computedResultType === 'allotted' || computedResultType === 'partially_allotted') &&
      isHighConfidenceEvidence
    ) {
      financialDispatchStatus = 'ELIGIBLE';
    } else {
      // User-provided or unverified remains BLOCKED until dual admin review or registrar confirmation
      financialDispatchStatus = 'BLOCKED';
    }

    const price =
      incoming.allotmentPrice ||
      application.price_band_high ||
      application.price_band_low ||
      application.bid_price ||
      100;

    const lotSize = Math.max(1, Math.floor(sharesApplied / Math.max(1, application.total_lots || 1)));
    const lotsAllotted = incoming.lotsAllotted ?? Math.floor(incoming.sharesAllotted / lotSize);

    const calculatedAllotmentAmount = incoming.sharesAllotted * price;
    const blockedAmount = application.blocked_amount || application.application_amount || calculatedAllotmentAmount;
    const reportedRefund =
      incoming.reportedRefundAmount > 0
        ? incoming.reportedRefundAmount
        : Math.max(0, blockedAmount - calculatedAllotmentAmount);

    return {
      hasConflict: false,
      computedResultType,
      computedClassification: incomingClassification,
      financialDispatchStatus,
      sharesAllotted: incoming.sharesAllotted,
      lotsAllotted,
      allotmentPrice: price,
      reportedRefundAmount: reportedRefund,
      notes: `Reconciliation completed: ${computedResultType} with ${incoming.sharesAllotted} shares.`,
    };
  }
}
