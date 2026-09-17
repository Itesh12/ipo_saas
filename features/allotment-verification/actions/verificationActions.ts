'use server';

/**
 * features/allotment-verification/actions/verificationActions.ts
 *
 * Server Actions for Candidate B Allotment Verification & Dual-Control Challenges.
 */

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { AllotmentVerificationService } from '../services/allotmentVerificationService';
import { ChallengeService, SubmitChallengeInput, ReviewChallengeInput } from '../services/challengeService';
import { SubmitUserAssistedResultInput } from '../types/verificationTypes';
import { createAdminClient } from '@/lib/supabase/admin';

export async function verifyAllotmentAction(applicationId: string, forceRefresh = false) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Unauthorized: Please log in.' };
    }

    const result = await AllotmentVerificationService.verifyApplicationAllotment({
      applicationId,
      actorId: user.id,
      forceRefresh,
    });

    revalidatePath(`/applications/${applicationId}`);
    revalidatePath('/applications');
    return result;
  } catch (err: any) {
    console.error('[verifyAllotmentAction] Failed:', err);
    return { success: false, error: err.message || 'Internal verification error.' };
  }
}

export async function submitUserAssistedResultAction(input: SubmitUserAssistedResultInput) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Unauthorized: Please log in.' };
    }

    const result = await AllotmentVerificationService.submitUserAssistedResult(input, user.id);

    revalidatePath(`/applications/${input.applicationId}`);
    revalidatePath('/applications');
    return result;
  } catch (err: any) {
    console.error('[submitUserAssistedResultAction] Failed:', err);
    return { success: false, error: err.message || 'Failed to submit allotment outcome.' };
  }
}

export async function submitChallengeAction(input: Omit<SubmitChallengeInput, 'userId'>) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Unauthorized: Please log in.' };
    }

    const challenge = await ChallengeService.submitChallenge({
      ...input,
      userId: user.id,
    });

    revalidatePath(`/applications/${input.applicationId}`);
    return { success: true, challenge };
  } catch (err: any) {
    console.error('[submitChallengeAction] Failed:', err);
    return { success: false, error: err.message || 'Failed to submit challenge.' };
  }
}

export async function primaryReviewAction(input: Omit<ReviewChallengeInput, 'reviewerId'>) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Unauthorized: Please log in.' };
    }

    const challenge = await ChallengeService.executePrimaryReview({
      ...input,
      reviewerId: user.id,
    });

    revalidatePath('/admin/allotment-reconciliation');
    return { success: true, challenge };
  } catch (err: any) {
    console.error('[primaryReviewAction] Failed:', err);
    return { success: false, error: err.message || 'Primary review failed.' };
  }
}

export async function secondaryReviewAction(input: Omit<ReviewChallengeInput, 'reviewerId'>) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Unauthorized: Please log in.' };
    }

    const result = await ChallengeService.executeSecondaryReview({
      ...input,
      reviewerId: user.id,
    });

    revalidatePath('/admin/allotment-reconciliation');
    return { success: true, ...result };
  } catch (err: any) {
    console.error('[secondaryReviewAction] Failed:', err);
    return { success: false, error: err.message || 'Secondary review failed.' };
  }
}

export async function getSignedEvidenceUrlAction(storageObjectId: string) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    // Check admin role
    const adminClient = createAdminClient();
    const { data: profile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || (profile.role !== 'admin' && profile.role !== 'super_admin')) {
      return { success: false, error: 'Forbidden: Admin access required.' };
    }

    const signedUrl = await ChallengeService.getSignedEvidenceUrl(storageObjectId);
    return { success: true, signedUrl };
  } catch (err: any) {
    console.error('[getSignedEvidenceUrlAction] Failed:', err);
    return { success: false, error: err.message };
  }
}

export async function getConflictQueueAction() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    const queue = await AllotmentVerificationService.getConflictQueue();
    return { success: true, queue };
  } catch (err: any) {
    console.error('[getConflictQueueAction] Failed:', err);
    return { success: false, error: err.message };
  }
}

export async function getAllChallengesAction() {
  try {
    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('ipo_allotment_challenges')
      .select(`
        *,
        ipo_applications (
          id,
          application_number,
          total_quantity,
          ipos (
            company_name,
            symbol
          )
        ),
        profiles:user_id (
          id,
          full_name,
          email
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { success: true, challenges: data || [] };
  } catch (err: any) {
    console.error('[getAllChallengesAction] Failed:', err);
    return { success: false, error: err.message };
  }
}
