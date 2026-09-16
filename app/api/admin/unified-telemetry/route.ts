/**
 * app/api/admin/unified-telemetry/route.ts
 *
 * Phase 10 / Stage 5E: Production Unified Telemetry Admin Endpoint.
 *
 * Strictly RBAC Protected:
 * - Unauthenticated -> 401 Unauthorized
 * - Role 'user' -> 403 Forbidden
 * - Role 'admin' | 'super_admin' -> 200 OK with unified system health telemetry.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { UnifiedTelemetryService } from '@/features/finance/services/unifiedTelemetryService';
import { PortfolioReconciliationEngine } from '@/features/finance/services/portfolioReconciliationEngine';

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
      return NextResponse.json({ error: 'Forbidden: Administrative role required' }, { status: 403 });
    }

    const telemetry = await UnifiedTelemetryService.getUnifiedTelemetry();
    const reconciliationStates = await PortfolioReconciliationEngine.getReconciliationStates({ limit: 50 } as any);

    return NextResponse.json({
      success: true,
      telemetry,
      reconciliationStates,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[API /api/admin/unified-telemetry] Error:', msg);
    return NextResponse.json({ error: `Internal Server Error: ${msg}` }, { status: 500 });
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
      return NextResponse.json({ error: 'Forbidden: Administrative role required' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const { action } = body;

    if (action === 'trigger_reconciliation') {
      const { userId, applicantId, securityId, expectedQuantity, expectedCostBasis } = body;
      if (!userId || !securityId || expectedQuantity === undefined) {
        return NextResponse.json({ error: 'Missing required fields for reconciliation' }, { status: 400 });
      }

      const result = await PortfolioReconciliationEngine.reconcilePosition({
        userId,
        applicantId: applicantId || null,
        securityId,
        expectedQuantity: Number(expectedQuantity),
        expectedCostBasis: Number(expectedCostBasis || 0),
        sourceDetails: { source: 'admin_manual_trigger', triggeredBy: user.id },
      });

      return NextResponse.json({ success: true, result });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Action failed: ${msg}` }, { status: 500 });
  }
}
