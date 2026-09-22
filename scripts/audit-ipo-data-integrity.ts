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

async function runAudit() {
  console.log('========================================================================');
  console.log('🔍 LIVE PRODUCTION IPO DATA INTEGRITY AUDIT');
  console.log('========================================================================\n');

  const knownTables = [
    'ipos',
    'ipo_events',
    'ipo_business_profiles',
    'ipo_financials',
    'ipo_valuations',
    'ipo_peers',
    'ipo_promoters',
    'ipo_strengths',
    'ipo_risks',
    'ipo_scores',
    'ipo_documents',
    'ipo_news',
    'ipo_gmp_entries',
    'ipo_subscription_snapshots',
    'ipo_allotment_facts',
    'ipo_allotment_estimates',
    'ipo_registrar_portal_status',
    'ipo_allotment_events',
    'ipo_source_sync_runs',
    'ipo_source_observations',
    'ipo_source_identity_bindings',
    'ipo_ingestion_inbox',
    'ipo_master'
  ];

  console.log('--- TABLE RECORD COUNTS ---');
  for (const t of knownTables) {
    const { count, error } = await client.from(t).select('*', { count: 'exact', head: true });
    if (error) {
      console.log(`  Table [${t}]: ERROR / DOES NOT EXIST (${error.code}: ${error.message})`);
    } else {
      console.log(`  Table [${t}]: ${count} rows`);
    }
  }

  // 2. Query all published IPOs from `public.ipos`
  console.log('\n--- ALL PUBLISHED IPOS IN public.ipos ---');
  const { data: allIpos, error: iposErr } = await client
    .from('ipos')
    .select('id, slug, company_name, symbol, category, status, publication_status, open_date, close_date, listing_date, price_band_low, price_band_high, lot_size, issue_size_cr, registrar_name, exchange, market_segment, offering_year, provenance, created_at, updated_at')
    .eq('publication_status', 'published')
    .order('open_date', { ascending: false, nullsFirst: false });

  if (iposErr || !allIpos) {
    console.error('Error fetching ipos:', iposErr);
    return;
  }

  console.log(`Total published IPOs found: ${allIpos.length}`);
  console.log('\nDetailed list of all published IPOs:');
  for (let i = 0; i < allIpos.length; i++) {
    const ipo = allIpos[i];
    console.log(`\n[${i + 1}] ID: ${ipo.id}`);
    console.log(`    Slug: ${ipo.slug} | Symbol: ${ipo.symbol} | Category: ${ipo.category} | Segment: ${ipo.market_segment}`);
    console.log(`    Company: "${ipo.company_name}"`);
    console.log(`    Status in DB: ${ipo.status}`);
    console.log(`    Dates: Open=${ipo.open_date} | Close=${ipo.close_date} | Listing=${ipo.listing_date}`);
    console.log(`    Pricing: Low=${ipo.price_band_low} | High=${ipo.price_band_high} | Lot=${ipo.lot_size} | IssueSizeCr=${ipo.issue_size_cr}`);
    console.log(`    Registrar: ${ipo.registrar_name} | Exchange: ${ipo.exchange}`);
    console.log(`    Provenance summary:`, JSON.stringify(ipo.provenance).slice(0, 150) + '...');
    console.log(`    Created: ${ipo.created_at} | Updated: ${ipo.updated_at}`);
  }

  // 3. Compare with draft/unpublished IPOs
  const { data: unpublishedIpos } = await client
    .from('ipos')
    .select('id, slug, company_name, symbol, publication_status, status, open_date, close_date, listing_date')
    .neq('publication_status', 'published');

  console.log(`\n--- UNPUBLISHED / DRAFT IPOS (Count: ${unpublishedIpos?.length || 0}) ---`);
  if (unpublishedIpos && unpublishedIpos.length > 0) {
    for (const u of unpublishedIpos) {
      console.log(`  [${u.publication_status}] ${u.company_name} (${u.symbol || 'no-sym'}) - Slug: ${u.slug} - DB Status: ${u.status}`);
    }
  }

  // 4. Inspect Detail resolution for each published IPO
  console.log('\n--- DETAIL RESOLUTION AUDIT (Matching list record to research bundle & child tables) ---');
  for (const ipo of allIpos.slice(0, 10)) {
    console.log(`\n>>> Testing Detail for Slug: "${ipo.slug}" (Company: ${ipo.company_name})`);

    const { data: detailIpo, error: detailErr } = await client
      .from('ipos')
      .select('*, ipo_events(*)')
      .eq('slug', ipo.slug)
      .eq('publication_status', 'published')
      .single();

    if (detailErr || !detailIpo) {
      console.log(`  ❌ Slug lookup failed! Error:`, detailErr?.message);
      continue;
    }

    console.log(`  ✅ Slug lookup succeeded. ID match: ${ipo.id === detailIpo.id}`);

    const [biz, fin, val, peers, gmp, sub] = await Promise.all([
      client.from('ipo_business_profiles').select('company_name, sector, industry, description').eq('ipo_id', ipo.id).maybeSingle(),
      client.from('ipo_financials').select('financial_year, revenue_cr, net_profit_cr, total_assets_cr').eq('ipo_id', ipo.id),
      client.from('ipo_valuations').select('*').eq('ipo_id', ipo.id).maybeSingle(),
      client.from('ipo_peers').select('peer_company_name, peer_pe_ratio').eq('ipo_id', ipo.id),
      client.from('ipo_gmp_entries').select('gmp_value, gmp_percentage, observed_at, source').eq('ipo_id', ipo.id).order('observed_at', { ascending: false }).limit(3),
      client.from('ipo_subscription_snapshots').select('day_number, total_subscription_x, retail_subscription_x, recorded_at').eq('ipo_id', ipo.id).order('day_number', { ascending: true })
    ]);

    console.log(`  Child Records:`);
    console.log(`    - Business Profile: ${biz.data ? `Found (${biz.data.sector} / ${biz.data.industry})` : 'MISSING (null)'}`);
    console.log(`    - Financials: ${fin.data?.length || 0} rows`);
    console.log(`    - Valuations: ${val.data ? `Found (P/E: ${val.data.pre_issue_pe ?? 'null'})` : 'MISSING (null)'}`);
    console.log(`    - Peers: ${peers.data?.length || 0} rows`);
    console.log(`    - GMP Entries: ${gmp.data?.length || 0} rows (Latest: ${gmp.data?.[0]?.gmp_value ?? 'none'})`);
    console.log(`    - Subscription Snapshots: ${sub.data?.length || 0} rows (Latest: ${sub.data?.[sub.data.length - 1]?.total_subscription_x ?? 'none'}x)`);

    if (biz.data && biz.data.company_name && biz.data.company_name !== ipo.company_name) {
      console.log(`  ⚠️ MISMATCH in Business Profile company_name! Expected "${ipo.company_name}", got "${biz.data.company_name}"`);
    }
  }

  // 5. Check Ingestion Inbox and Source Identity Bindings
  console.log('\n--- SOURCE OBSERVATIONS & INGESTION INBOX AUDIT ---');
  const { data: inboxItems } = await client
    .from('ipo_ingestion_inbox')
    .select('*')
    .limit(10);
  console.log(`Sample Ingestion Inbox items (${inboxItems?.length || 0}):`);
  for (const item of inboxItems || []) {
    console.log(`  - [${item.review_status}] ${item.canonical_name} (Symbol: ${item.symbol}) - Conflicted: ${item.has_conflict} - Promoted IPO ID: ${item.promoted_ipo_id}`);
  }

  const { data: bindings } = await client
    .from('ipo_source_identity_bindings')
    .select('*')
    .limit(10);
  console.log(`Sample Source Identity Bindings (${bindings?.length || 0}):`);
  for (const b of bindings || []) {
    console.log(`  - Binding: Source=${b.source} SourceID=${b.source_record_id} -> CanonicalID=${b.canonical_ipo_id || b.inbox_candidate_id}`);
  }
}

runAudit().catch(console.error);
