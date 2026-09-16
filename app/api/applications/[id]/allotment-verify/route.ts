/**
 * app/api/applications/[id]/allotment-verify/route.ts
 *
 * Stage 4 Allotment Verification Gateway Endpoint:
 * - POST: Triggers automated check or accepts user-assisted allotment confirmation
 * - GET: Returns allotment projection and immutable audit attempts history
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { AllotmentVerificationService } from '@/features/allotment-verification/services/allotmentVerificationService';
import { submitUserAssistedResultSchema } from '@/features/allotment-verification/schemas/allotmentVerificationSchemas';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user owns application or is admin
    const { data: rawApp, error: appErr } = await supabase
      .from('ipo_applications')
      .select('id, user_id')
      .eq('id', id)
      .single();

    const app = rawApp as unknown as { id: string; user_id: string } | null;

    if (appErr || !app) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    if (app.user_id !== user.id) {
      // Check admin
      const { data: rawProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      const profile = rawProfile as unknown as { role: string } | null;

      if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const adminClient = createAdminClient();

    // 1. Fetch Projection
    const { data: projection } = await adminClient
      .from('ipo_application_allotment_projections')
      .select('*')
      .eq('application_id', id)
      .maybeSingle();

    // 2. Fetch Attempts History
    const { data: attempts } = await adminClient
      .from('ipo_allotment_verification_attempts')
      .select('*')
      .eq('application_id', id)
      .order('created_at', { ascending: false });

    return NextResponse.json({
      success: true,
      projection: projection || null,
      attempts: attempts || [],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to fetch verification status: ${msg}` }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user owns application or is admin
    const { data: rawApp, error: appErr } = await supabase
      .from('ipo_applications')
      .select('id, user_id')
      .eq('id', id)
      .single();

    const app = rawApp as unknown as { id: string; user_id: string } | null;

    if (appErr || !app) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    if (app.user_id !== user.id) {
      const { data: rawProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      const profile = rawProfile as unknown as { role: string } | null;

      if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch {
      // Empty body is allowed for standard automated query
    }

    // User-Assisted Mode Submission (Mode 2)
    if (body.mode === 'user_assisted') {
      const parsed = submitUserAssistedResultSchema.safeParse({
        ...body,
        applicationId: id,
      });

      if (!parsed.success) {
        return NextResponse.json(
          {
            error: 'Invalid user-assisted payload',
            details: parsed.error.issues.map((i) => i.message),
          },
          { status: 400 }
        );
      }

      const result = await AllotmentVerificationService.submitUserAssistedResult(
        parsed.data,
        user.id
      );

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      return NextResponse.json(result);
    }

    // Automated / Challenge Discovery Mode
    const forceRefresh = Boolean(body.forceRefresh);
    const result = await AllotmentVerificationService.verifyApplicationAllotment({
      applicationId: id,
      actorId: user.id,
      forceRefresh,
    });

    if (!result.success && result.status === 'concurrency_locked') {
      return NextResponse.json(
        { error: result.error, inProgress: true },
        { status: 409 }
      );
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Verification request failed: ${msg}` }, { status: 500 });
  }
}
