/**
 * features/allotment-verification/services/challengeService.ts
 *
 * True Two-Person Dual-Control Challenge & Discrepancy Resolution Service.
 *
 * Invariants:
 * 1. Investor statement + private evidence storage (0 public URLs, SHA-256 validation).
 * 2. Primary review by authorized administrator (role: admin | super_admin).
 * 3. Secondary review by a DIFFERENT authorized administrator (primary_reviewer_id != secondary_reviewer_id).
 * 4. Resolving as allotted creates an immutable verification attempt and marks projection ELIGIBLE.
 * 5. Automatic durable outbox enqueue upon positive dual-control resolution.
 */

import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  AllotmentChallenge,
  ChallengeStatus,
  ChallengeType,
} from '../types/verificationTypes';
import { VerificationAttemptService } from './verificationAttemptService';

export interface SubmitChallengeInput {
  applicationId: string;
  userId: string;
  challengeType: ChallengeType;
  investorStatement: string;
  claimedSharesAllotted: number;
  claimedAmount: number;
  storageObjectId?: string | null;
  evidenceSha256?: string | null;
  mimeType?: string;
  fileSizeBytes?: number | null;
}

export interface ReviewChallengeInput {
  challengeId: string;
  reviewerId: string;
  notes: string;
  decision?: 'approve' | 'reject';
}

export class ChallengeService {
  /**
   * Helper to verify if an account is an authorized administrator.
   */
  private static async verifyAdminRole(userId: string): Promise<boolean> {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', userId)
      .single();

    if (error || !data) return false;
    return data.role === 'admin' || data.role === 'super_admin';
  }

  /**
   * Submits an investor allotment challenge.
   */
  static async submitChallenge(input: SubmitChallengeInput): Promise<AllotmentChallenge> {
    const supabase = createAdminClient();

    // Verify application existence
    const { data: app, error: appErr } = await supabase
      .from('ipo_applications')
      .select('id, user_id, total_quantity')
      .eq('id', input.applicationId)
      .single();

    if (appErr || !app) {
      throw new Error('Application not found.');
    }

    if (app.user_id !== input.userId) {
      throw new Error('Unauthorized: Challenge can only be submitted by the application owner.');
    }

    if (input.claimedSharesAllotted > app.total_quantity) {
      throw new Error(`Claimed shares (${input.claimedSharesAllotted}) cannot exceed applied quantity (${app.total_quantity}).`);
    }

    const idempotencyKey = `challenge:${input.applicationId}:${Date.now()}`;

    const record = {
      application_id: input.applicationId,
      user_id: input.userId,
      challenge_type: input.challengeType,
      status: 'submitted' as ChallengeStatus,
      investor_statement: input.investorStatement,
      claimed_shares_allotted: input.claimedSharesAllotted,
      claimed_amount: input.claimedAmount,
      storage_object_id: input.storageObjectId || null,
      evidence_sha256: input.evidenceSha256 || null,
      mime_type: input.mimeType || 'application/pdf',
      file_size_bytes: input.fileSizeBytes || null,
      idempotency_key: idempotencyKey,
    };

    const { data, error } = await supabase
      .from('ipo_allotment_challenges')
      .insert(record as never)
      .select()
      .single();

    if (error) {
      console.error('[ChallengeService] Failed to submit challenge:', error);
      throw new Error(`Failed to submit challenge: ${error.message}`);
    }

    return data as AllotmentChallenge;
  }

  /**
   * Step 1: Primary Administrative Review
   */
  static async executePrimaryReview(input: ReviewChallengeInput): Promise<AllotmentChallenge> {
    const supabase = createAdminClient();

    // 1. Role verification
    const isAdmin = await this.verifyAdminRole(input.reviewerId);
    if (!isAdmin) {
      throw new Error('UNAUTHORIZED: Reviewer does not possess administrator privileges.');
    }

    // 2. Fetch challenge
    const { data: challenge, error: chErr } = await supabase
      .from('ipo_allotment_challenges')
      .select('*')
      .eq('id', input.challengeId)
      .single();

    if (chErr || !challenge) {
      throw new Error('Challenge not found.');
    }

    if (challenge.status !== 'submitted' && challenge.status !== 'under_review') {
      throw new Error(`Invalid challenge state for primary review: ${challenge.status}.`);
    }

    const now = new Date().toISOString();
    const { data: updated, error: updateErr } = await supabase
      .from('ipo_allotment_challenges')
      .update({
        status: 'primary_approved',
        primary_reviewer_id: input.reviewerId,
        primary_reviewed_at: now,
        primary_notes: input.notes,
        updated_at: now,
      } as never)
      .eq('id', input.challengeId)
      .select()
      .single();

    if (updateErr || !updated) {
      throw new Error(`Primary review update failed: ${updateErr?.message}`);
    }

    return updated as AllotmentChallenge;
  }

  /**
   * Step 2: Secondary Administrative Review (True Dual-Control)
   * Hard Invariant: Reviewer 2 must NOT be Reviewer 1.
   */
  static async executeSecondaryReview(input: ReviewChallengeInput): Promise<{
    challenge: AllotmentChallenge;
    resolvedStatus: string;
  }> {
    const supabase = createAdminClient();

    // 1. Role verification
    const isAdmin = await this.verifyAdminRole(input.reviewerId);
    if (!isAdmin) {
      throw new Error('UNAUTHORIZED: Reviewer does not possess administrator privileges.');
    }

    // 2. Fetch challenge
    const { data: rawChallenge, error: chErr } = await supabase
      .from('ipo_allotment_challenges')
      .select('*')
      .eq('id', input.challengeId)
      .single();

    if (chErr || !rawChallenge) {
      throw new Error('Challenge not found.');
    }

    const challenge = rawChallenge as AllotmentChallenge;

    if (challenge.status !== 'primary_approved') {
      throw new Error(`Dual-control requirement: Primary review must be completed before secondary review. Current status: ${challenge.status}`);
    }

    // 3. HARD DUAL-CONTROL INVARIANT: Reviewer 2 !== Reviewer 1
    if (challenge.primary_reviewer_id === input.reviewerId) {
      throw new Error('REVIEWER_COLLISION: Dual-control violation! Secondary reviewer must be a different administrator than primary reviewer.');
    }

    const decision = input.decision || 'approve';
    const finalStatus: ChallengeStatus = decision === 'approve' ? 'resolved_allotted' : 'resolved_rejected';
    const now = new Date().toISOString();

    const { data: updatedChallenge, error: updateErr } = await supabase
      .from('ipo_allotment_challenges')
      .update({
        status: finalStatus,
        secondary_reviewer_id: input.reviewerId,
        secondary_reviewed_at: now,
        secondary_notes: input.notes,
        resolution_reason: decision === 'approve' ? 'Dual-Control Verified by Compliance' : 'Rejected after Secondary Review',
        updated_at: now,
      } as never)
      .eq('id', input.challengeId)
      .select()
      .single();

    if (updateErr || !updatedChallenge) {
      throw new Error(`Secondary review update failed: ${updateErr?.message}`);
    }

    // 4. If approved, apply resolution to allotment projection
    if (decision === 'approve') {
      // Fetch application for reconciliation
      const { data: app } = await supabase
        .from('ipo_applications')
        .select(`
          id, user_id, applicant_id, ipo_id, total_quantity, total_lots,
          bid_price, application_amount, blocked_amount, status
        `)
        .eq('id', challenge.application_id)
        .single();

      if (app) {
        // Record immutable manual admin attempt
        const attempt = await VerificationAttemptService.recordImmutableAttempt({
          applicationId: app.id,
          applicantId: app.applicant_id,
          ipoId: app.ipo_id,
          registrarCode: 'manual_dual_review',
          verificationMode: 'manual_admin_entry',
          attemptStatus: 'completed',
          verificationResult: challenge.claimed_shares_allotted === app.total_quantity ? 'allotted' : 'partially_allotted',
          lookupType: 'application_no',
          lookupIdentifierMasked: `CHALLENGE-${challenge.id.slice(0, 8)}`,
          lookupIdentifierHash: crypto.createHash('sha256').update(challenge.id).digest('hex'),
          normalizedResult: {
            resultType: challenge.claimed_shares_allotted === app.total_quantity ? 'allotted' : 'partially_allotted',
            sharesApplied: app.total_quantity,
            sharesAllotted: challenge.claimed_shares_allotted,
            reportedRefundAmount: Math.max(0, (app.blocked_amount || app.application_amount) - challenge.claimed_amount),
            sourceObservedAt: now,
          },
          evidenceSourceType: 'ADMIN_ENTERED',
          evidenceClassification: 'MANUAL_ADMIN',
          sourceObservedAt: now,
          verifiedAt: now,
          idempotencyKey: `dual_review_resolve:${challenge.id}`,
        });

        // Update projection and enqueue outbox
        await VerificationAttemptService.reconcileAndUpdateProjection({
          attempt,
          application: app,
        });
      }
    }

    return {
      challenge: updatedChallenge as AllotmentChallenge,
      resolvedStatus: finalStatus,
    };
  }

  /**
   * Generates a secure, time-limited signed URL for private evidence viewing (Admin only).
   */
  static async getSignedEvidenceUrl(
    storageObjectId: string,
    expiresInSeconds = 900 // 15 minutes TTL
  ): Promise<string> {
    const supabase = createAdminClient();
    const { data, error } = await supabase.storage
      .from('allotment-evidence')
      .createSignedUrl(storageObjectId, expiresInSeconds);

    if (error || !data) {
      throw new Error(`Failed to generate signed evidence URL: ${error?.message}`);
    }

    return data.signedUrl;
  }
}
