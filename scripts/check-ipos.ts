import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('C:/Users/Dell/.gemini/antigravity-ide/scratch/ipo-saas/.env.local', 'utf-8');
const envVars: Record<string, string> = {};
for (const line of env.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = trimmed.indexOf('=');
  if (idx !== -1) {
    envVars[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
}

const client = createClient(envVars.NEXT_PUBLIC_SUPABASE_URL, envVars.SUPABASE_SERVICE_ROLE_KEY);

async function checkIpos() {
  await client
    .from('ipos')
    .update({ publication_status: 'published', category: 'sme_bse', published_at: new Date().toISOString() })
    .eq('symbol', 'SONASEL');

  const { data, count, error } = await client
    .from('ipos')
    .select('id, company_name, symbol, status, category, price_band_low, price_band_high, publication_status', { count: 'exact' });

  console.log('--- ALL IPOS IN DATABASE ---');
  console.log('Total Count:', count);
  console.log('Error:', error);
  console.log('Rows:', data);

  const { data: inbox, count: inboxCount, error: inboxErr } = await client
    .from('ipo_ingestion_inbox')
    .select('id, canonical_name, review_status', { count: 'exact' });
  console.log('\n--- INGESTION INBOX ---');
  console.log('Count:', inboxCount, 'Error:', inboxErr?.message);
  console.log('Rows:', inbox);

  const { data: bindings, error: bindErr } = await client
    .from('ipo_source_identity_bindings')
    .select('*')
    .limit(1);
  console.log('\n--- BINDINGS TABLE ---');
  console.log('Exists:', !bindErr, 'Error:', bindErr?.message);
}

checkIpos().catch(console.error);
