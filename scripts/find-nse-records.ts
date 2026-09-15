import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

import { createAdminClient } from '../lib/supabase/admin';

async function findNse() {
  const admin = createAdminClient();
  const { data: obs } = await admin
    .from('ipo_ingestion_observations')
    .select('id, source, company_name, normalized_payload, observed_at')
    .eq('source', 'nse');

  console.log('NSE observations count:', obs?.length);
  for (const o of obs || []) {
    console.log('NSE obs:', o.company_name, JSON.stringify(o.normalized_payload));
  }

  const { data: inbox } = await admin
    .from('ipo_ingestion_inbox')
    .select('*')
    .or('canonical_name.ilike.%manika%,canonical_name.ilike.%veegaland%');

  console.log('NSE inbox count:', inbox?.length);
  for (const i of inbox || []) {
    console.log('NSE inbox:', i.canonical_name, 'status:', i.review_status, 'conflict:', i.has_conflict, 'details:', JSON.stringify(i.conflict_details));
  }
}

findNse().catch(console.error);
