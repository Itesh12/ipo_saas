/**
 * app/api/admin/allotment-conflicts/route.ts
 *
 * Administrative Queue for Allotment Verification Conflicts and Exceptions.
 * Exclusively accessible by role 'admin' or 'super_admin'.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { AllotmentVerificationService } from '@/features/allotment-verification/services/allotmentVerificationService';
import { z } from 'zod';

const resolveConflictSchema = z.object({
  applicationId: z.string().uuid(),
  resolution: z.enum(['confirm_allotted', 'confirm_not_allotted', 'request_evidence']),
  sharesAllotted: z.number().int().nonnegative().optional(),
  allotmentPrice: z.number().positive().optional(),
  notes: z.string().min(5).max(1000),
});

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: rawProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const profile = rawProfile as unknown as { role: string } | null;

    if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const queue = await AllotmentVerificationService.getConflictQueue();
    return NextResponse.json({ success: true, count: queue.length, items: queue });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to fetch conflicts: ${msg}` }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: rawProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const profile = rawProfile as unknown as { role: string } | null;

    if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = resolveConflictSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid resolution payload', details: parsed.error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }

    const { applicationId, resolution, sharesAllotted = 0, allotmentPrice, notes } = parsed.data;
    const adminClient = createAdminClient();

    if (resolution === 'confirm_allotted' || resolution === 'confirm_not_allotted') {
      const isAllotted = resolution === 'confirm_allotted';
      const resultType = isAllotted ? (sharesAllotted > 0 ? 'allotted' : 'not_allotted') : 'not_allotted';

      await adminClient
        .from('ipo_application_allotment_projections')
        .update({
          evidence_classification: 'MANUAL_ADMIN',
          has_conflict: false,
          conflict_details: `Resolved by admin: ${notes}`,
          shares_allotted: isAllotted ? sharesAllotted : 0,
          updated_at: new Date().toISOString(),
        } as never)
        .eq('application_id', applicationId);

      // Audit attempt
      await adminClient.from('ipo_allotment_verification_attempts').insert({
        application_id: applicationId,
        applicant_id: (await adminClient.from('ipo_applications').select('applicant_id').eq('id', applicationId).single()).data?.applicant_id,
        ipo_id: (await adminClient.from('ipo_applications').select('ipo_id').eq('id', applicationId).single()).data?.ipo_id,
        registrar_code: 'manual_admin',
        verification_mode: 'manual_admin_entry',
        attempt_status: 'completed',
        verification_result: resultType,
        lookup_type: 'application_no',
        lookup_identifier_masked: 'ADMIN_MANUAL',
        lookup_identifier_hash: '0000000000000000000000000000000000000000000000000000000000000000',
        raw_response_hash: '0000000000000000000000000000000000000000000000000000000000000000',
        raw_response_retention: 'none',
        evidence_source_type: 'ADMIN_ENTERED',
        evidence_classification: 'MANUAL_ADMIN',
        idempotency_key: `admin_resolve:${applicationId}:${Date.now()}`,
        error_message: notes,
      } as never);
    }

    return NextResponse.json({ success: true, message: 'Conflict adjudication recorded.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Adjudication failed: ${msg}` }, { status: 500 });
  }
}
