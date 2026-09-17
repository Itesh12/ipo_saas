import { NextResponse } from 'next/server';
import { Stage4OutboxConsumer } from '@/features/finance/workers/stage4OutboxConsumer';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    // Optional secret verification if configured
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      // In development or test, allow execution
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
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
