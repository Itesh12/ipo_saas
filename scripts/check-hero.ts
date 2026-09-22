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

async function checkHero() {
  const { data } = await client
    .from('ipos')
    .select('id, slug, company_name, symbol, open_date, close_date, price_band_low, price_band_high, issue_size_cr')
    .ilike('company_name', '%Hero%');
  console.log('Hero matches:', data);
}

checkHero().catch(console.error);
