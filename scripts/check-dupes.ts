import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envContent = fs.readFileSync('.env.local', 'utf-8');
const envVars = Object.fromEntries(
  envContent.split('\n').filter(l => l.includes('=')).map(l => {
    const idx = l.indexOf('=');
    return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
  })
);

const supabase = createClient(envVars.NEXT_PUBLIC_SUPABASE_URL, envVars.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: ipos } = await supabase
    .from('ipos')
    .select('id, company_name, slug, symbol, issue_identity, created_at');

  const byIssueId: Record<string, any[]> = {};
  for (const row of ipos || []) {
    if (row.issue_identity) {
      if (!byIssueId[row.issue_identity]) byIssueId[row.issue_identity] = [];
      byIssueId[row.issue_identity].push(row);
    }
  }

  const dupes = Object.entries(byIssueId).filter(([_, list]) => list.length > 1);
  console.log('Duplicate non-null issue_identity count:', dupes.length);
  for (const [id, list] of dupes) {
    console.log(`- "${id}" (${list.length} rows):`, list.map(x => ({ id: x.id, name: x.company_name, slug: x.slug, created: x.created_at })));
  }
}

check().catch(console.error);
