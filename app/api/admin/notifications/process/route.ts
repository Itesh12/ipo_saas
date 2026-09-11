import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { EventProcessor } from '@/features/notifications/services/eventProcessor';

export async function POST(req: NextRequest) {
  try {
    // 1. Bearer token authorization
    const authHeader = req.headers.get('authorization') || '';
    const secret = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const token = authHeader.replace(/^Bearer\s+/i, '');

    if (!secret || token !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const batchSize = typeof body?.batchSize === 'number' ? Math.min(100, Math.max(1, body.batchSize)) : 20;

    const supabase = createAdminClient();
    const result = await EventProcessor.processBatch(supabase, batchSize);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      result,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
