import fs from 'fs';
import path from 'path';

// Load .env.local
const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  const content = fs.readFileSync(envLocalPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

import { createAdminClient } from '../lib/supabase/admin';

async function main() {
  const admin = createAdminClient();
  const { data: runs, error } = await admin
    .from('ipo_source_sync_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Error fetching sync runs:', error);
    return;
  }

  const { data: vercelRuns, error: vErr } = await admin
    .from('ipo_source_sync_runs')
    .select('*')
    .order('started_at', { ascending: false });

  if (vErr) {
    console.error('Error fetching vercel runs:', vErr);
    return;
  }

  console.log(`\n=== ALL VERCEL_CRON OR SKIPPED_LOCK RUNS ===`);
  const matching = (vercelRuns || []).filter(r => {
    const init = (r.metadata as Record<string, unknown>)?.initiatedBy;
    return init === 'vercel_cron' || r.status === 'SKIPPED_LOCK';
  });

  for (const r of matching) {
    console.log(JSON.stringify({
      id: r.id,
      source: r.source,
      started_at: r.started_at,
      finished_at: r.finished_at,
      status: r.status,
      records_discovered: r.records_discovered,
      records_ingested: r.records_ingested,
      records_unchanged: r.records_unchanged,
      metadata: r.metadata
    }, null, 2));
  }
}

main().catch(console.error);
