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

async function inspect() {
  console.log('Inspecting Supabase database...');
  
  // 1. Check ipos
  const { data: iposData, error: iposErr } = await supabase.from('ipos').select('*').limit(2);
  console.log('ipos table query error:', iposErr?.message || 'none');
  if (iposData && iposData.length > 0) {
    console.log('Sample ipos columns:', Object.keys(iposData[0]));
    console.log('Sample row:', iposData[0]);
  }

  // 2. Check ipo_ingestion_inbox
  const { data: inboxData, error: inboxErr } = await supabase.from('ipo_ingestion_inbox').select('*').limit(2);
  console.log('ipo_ingestion_inbox query error:', inboxErr?.message || 'none');
  if (inboxData && inboxData.length > 0) {
    console.log('Sample inbox columns:', Object.keys(inboxData[0]));
  }

  // 3. Check ipo_rejection_audit
  const { data: auditData, error: auditErr } = await supabase.from('ipo_rejection_audit').select('*').limit(2);
  console.log('ipo_rejection_audit query error:', auditErr?.message || 'none');
}

inspect().catch(console.error);
