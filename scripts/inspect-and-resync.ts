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
import { NseSourceClient } from '../features/external-integrations/clients/nseSourceClient';
import { NseIngestionAdapter } from '../features/external-integrations/adapters/nseExtractor';

async function testNseDirect() {
  const admin = createAdminClient();
  const nseClient = new NseSourceClient();

  console.log('Fetching live NSE current issues...');
  const res = await nseClient.fetchLiveCurrentIssues();
  console.log(`Fetched ${res.issues.length} live issues from NSE!`);

  for (const issue of res.issues) {
    const norm = NseIngestionAdapter.normalizeIssue(issue);
    console.log(`\nNormalized NSE Issue: ${norm.normalized_payload.company_name}`);
    console.log(`  Symbol: ${norm.normalized_payload.symbol}`);
    console.log(`  Price Band: low=${norm.normalized_payload.price_band_low}, high=${norm.normalized_payload.price_band_high}`);
    console.log(`  Dates: open=${norm.normalized_payload.open_date}, close=${norm.normalized_payload.close_date}`);
    console.log(`  Lot Size: ${norm.normalized_payload.lot_size}`);
    console.log(`  Status: ${norm.normalized_payload.business_status}`);
  }
}

testNseDirect().catch(console.error);
