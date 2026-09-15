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

async function checkColumns() {
  const admin = createAdminClient();
  const { data, error } = await admin.from('ipos').select('*').limit(1);
  if (error) {
    console.error('Error querying ipos:', error);
    return;
  }
  if (data && data[0]) {
    console.log('Columns in ipos table:');
    console.log(Object.keys(data[0]));
  }
}

checkColumns().catch(console.error);
