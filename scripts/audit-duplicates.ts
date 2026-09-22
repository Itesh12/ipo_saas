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

async function checkDuplicates() {
  console.log('=== SEARCHING FOR DUPLICATE IPOS ===\n');

  // Search Jindal
  const { data: jindal } = await client
    .from('ipos')
    .select('id, slug, company_name, symbol, open_date, close_date, listing_date, price_band_low, price_band_high, lot_size, issue_size_cr, category, provenance, created_at')
    .ilike('company_name', '%Jindal%');

  console.log(`Found ${jindal?.length} records for "Jindal":`);
  jindal?.forEach((r, i) => {
    console.log(`\n[Jindal ${i + 1}] ID: ${r.id}`);
    console.log(`  Slug: ${r.slug} | Symbol: ${r.symbol}`);
    console.log(`  Name: "${r.company_name}"`);
    console.log(`  Dates: Open=${r.open_date} | Close=${r.close_date} | Listing=${r.listing_date}`);
    console.log(`  Price: ₹${r.price_band_low} - ₹${r.price_band_high} | Lot: ${r.lot_size} | IssueSizeCr: ${r.issue_size_cr}`);
    console.log(`  Created: ${r.created_at}`);
    console.log(`  Provenance:`, JSON.stringify(r.provenance));
  });

  // Search Sona
  const { data: sona } = await client
    .from('ipos')
    .select('id, slug, company_name, symbol, open_date, close_date, listing_date, price_band_low, price_band_high, lot_size, issue_size_cr, category, provenance, created_at')
    .ilike('company_name', '%Sona%');

  console.log(`\nFound ${sona?.length} records for "Sona":`);
  sona?.forEach((r, i) => {
    console.log(`\n[Sona ${i + 1}] ID: ${r.id}`);
    console.log(`  Slug: ${r.slug} | Symbol: ${r.symbol}`);
    console.log(`  Name: "${r.company_name}"`);
    console.log(`  Dates: Open=${r.open_date} | Close=${r.close_date} | Listing=${r.listing_date}`);
    console.log(`  Price: ₹${r.price_band_low} - ₹${r.price_band_high} | Lot: ${r.lot_size} | IssueSizeCr: ${r.issue_size_cr}`);
    console.log(`  Created: ${r.created_at}`);
    console.log(`  Provenance:`, JSON.stringify(r.provenance));
  });

  // Find all duplicated symbols
  const { data: allWithSymbol } = await client
    .from('ipos')
    .select('id, slug, company_name, symbol')
    .not('symbol', 'is', null);

  const symbolMap = new Map<string, any[]>();
  for (const row of allWithSymbol || []) {
    const s = row.symbol.toUpperCase();
    if (!symbolMap.has(s)) symbolMap.set(s, []);
    symbolMap.get(s)!.push(row);
  }

  console.log(`\n=== DUPLICATE SYMBOLS IN public.ipos ===`);
  let dupCount = 0;
  for (const [sym, rows] of symbolMap.entries()) {
    if (rows.length > 1) {
      dupCount++;
      console.log(`\nSymbol "${sym}" has ${rows.length} records:`);
      rows.forEach(r => console.log(`  - [${r.id}] "${r.company_name}" (Slug: ${r.slug})`));
    }
  }
  console.log(`\nTotal duplicate symbol groups: ${dupCount}`);
}

checkDuplicates().catch(console.error);
