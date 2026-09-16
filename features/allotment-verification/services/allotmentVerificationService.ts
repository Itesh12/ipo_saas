/**
 * features/allotment-verification/services/allotmentVerificationService.ts
 *
 * Allotment Verification Orchestration Service for Stage 4:
 * 1. Distributed 30s lock concurrency control via ipo_allotment_verification_locks
 * 2. 6-hour cache check on ipo_application_allotment_projections
 * 3. Deterministic issue binding resolution
 * 4. Registrar capability checks & fail-closed execution
 * 5. Automated (Mode 1) & User-Assisted (Mode 2) verification
 * 6. Zero raw PII / Zero credential storage (SHA-256 hash + masked identifiers)
 * 7. Invariant enforcement: record_not_found maps strictly to unknown/UNVERIFIED
 * 8. Hand-off to Phase 4 / Phase 5 lifecycle (no direct financial table writes)
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { BaseRegistrarAdapter } from '../adapters/baseRegistrarAdapter';
import { RegistrarAdapterFactory } from '../adapters/registrarAdapterFactory';
import { IssueBindingResolver } from './issueBindingResolver';
import { RegistrarCapabilityRegistry } from './registrarCapabilityRegistry';
import {
  AllotmentVerificationAttempt,
  ApplicationAllotmentProjection,
  LookupType,
  NormalizedAllotmentResult,
  RegistrarAdapterResponse,
  SubmitUserAssistedResultInput,
  VerificationEvidenceClassification,
  VerificationResultType,
} from '../types/verificationTypes';
import { recordApplicationAllotment } from '@/features/application/services/allotmentService';

export interface VerifyAllotmentOptions {
  applicationId: string;
  actorId?: string | null;
  forceRefresh?: boolean;
}

export interface VerificationExecutionResult {
  success: boolean;
  status: string;
  projection?: ApplicationAllotmentProjection | null;
  attempt?: AllotmentVerificationAttempt | null;
  challengeRequired?: boolean;
  challengePayload?: Record<string, unknown>;
  error?: string;
}

export class AllotmentVerificationService {
  private static readonly CACHE_FRESHNESS_HOURS = 6;
  private static readonly LOCK_DURATION_SECONDS = 30;

  /**
   * Main verification entry point.
   */
  static async verifyApplicationAllotment(
    options: VerifyAllotmentOptions
  ): Promise<VerificationExecutionResult> {
    const { applicationId, actorId, forceRefresh = false } = options;
    const supabase = createAdminClient();

    // 1. Fetch application details
    const { data: rawApp, error: appErr } = await supabase
      .from('ipo_applications')
      .select(`
        id,
        user_id,
        applicant_id,
        ipo_id,
        total_quantity,
        total_lots,
        bid_price,
        application_amount,
        blocked_amount,
        application_number,
        status,
        ipos (
          id,
          company_name,
          registrar_name,
          issue_price,
          max_price
        ),
        applicant_profiles (
          id,
          pan_masked,
          pan_encrypted
        )
      `)
      .eq('id', applicationId)
      .single();

    if (appErr || !rawApp) {
      return { success: false, status: 'error', error: 'Application record not found.' };
    }

    type RawAppType = {
      id: string;
      user_id: string;
      applicant_id: string;
      ipo_id: string;
      total_quantity: number;
      total_lots: number;
      bid_price: number;
      application_amount: number;
      blocked_amount: number;
      application_number: string | null;
      status: string;
      ipos: {
        id: string;
        company_name: string;
        registrar_name: string | null;
        issue_price: number | null;
        max_price: number | null;
      } | null;
      applicant_profiles: {
        id: string;
        pan_masked: string | null;
        pan_encrypted?: string | null;
      } | null;
    };

    const app = rawApp as unknown as RawAppType;

    // 2. Check 6-Hour Cache Freshness on Projection
    if (!forceRefresh) {
      const { data: existingProj } = await supabase
        .from('ipo_application_allotment_projections')
        .select('*')
        .eq('application_id', applicationId)
        .maybeSingle();

      if (existingProj && existingProj.last_verified_at) {
        const lastVerifiedTime = new Date(existingProj.last_verified_at).getTime();
        const freshnessLimit = Date.now() - this.CACHE_FRESHNESS_HOURS * 3600 * 1000;

        if (
          lastVerifiedTime > freshnessLimit &&
          existingProj.evidence_classification !== 'UNVERIFIED'
        ) {
          return {
            success: true,
            status: 'cached',
            projection: existingProj as ApplicationAllotmentProjection,
          };
        }
      }
    }

    // 3. Concurrency Lock (30-second TTL)
    const idempotencyKey = `lock:allotment:${applicationId}:${Date.now()}`;
    const acquired = await this.acquireLock(applicationId, idempotencyKey);
    if (!acquired) {
      return {
        success: false,
        status: 'concurrency_locked',
        error: 'Another verification attempt is currently processing for this application. Please wait.',
      };
    }

    const startTime = Date.now();

    try {
      // 4. Resolve Deterministic Issue Binding
      const bindingResult = await IssueBindingResolver.resolveBinding(app.ipo_id);
      const registrarCode = bindingResult.registrarCode;

      if (!registrarCode) {
        // Record unverified attempt due to unknown registrar
        const attempt = await this.recordAttempt({
          applicationId: app.id,
          applicantId: app.applicant_id,
          ipoId: app.ipo_id,
          registrarCode: 'unknown',
          verificationMode: 'automated_api',
          attemptStatus: 'portal_unavailable',
          verificationResult: 'unknown',
          lookupType: 'pan',
          lookupIdentifierMasked: app.applicant_profiles?.pan_masked || '****',
          lookupIdentifierHash: BaseRegistrarAdapter.sha256(app.applicant_profiles?.pan_masked || 'unknown'),
          normalizedResult: null,
          rawResponseHash: BaseRegistrarAdapter.sha256('NO_REGISTRAR_AVAILABLE'),
          evidenceSourceType: 'REGISTRAR_DIRECT',
          evidenceClassification: 'UNVERIFIED',
          idempotencyKey,
          errorCode: 'REGISTRAR_UNSPECIFIED',
          errorMessage: bindingResult.message,
          durationMs: Date.now() - startTime,
        });

        return {
          success: false,
          status: 'registrar_unspecified',
          attempt,
          error: bindingResult.message,
        };
      }

      // 5. Capability Check
      const capability = await RegistrarCapabilityRegistry.getCapability(registrarCode);
      const isHeadlessAllowed = await RegistrarCapabilityRegistry.isHeadlessAllowed(registrarCode);

      // Identifier setup (Masked + Hashed)
      const rawPan = app.applicant_profiles?.pan_masked || 'ABCDE1234F';
      const maskedPAN = BaseRegistrarAdapter.maskPAN(rawPan);
      const panHash = BaseRegistrarAdapter.sha256(rawPan);

      // If interactive challenge is required or headless is not allowed, trigger User-Assisted Mode (Mode 2)
      if (!isHeadlessAllowed || !bindingResult.binding) {
        const portalUrl =
          bindingResult.binding?.source_portal_url ||
          capability?.source_url ||
          'https://linkintime.co.in/initial_offer/public-issues.html';

        const challengePayload = {
          type: 'portal_redirect',
          portalUrl,
          registrarCode,
          registrarName: capability?.display_name || registrarCode,
          companyName: app.ipos?.company_name || 'IPO',
          panMasked: maskedPAN,
          applicationNumber: app.application_number || 'N/A',
          sharesApplied: app.total_quantity,
          instructions: `Official verification for ${capability?.display_name || registrarCode} requires interactive verification. Please open the official portal, check status with PAN ${maskedPAN}, and confirm your allotment result.`,
        };

        const attempt = await this.recordAttempt({
          applicationId: app.id,
          applicantId: app.applicant_id,
          ipoId: app.ipo_id,
          registrarCode,
          registrarBindingId: bindingResult.binding?.id,
          verificationMode: 'user_assisted',
          attemptStatus: 'challenge_required',
          verificationResult: 'unknown',
          lookupType: 'pan',
          lookupIdentifierMasked: maskedPAN,
          lookupIdentifierHash: panHash,
          normalizedResult: null,
          rawResponseHash: BaseRegistrarAdapter.sha256(`CHALLENGE_REQUIRED:${registrarCode}`),
          evidenceSourceType: 'REGISTRAR_USER_ASSISTED',
          evidenceClassification: 'UNVERIFIED',
          idempotencyKey,
          errorCode: 'CHALLENGE_REQUIRED',
          errorMessage: 'Interactive verification required on official registrar portal.',
          durationMs: Date.now() - startTime,
        });

        return {
          success: true,
          status: 'challenge_required',
          challengeRequired: true,
          challengePayload,
          attempt,
        };
      }

      // 6. Direct Automated Adapter Execution (if registrar supports headless without challenge)
      const adapter = RegistrarAdapterFactory.getAdapter(registrarCode);
      if (!adapter) {
        return {
          success: false,
          status: 'adapter_not_found',
          error: `No adapter implemented for registrar ${registrarCode}`,
        };
      }

      const adapterRes: RegistrarAdapterResponse = await adapter.queryAllotment({
        ipoId: app.ipo_id,
        registrarIssueId: bindingResult.binding.registrar_issue_id,
        lookupType: 'pan',
        lookupValue: rawPan,
      });

      const attempt = await this.recordAttempt({
        applicationId: app.id,
        applicantId: app.applicant_id,
        ipoId: app.ipo_id,
        registrarCode,
        registrarBindingId: bindingResult.binding.id,
        verificationMode: 'automated_api',
        attemptStatus: adapterRes.status,
        verificationResult: adapterRes.normalizedResult?.resultType || 'unknown',
        lookupType: 'pan',
        lookupIdentifierMasked: maskedPAN,
        lookupIdentifierHash: panHash,
        normalizedResult: adapterRes.normalizedResult || null,
        rawResponseHash: adapterRes.rawResponseHash,
        evidenceSourceType: 'REGISTRAR_DIRECT',
        evidenceClassification:
          adapterRes.status === 'completed' ? 'REGISTRAR_CONFIRMED' : 'UNVERIFIED',
        sourceObservedAt: adapterRes.sourceObservedAt,
        verifiedAt: adapterRes.status === 'completed' ? new Date().toISOString() : null,
        idempotencyKey,
        errorCode: adapterRes.errorCode,
        errorMessage: adapterRes.errorMessage,
        durationMs: Date.now() - startTime,
      });

      if (adapterRes.status === 'completed' && adapterRes.normalizedResult) {
        const proj = await this.updateProjection({
          applicationId: app.id,
          applicantId: app.applicant_id,
          ipoId: app.ipo_id,
          attemptId: attempt.id,
          evidenceClassification: 'REGISTRAR_CONFIRMED',
          sharesApplied: app.total_quantity,
          sharesAllotted: adapterRes.normalizedResult.sharesAllotted,
          lotsAllotted: adapterRes.normalizedResult.lotsAllotted || 0,
          allotmentPrice:
            adapterRes.normalizedResult.allotmentPrice ||
            app.ipos?.issue_price ||
            app.ipos?.max_price ||
            app.bid_price,
          reportedRefundAmount: adapterRes.normalizedResult.reportedRefundAmount,
          sourceObservedAt: adapterRes.normalizedResult.sourceObservedAt,
        });

        // Hand-off to Phase 4 lifecycle & Phase 5 ledger
        await this.synchronizeApplicationLifecycle({
          applicationId: app.id,
          resultType: adapterRes.normalizedResult.resultType,
          sharesAllotted: adapterRes.normalizedResult.sharesAllotted,
          allotmentPrice:
            adapterRes.normalizedResult.allotmentPrice ||
            app.ipos?.issue_price ||
            app.ipos?.max_price ||
            app.bid_price,
          actorId,
        });

        return {
          success: true,
          status: 'completed',
          projection: proj,
          attempt,
        };
      }

      return {
        success: false,
        status: adapterRes.status,
        attempt,
        error: adapterRes.errorMessage,
      };
    } finally {
      // Always release concurrency lock
      await this.releaseLock(applicationId);
    }
  }

  /**
   * User-Assisted Result Submission (Mode 2)
   */
  static async submitUserAssistedResult(
    input: SubmitUserAssistedResultInput,
    actorId?: string | null
  ): Promise<VerificationExecutionResult> {
    const supabase = createAdminClient();

    const { data: rawApp, error: appErr } = await supabase
      .from('ipo_applications')
      .select(`
        id,
        user_id,
        applicant_id,
        ipo_id,
        total_quantity,
        total_lots,
        bid_price,
        application_amount,
        blocked_amount,
        application_number,
        status,
        ipos (
          id,
          company_name,
          registrar_name,
          issue_price,
          max_price
        ),
        applicant_profiles (
          id,
          pan_masked
        )
      `)
      .eq('id', input.applicationId)
      .single();

    if (appErr || !rawApp) {
      return { success: false, status: 'error', error: 'Application record not found.' };
    }

    type RawAppType = {
      id: string;
      user_id: string;
      applicant_id: string;
      ipo_id: string;
      total_quantity: number;
      total_lots: number;
      bid_price: number;
      application_amount: number;
      blocked_amount: number;
      application_number: string | null;
      status: string;
      ipos: {
        id: string;
        company_name: string;
        registrar_name: string | null;
        issue_price: number | null;
        max_price: number | null;
      } | null;
      applicant_profiles: {
        id: string;
        pan_masked: string | null;
      } | null;
    };

    const app = rawApp as unknown as RawAppType;

    // Hard Invariant: sharesAllotted cannot exceed sharesApplied
    if (input.sharesAllotted > app.total_quantity) {
      return {
        success: false,
        status: 'validation_error',
        error: `Shares allotted (${input.sharesAllotted}) cannot exceed applied shares (${app.total_quantity}).`,
      };
    }

    // Determine Result Type accurately
    let computedResultType: VerificationResultType = 'unknown';
    if (input.sharesAllotted === app.total_quantity && app.total_quantity > 0) {
      computedResultType = 'allotted';
    } else if (input.sharesAllotted > 0 && input.sharesAllotted < app.total_quantity) {
      computedResultType = 'partially_allotted';
    } else if (input.sharesAllotted === 0) {
      computedResultType = 'not_allotted';
    }

    const price =
      input.allotmentPrice ||
      app.ipos?.issue_price ||
      app.ipos?.max_price ||
      app.bid_price ||
      100;

    const maskedPAN = BaseRegistrarAdapter.maskPAN(app.applicant_profiles?.pan_masked || 'ABCDE1234F');
    const panHash = BaseRegistrarAdapter.sha256(app.applicant_profiles?.pan_masked || 'ABCDE1234F');
    const idempotencyKey = `user_assisted:${app.id}:${Date.now()}`;
    const rawResponseHash = BaseRegistrarAdapter.sha256(
      `USER_ASSISTED:${app.id}:${input.sharesAllotted}:${input.registrarReference || ''}`
    );

    const normalizedResult = {
      resultType: computedResultType,
      sharesApplied: app.total_quantity,
      sharesAllotted: input.sharesAllotted,
      lotsAllotted: Math.floor(input.sharesAllotted / Math.max(1, app.total_quantity / (app.total_lots || 1))),
      allotmentPrice: price,
      reportedRefundAmount: input.reportedRefundAmount || 0,
      sourceObservedAt: input.observedAt || new Date().toISOString(),
      registrarReference: input.registrarReference,
      applicantNameMasked: undefined,
    };

    // Record immutable audit attempt
    const attempt = await this.recordAttempt({
      applicationId: app.id,
      applicantId: app.applicant_id,
      ipoId: app.ipo_id,
      registrarCode: IssueBindingResolver.normalizeRegistrarCode(app.ipos?.registrar_name) || 'user_assisted',
      verificationMode: 'user_assisted',
      attemptStatus: 'completed',
      verificationResult: computedResultType,
      lookupType: 'pan',
      lookupIdentifierMasked: maskedPAN,
      lookupIdentifierHash: panHash,
      normalizedResult,
      rawResponseHash,
      evidenceSourceType: 'REGISTRAR_USER_ASSISTED',
      evidenceClassification: 'USER_PROVIDED',
      sourceObservedAt: normalizedResult.sourceObservedAt,
      verifiedAt: new Date().toISOString(),
      idempotencyKey,
      durationMs: 100,
    });

    // Update Projection
    const projection = await this.updateProjection({
      applicationId: app.id,
      applicantId: app.applicant_id,
      ipoId: app.ipo_id,
      attemptId: attempt.id,
      evidenceClassification: 'USER_PROVIDED',
      sharesApplied: app.total_quantity,
      sharesAllotted: input.sharesAllotted,
      lotsAllotted: normalizedResult.lotsAllotted,
      allotmentPrice: price,
      reportedRefundAmount: input.reportedRefundAmount || 0,
      sourceObservedAt: normalizedResult.sourceObservedAt,
    });

    // Advance Lifecycle in Phase 4 and notify Phase 5
    await this.synchronizeApplicationLifecycle({
      applicationId: app.id,
      resultType: computedResultType,
      sharesAllotted: input.sharesAllotted,
      allotmentPrice: price,
      actorId,
    });

    return {
      success: true,
      status: 'completed',
      projection,
      attempt,
    };
  }

  /**
   * Records an immutable verification attempt with strict audit integrity.
   */
  private static async recordAttempt(params: {
    applicationId: string;
    applicantId: string;
    ipoId: string;
    registrarCode: string;
    registrarBindingId?: string | null;
    verificationMode: string;
    attemptStatus: string;
    verificationResult: VerificationResultType;
    lookupType: LookupType;
    lookupIdentifierMasked: string;
    lookupIdentifierHash: string;
    normalizedResult: NormalizedAllotmentResult | Record<string, unknown> | null;
    rawResponseHash: string;
    evidenceSourceType: string;
    evidenceClassification: VerificationEvidenceClassification;
    sourceObservedAt?: string | null;
    verifiedAt?: string | null;
    idempotencyKey: string;
    errorCode?: string | null;
    errorMessage?: string | null;
    durationMs?: number | null;
  }): Promise<AllotmentVerificationAttempt> {
    const supabase = createAdminClient();

    // Query attempt number for this application
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

    const payload = {
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
      raw_response_hash: params.rawResponseHash,
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
      .insert(payload as never)
      .select()
      .single();

    if (error) {
      console.error('[AllotmentVerificationService] Error inserting attempt record:', error);
      throw new Error(`Failed to record verification attempt: ${error.message}`);
    }

    return data as AllotmentVerificationAttempt;
  }

  /**
   * Updates or creates the current projection view.
   */
  private static async updateProjection(params: {
    applicationId: string;
    applicantId: string;
    ipoId: string;
    attemptId: string;
    evidenceClassification: VerificationEvidenceClassification;
    sharesApplied: number;
    sharesAllotted: number;
    lotsAllotted: number;
    allotmentPrice?: number | null;
    reportedRefundAmount: number;
    sourceObservedAt?: string | null;
  }): Promise<ApplicationAllotmentProjection> {
    const supabase = createAdminClient();
    const now = new Date().toISOString();

    const payload = {
      application_id: params.applicationId,
      applicant_id: params.applicantId,
      ipo_id: params.ipoId,
      evidence_classification: params.evidenceClassification,
      last_verified_attempt_id: params.attemptId,
      shares_applied: params.sharesApplied,
      shares_allotted: params.sharesAllotted,
      lots_allotted: params.lotsAllotted,
      allotment_price: params.allotmentPrice ?? null,
      reported_refund_amount: params.reportedRefundAmount,
      source_observed_at: params.sourceObservedAt || now,
      last_verified_at: now,
      updated_at: now,
    };

    const { data, error } = await supabase
      .from('ipo_application_allotment_projections')
      .upsert(payload as never, { onConflict: 'application_id' })
      .select()
      .single();

    if (error) {
      console.error('[AllotmentVerificationService] Error updating projection:', error);
      throw new Error(`Failed to update allotment projection: ${error.message}`);
    }

    return data as ApplicationAllotmentProjection;
  }

  /**
   * Hands off verified allotment facts to Phase 4 (application lifecycle) and Phase 5 (financial mutation).
   * Stage 4 NEVER writes to ledger or wallet directly.
   */
  private static async synchronizeApplicationLifecycle(params: {
    applicationId: string;
    resultType: VerificationResultType;
    sharesAllotted: number;
    allotmentPrice: number;
    actorId?: string | null;
  }): Promise<void> {
    if (params.resultType === 'unknown') return;

    try {
      await recordApplicationAllotment(
        {
          application_id: params.applicationId,
          allotment_status: params.resultType as 'allotted' | 'partially_allotted' | 'not_allotted',
          shares_allotted: params.sharesAllotted,
          allotment_price: params.allotmentPrice,
          notes: 'Verified via Registrar Allotment Verification Gateway (Stage 4)',
        },
        params.actorId
      );
    } catch (err) {
      console.error(
        `[AllotmentVerificationService] Failed to synchronize application lifecycle for ${params.applicationId}:`,
        err
      );
    }
  }

  /**
   * Concurrency Lock Acquisition (30s TTL)
   */
  private static async acquireLock(applicationId: string, idempotencyKey: string): Promise<boolean> {
    const supabase = createAdminClient();
    const now = new Date().toISOString();

    // Clean expired locks first
    await supabase
      .from('ipo_allotment_verification_locks')
      .delete()
      .lt('expires_at', now);

    // Try to acquire lock
    const expiresAt = new Date(Date.now() + this.LOCK_DURATION_SECONDS * 1000).toISOString();
    const { error } = await supabase
      .from('ipo_allotment_verification_locks')
      .insert({
        idempotency_key: idempotencyKey,
        application_id: applicationId,
        locked_at: now,
        expires_at: expiresAt,
      } as never);

    if (error) {
      // If primary key or unique lock exists, lock acquisition fails
      return false;
    }

    return true;
  }

  /**
   * Release Concurrency Lock
   */
  private static async releaseLock(applicationId: string): Promise<void> {
    const supabase = createAdminClient();
    await supabase
      .from('ipo_allotment_verification_locks')
      .delete()
      .eq('application_id', applicationId);
  }

  /**
   * Admin Conflict Resolution Queue retrieval
   */
  static async getConflictQueue(): Promise<ApplicationAllotmentProjection[]> {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('ipo_application_allotment_projections')
      .select('*')
      .or('has_conflict.eq.true,evidence_classification.eq.CONFLICTED')
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('[AllotmentVerificationService] Error fetching conflict queue:', error);
      return [];
    }

    return (data || []) as ApplicationAllotmentProjection[];
  }
}
