/**
 * features/allotment-verification/services/verificationAttemptService.ts
 *
 * Immutable Verification Attempt Ledger & Projection Updater for Candidate B.
 * Enforces:
 * 1. Strictly append-only (INSERT ONLY) on ipo_allotment_verification_attempts.
 * 2. SHA-256 raw response hashing and zero PII storage.
 * 3. Atomic projection updates with dispatch status derivation.
 * 4. Automatic durable outbox enqueue when projection transitions to ELIGIBLE.
 */

import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  AllotmentVerificationAttempt,
  ApplicationAllotmentProjection,
  EvidenceSourceType,
  FinancialDispatchStatus,
  LookupType,
  NormalizedAllotmentResult,
  RegistrarVerificationMode,
  VerificationEvidenceClassification,
  VerificationResultType,
} from '../types/verificationTypes';
import { ReconciliationEngine } from './reconciliationEngine';
import { Stage4OutboxService } from './stage4OutboxService';

export interface RecordAttemptParams {
  applicationId: string;
  applicantId: string;
  ipoId: string;
  registrarCode: string;
  registrarBindingId?: string | null;
  verificationMode: RegistrarVerificationMode;
  attemptStatus: string;
  verificationResult: VerificationResultType;
  lookupType: LookupType;
  lookupIdentifierMasked: string;
  lookupIdentifierHash: string;
  normalizedResult: NormalizedAllotmentResult | null;
  rawResponsePayload?: unknown;
  evidenceSourceType: EvidenceSourceType;
  evidenceClassification: VerificationEvidenceClassification;
  sourceObservedAt?: string | null;
  verifiedAt?: string | null;
  idempotencyKey: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  durationMs?: number | null;
}

export class VerificationAttemptService {
  /**
   * Computes SHA-256 hash of raw response data for cryptographic auditability.
   */
  static computePayloadHash(payload: unknown): string {
    const rawString = typeof payload === 'string' ? payload : JSON.stringify(payload ?? {});
    return crypto.createHash('sha256').update(rawString).digest('hex');
  }

  /**
   * Appends an immutable verification attempt record. Never modifies existing attempts.
   */
  static async recordImmutableAttempt(
    params: RecordAttemptParams
  ): Promise<AllotmentVerificationAttempt> {
    const supabase = createAdminClient();

    // Determine sequential attempt number
    const { count } = await supabase
      .from('ipo_allotment_verification_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('application_id', params.applicationId);

    const attemptNumber = (count || 0) + 1;

    // Hard Invariant: record_not_found must NEVER have verificationResult != 'unknown'
    const finalResult =
      params.attemptStatus === 'record_not_found' ? 'unknown' : params.verificationResult;
    const finalClassification =
      params.attemptStatus === 'record_not_found' ? 'UNVERIFIED' : params.evidenceClassification;

    const rawResponseHash = this.computePayloadHash(params.rawResponsePayload || params.normalizedResult || params.attemptStatus);

    const attemptPayload = {
      application_id: params.applicationId,
      applicant_id: params.applicantId,
      ipo_id: params.ipoId,
      registrar_code: params.registrarCode,
      registrar_binding_id: params.registrarBindingId || null,
      attempt_number: attemptNumber,
      verification_mode: params.verificationMode,
      attempt_status: params.attemptStatus,
      verification_result: finalResult,
      lookup_type: params.lookupType,
      lookup_identifier_masked: params.lookupIdentifierMasked,
      lookup_identifier_hash: params.lookupIdentifierHash,
      normalized_result: params.normalizedResult,
      raw_response_hash: rawResponseHash,
      raw_response_retention: 'none',
      evidence_source_type: params.evidenceSourceType,
      evidence_classification: finalClassification,
      source_observed_at: params.sourceObservedAt || null,
      verified_at: params.verifiedAt || null,
      idempotency_key: params.idempotencyKey,
      error_code: params.errorCode || null,
      error_message: params.errorMessage || null,
      duration_ms: params.durationMs || null,
    };

    const { data, error } = await supabase
      .from('ipo_allotment_verification_attempts')
      .insert(attemptPayload as never)
      .select()
      .single();

    if (error) {
      console.error('[VerificationAttemptService] Error inserting attempt:', error);
      throw new Error(`Failed to record verification attempt: ${error.message}`);
    }

    return data as AllotmentVerificationAttempt;
  }

  /**
   * Reconciles the attempt and updates the application allotment projection.
   * If projection becomes ELIGIBLE, automatically enqueues to the Stage 4 durable outbox.
   */
  static async reconcileAndUpdateProjection(params: {
    attempt: AllotmentVerificationAttempt;
    application: {
      id: string;
      user_id: string;
      applicant_id: string;
      ipo_id: string;
      total_quantity: number;
      total_lots: number;
      bid_price: number;
      application_amount: number;
      blocked_amount: number;
      status: string;
      price_band_high?: number | null;
      price_band_low?: number | null;
    };
  }): Promise<{
    projection: ApplicationAllotmentProjection;
    outboxEnqueued: boolean;
  }> {
    const supabase = createAdminClient();
    const { attempt, application } = params;

    // 1. Fetch current projection if exists
    const { data: currentProj } = await supabase
      .from('ipo_application_allotment_projections')
      .select('*')
      .eq('application_id', application.id)
      .maybeSingle();

    const existingProjection = currentProj as ApplicationAllotmentProjection | null;

    // 2. Perform pure reconciliation
    const outcome = ReconciliationEngine.reconcile({
      application,
      incoming: attempt.normalized_result || {
        resultType: attempt.verification_result,
        sharesApplied: application.total_quantity,
        sharesAllotted: 0,
        reportedRefundAmount: 0,
      },
      incomingClassification: attempt.evidence_classification,
      existingProjection,
      attemptStatus: attempt.attempt_status,
    });

    const now = new Date().toISOString();

    const projectionPayload = {
      application_id: application.id,
      applicant_id: application.applicant_id,
      ipo_id: application.ipo_id,
      evidence_classification: outcome.computedClassification,
      last_verified_attempt_id: attempt.id,
      shares_applied: application.total_quantity,
      shares_allotted: outcome.sharesAllotted,
      lots_allotted: outcome.lotsAllotted,
      allotment_price: outcome.allotmentPrice,
      reported_refund_amount: outcome.reportedRefundAmount,
      has_conflict: outcome.hasConflict,
      conflict_details: outcome.conflictReason || null,
      financial_dispatch_status: outcome.financialDispatchStatus,
      source_observed_at: attempt.source_observed_at || now,
      first_verified_at: existingProjection?.first_verified_at || now,
      last_verified_at: now,
      updated_at: now,
    };

    const { data: updatedProj, error: projErr } = await supabase
      .from('ipo_application_allotment_projections')
      .upsert(projectionPayload as never, { onConflict: 'application_id' })
      .select()
      .single();

    if (projErr || !updatedProj) {
      console.error('[VerificationAttemptService] Projection update failed:', projErr);
      throw new Error(`Failed to update projection: ${projErr?.message}`);
    }

    const projection = updatedProj as ApplicationAllotmentProjection;
    let outboxEnqueued = false;

    // 3. If ELIGIBLE and positive shares, enqueue to durable Stage 4 outbox
    if (
      projection.financial_dispatch_status === 'ELIGIBLE' &&
      projection.shares_allotted > 0
    ) {
      try {
        await Stage4OutboxService.enqueueAllotmentVerifiedEvent({
          userId: application.user_id,
          applicationId: application.id,
          applicantId: application.applicant_id,
          ipoId: application.ipo_id,
          allotmentId: `allot_${application.id}`,
          projectionId: application.id,
          sharesAllotted: projection.shares_allotted,
          allotmentPrice: projection.allotment_price || application.bid_price || 100,
          reportedRefundAmount: projection.reported_refund_amount,
          evidenceClassification: projection.evidence_classification,
          verificationAttemptId: attempt.id,
          rawObservationHash: attempt.raw_response_hash,
          fundingOwnerType: 'user_personal',
        });
        outboxEnqueued = true;
      } catch (outboxErr) {
        console.error('[VerificationAttemptService] Outbox enqueue failed:', outboxErr);
      }
    }

    return { projection, outboxEnqueued };
  }
}
