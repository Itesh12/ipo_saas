import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env.local', 'utf-8');
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

async function inspectChildTables() {
  console.log('=== INSPECTING CHILD TABLES WITH DATA ===\n');

  const { data: bp } = await client.from('ipo_business_profiles').select('*, ipos(id, slug, company_name, symbol)');
  console.log('ipo_business_profiles:', JSON.stringify(bp, null, 2));

  const { data: fin } = await client.from('ipo_financials').select('*, ipos(id, slug, company_name, symbol)');
  console.log('ipo_financials:', JSON.stringify(fin, null, 2));

  const { data: val } = await client.from('ipo_valuations').select('*, ipos(id, slug, company_name, symbol)');
  console.log('ipo_valuations:', JSON.stringify(val, null, 2));
}

inspectChildTables().catch(console.error);
