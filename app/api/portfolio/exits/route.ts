/**
 * app/api/portfolio/exits/route.ts
 *
 * Candidate E: Protected API Route for Equity Exits / Secondary Sales.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PortfolioExitService } from '@/features/finance/services/portfolioExitService';
import { ExecuteExitInput } from '@/features/finance/types/exitTypes';

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const securityId = searchParams.get('securityId');
    const applicantId = searchParams.get('applicantId');

    const admin = createAdminClient();
    let query = admin
      .from('portfolio_exit_transactions')
      .select(`
        *,
        portfolio_exit_allocations (*),
        portfolio_exit_charges (*),
        securities (
          symbol,
          company_name,
          exchange,
          isin
        )
      `)
      .eq('user_id', user.id)
      .order('execution_date', { ascending: false });

    if (securityId) {
      query = query.eq('security_id', securityId);
    }
    if (applicantId) {
      query = query.eq('applicant_id', applicantId);
    }

    const { data: exits, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ exits: exits || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
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

    const body = await request.json().catch(() => ({}));

    if (!body.securityId || !body.quantitySold || !body.executionPrice || !body.idempotencyKey) {
      return NextResponse.json(
        { error: 'Missing required parameters: securityId, quantitySold, executionPrice, idempotencyKey.' },
        { status: 400 }
      );
    }

    const input: ExecuteExitInput = {
      userId: user.id,
      applicantId: body.applicantId || null,
      securityId: body.securityId,
      quantitySold: body.quantitySold.toString(),
      executionPrice: body.executionPrice.toString(),
      charges: body.charges || [],
      executionDate: body.executionDate,
      settlementDate: body.settlementDate,
      idempotencyKey: body.idempotencyKey,
      executionSource: body.executionSource || 'MANUAL',
      sourceRecordId: body.sourceRecordId || null,
      metadata: body.metadata || {},
      actorId: user.id,
    };

    const result = await PortfolioExitService.executeExitTransaction(input);

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
