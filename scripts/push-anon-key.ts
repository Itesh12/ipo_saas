import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const envLocalPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envLocalPath, 'utf8');

let anon = '';
for (const line of envContent.split('\n')) {
  if (line.trim().startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) {
    anon = line.trim().slice('NEXT_PUBLIC_SUPABASE_ANON_KEY='.length).replace(/^["']|["']$/g, '');
  }
}

if (!anon) {
  console.error('No anon key found');
  process.exit(1);
}

console.log('Adding NEXT_PUBLIC_SUPABASE_ANON_KEY with --type config...');
const cmd = `npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production,preview,development --value "${anon}" --type config --yes --force`;
const out = execSync(cmd, { encoding: 'utf8' });
console.log(out);
