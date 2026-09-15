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

async function listSebi() {
  const admin = createAdminClient();
  const { data: obs } = await admin
    .from('ipo_ingestion_observations')
    .select('id, source, external_id, document_type, normalized_payload, observed_at')
    .eq('source', 'sebi')
    .order('observed_at', { ascending: false });

  console.log('Total SEBI observations:', obs?.length);
  for (const o of obs || []) {
    const p = o.normalized_payload as any;
    console.log(`- "${p?.company_name}" | doc: ${o.document_type} | price: ${p?.price_band_low}-${p?.price_band_high} | dates: ${p?.open_date} to ${p?.close_date} | type: ${p?.issue_type}`);
  }
}

listSebi().catch(console.error);
