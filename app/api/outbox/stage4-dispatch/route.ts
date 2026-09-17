import { NextResponse } from 'next/server';
import { Stage4OutboxConsumer } from '@/features/finance/workers/stage4OutboxConsumer';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    let isAuthorized = false;

    // 1. Bearer Token Check (Cron / Internal automation)
    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
      isAuthorized = true;
    }

    // 2. Session RBAC Check (Admin / Super Admin via interactive console)
    if (!isAuthorized) {
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

      const adminClient = createAdminClient();
      const { data: profile } = await adminClient
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (!profile || (profile.role !== 'admin' && profile.role !== 'super_admin')) {
        return NextResponse.json(
          { error: 'Forbidden: Administrator privileges required to dispatch financial outbox.' },
          { status: 403 }
        );
      }

      isAuthorized = true;
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await Stage4OutboxConsumer.processPendingQueue(50);
    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[API][stage4-dispatch] Error processing outbox queue:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
