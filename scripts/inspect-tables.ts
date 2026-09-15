import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envContent = fs.readFileSync('.env.local', 'utf-8');
const envVars: Record<string, string> = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = trimmed.indexOf('=');
  if (idx !== -1) {
    envVars[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
}

const supabase = createClient(envVars.NEXT_PUBLIC_SUPABASE_URL, envVars.SUPABASE_SERVICE_ROLE_KEY);

async function inspectTables() {
  const tables = [
    'audit_logs',
    'external_events',
    'ipo_sync_runs',
    'ipo_source_observations',
    'ipo_source_identity_bindings',
    'external_pruning_runs',
    'ipo_documents',
    'ipo_news'
  ];

  for (const t of tables) {
    const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
    console.log(`Table ${t}: exists=${!error}, count=${count ?? 'N/A'}, error=${error?.message || 'none'}`);
  }
}

inspectTables().catch(console.error);
