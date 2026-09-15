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
import { ipoCanonicalPromotionService } from '../features/external-integrations/services/ipoCanonicalPromotionService';

async function check() {
  const admin = createAdminClient();
  const { data: candidates, error } = await admin
    .from('ipo_ingestion_inbox')
    .select('id, canonical_name, review_status, has_conflict, promoted_ipo_id')
    .order('created_at', { ascending: false });

  console.log('Total inbox items:', candidates?.length);
  if (error) {
    console.error('Error fetching inbox:', error);
    return;
  }

  for (const c of candidates || []) {
    try {
      const eligibility = await ipoCanonicalPromotionService.validatePromotionEligibility(c.id, {
        allowPendingLotSize: true,
      });
      console.log(`[${c.review_status}] "${c.canonical_name}" (conflict: ${c.has_conflict}): eligible=${eligibility.eligible}, reasons=${eligibility.rejectionReasons.join(', ') || 'NONE'}`);
    } catch (err: any) {
      console.log(`[${c.review_status}] "${c.canonical_name}": ERROR: ${err.message}`);
    }
  }
}

check().catch(console.error);
