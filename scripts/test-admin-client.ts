import fs from 'fs';
import path from 'path';

// Setup environment credentials from .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

import { createAdminClient } from '../lib/supabase/admin';

async function testAdmin() {
  const admin = createAdminClient();
  const { data: applicants, error } = await admin
    .from('applicant_profiles')
    .select('id, user_id, display_name')
    .limit(5);
  console.log('Applicant profiles:', { applicants, error });
}

testAdmin();
