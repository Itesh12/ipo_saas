import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const envLocalPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envLocalPath, 'utf8');

const vars: Record<string, string> = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    vars[key] = val;
  }
}

const requiredKeys = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'CRON_SECRET',
];

for (const key of requiredKeys) {
  const val = vars[key];
  if (!val) {
    console.error(`Missing required key: ${key}`);
    continue;
  }
  console.log(`Setting Vercel Environment Variable: ${key}...`);
  try {
    const cmd = `npx vercel env add ${key} production,preview,development --value "${val}" --yes --force`;
    const res = execSync(cmd, { encoding: 'utf8' });
    console.log(`  -> OK: ${res.trim().split('\n')[0]}`);
  } catch (err: any) {
    console.error(`  -> Failed to set ${key}:`, err.message);
  }
}
