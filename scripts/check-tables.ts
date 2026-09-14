import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envContent = fs.readFileSync('.env.local', 'utf-8');
const envVars: Record<string, string> = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const idx = trimmed.indexOf('=');
    if (idx > -1) {
      envVars[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
  }
}

const supabase = createClient(envVars['NEXT_PUBLIC_SUPABASE_URL'], envVars['SUPABASE_SERVICE_ROLE_KEY']);

async function check() {
  const { data, error } = await supabase.from('ipo_documents').select('id, source_observation_id, version_number, validation_status').limit(1);
  if (error) {
    console.error('Error selecting ipo_documents:', error);
  } else {
    console.log('Successfully queried ipo_documents. Sample row:', data);
  }
}

check();
