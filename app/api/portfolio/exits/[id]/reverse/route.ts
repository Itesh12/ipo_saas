/**
 * app/api/portfolio/exits/[id]/reverse/route.ts
 *
 * Candidate E: Protected API Route for Compensating Reversals.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PortfolioExitService } from '@/features/finance/services/portfolioExitService';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized: Authentication required.' },
        { status: 401 }
      );
    }

    const resolvedParams = await params;
    const exitId = resolvedParams.id;
    const body = await request.json().catch(() => ({}));

    if (!body.reversalIdempotencyKey || !body.reason) {
      return NextResponse.json(
        { error: 'Missing required parameters: reversalIdempotencyKey, reason.' },
        { status: 400 }
      );
    }

    // Verify ownership or admin role
    const admin = createAdminClient();
    const { data: exitTx } = await admin
      .from('portfolio_exit_transactions')
      .select('user_id')
      .eq('id', exitId)
      .maybeSingle();

    if (!exitTx) {
      return NextResponse.json({ error: 'Exit transaction not found.' }, { status: 404 });
    }

    if (exitTx.user_id !== user.id) {
      const { data: profile } = await admin
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
        return NextResponse.json({ error: 'Forbidden: Insufficient permissions.' }, { status: 403 });
      }
    }

    const result = await PortfolioExitService.reverseExitTransaction({
      exitTransactionId: exitId,
      reversalIdempotencyKey: body.reversalIdempotencyKey,
      reason: body.reason,
      actorId: user.id,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          error: result.errorMessage,
          errorCode: result.errorCode,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
