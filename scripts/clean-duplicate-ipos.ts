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

async function cleanDuplicates() {
  console.log('[Consolidation] Analyzing ipos table duplicates...');
  const { data: allIpos } = await supabase
    .from('ipos')
    .select('id, company_name, slug, symbol, issue_identity, created_at, publication_status')
    .order('created_at', { ascending: true });

  if (!allIpos) return;

  // Group by (company_name trimmed lowercase)
  const byName: Record<string, typeof allIpos> = {};
  for (const row of allIpos) {
    const key = row.company_name.trim().toLowerCase();
    if (!byName[key]) byName[key] = [];
    byName[key].push(row);
  }

  const toDeleteIds: string[] = [];

  for (const [name, rows] of Object.entries(byName)) {
    if (rows.length > 1) {
      // Pick the canonical row:
      // Prefer rows that have issue_identity set, and if multiple, the latest one.
      rows.sort((a, b) => {
        const aHasIssue = a.issue_identity ? 1 : 0;
        const bHasIssue = b.issue_identity ? 1 : 0;
        if (aHasIssue !== bHasIssue) return bHasIssue - aHasIssue;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      const canonicalKeeper = rows[0];
      const dupes = rows.slice(1);

      console.log(`Consolidating "${name}": keeping ${canonicalKeeper.id} (issue_identity: ${canonicalKeeper.issue_identity}), deleting ${dupes.length} duplicates`);

      for (const dupe of dupes) {
        // Update any foreign key references from dupe.id to canonicalKeeper.id
        // Tables that reference ipos(id): gmp_records, subscriptions, ipo_allotments, ipo_news
        await supabase.from('gmp_records').update({ ipo_id: canonicalKeeper.id }).eq('ipo_id', dupe.id);
        await supabase.from('subscriptions').update({ ipo_id: canonicalKeeper.id }).eq('ipo_id', dupe.id);
        await supabase.from('ipo_allotments').update({ ipo_id: canonicalKeeper.id }).eq('ipo_id', dupe.id);
        await supabase.from('ipo_news').update({ ipo_id: canonicalKeeper.id }).eq('ipo_id', dupe.id);
        await supabase.from('ipo_news_observations').update({ ipo_id: canonicalKeeper.id }).eq('ipo_id', dupe.id);
        // Also update ipo_ingestion_inbox.promoted_ipo_id
        await supabase.from('ipo_ingestion_inbox').update({ promoted_ipo_id: canonicalKeeper.id }).eq('promoted_ipo_id', dupe.id);

        toDeleteIds.push(dupe.id);
      }
    }
  }

  console.log(`[Consolidation] Total duplicate records to delete: ${toDeleteIds.length}`);
  if (toDeleteIds.length > 0) {
    // Delete in batches
    const batchSize = 20;
    for (let i = 0; i < toDeleteIds.length; i += batchSize) {
      const batch = toDeleteIds.slice(i, i + batchSize);
      const { error } = await supabase.from('ipos').delete().in('id', batch);
      if (error) {
        console.error(`Failed to delete batch ${i}:`, error.message);
      } else {
        console.log(`Deleted batch ${i} - ${i + batch.length}`);
      }
    }
  }

  // Also ensure every remaining ipo has an issue_identity
  const { data: remaining } = await supabase.from('ipos').select('id, company_name, offering_year, issue_identity');
  for (const row of remaining || []) {
    if (!row.issue_identity) {
      const norm = row.company_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      const year = row.offering_year || 2026;
      const identity = `${norm}-ipo-${year}`;
      await supabase.from('ipos').update({ issue_identity: identity }).eq('id', row.id);
    }
  }

  console.log('[Consolidation] Complete!');
}

cleanDuplicates().catch(console.error);
