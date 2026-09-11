import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const secret = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const token = authHeader.replace(/^Bearer\s+/i, '');

    if (!secret || token !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    // 1. Pending events & oldest pending age
    const { data: pendingEvents, count: pendingCount } = await supabase
      .from('notification_events')
      .select('created_at', { count: 'exact' })
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1);

    const oldestPendingAgeSeconds =
      pendingEvents && pendingEvents.length > 0
        ? Math.max(0, Math.floor((Date.now() - new Date(pendingEvents[0].created_at).getTime()) / 1000))
        : 0;

    // 2. Processing events count
    const { count: processingCount } = await supabase
      .from('notification_events')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'processing');

    // 3. Dead letter events count
    const { count: deadLetterCount } = await supabase
      .from('notification_events')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'dead_letter');

    // 4. Last processed timestamp
    const { data: lastProcessed } = await supabase
      .from('notification_events')
      .select('processed_at')
      .eq('status', 'processed')
      .order('processed_at', { ascending: false })
      .limit(1);

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      metrics: {
        pending_events: pendingCount || 0,
        processing_events: processingCount || 0,
        dead_letter_events: deadLetterCount || 0,
        oldest_pending_age_seconds: oldestPendingAgeSeconds,
        last_processed_at: lastProcessed?.[0]?.processed_at || null,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
