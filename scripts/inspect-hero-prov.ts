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

async function inspectProvenance() {
  const { data } = await client
    .from('ipos')
    .select('company_name, symbol, provenance')
    .eq('id', '675f3219-2f30-46d4-a173-c2d85a1122ca')
    .single();
  console.log('Hero Motors provenance:', JSON.stringify(data?.provenance, null, 2));
}

inspectProvenance().catch(console.error);
