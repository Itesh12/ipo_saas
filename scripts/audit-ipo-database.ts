/**
 * scripts/audit-ipo-database.ts
 *
 * Phase 9 Stage 3A.4: Provenance-Driven Database Classification & Audit Report.
 *
 * Evaluates all records in `public.ipos` using:
 * - Source provenance & observation history
 * - IST timestamps and lifecycle status
 * - Listing confirmation
 * - Publication status
 *
 * STRICT GUARDRAIL (Correction 3):
 * Classification is 100% provenance- and metadata-driven.
 * ZERO hardcoded company name lists used for classification.
 */

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

export type IpoRecordClassification =
  | 'REAL_CURRENT'
  | 'REAL_HISTORICAL'
  | 'DEMO'
  | 'TEST'
  | 'UNKNOWN';

export interface ClassifiedIpoRecord {
  id: string;
  slug: string;
  company_name: string;
  symbol: string | null;
  status: string;
  publication_status: string;
  classification: IpoRecordClassification;
  classificationReason: string;
  open_date: string | null;
  close_date: string | null;
  listing_date: string | null;
  is_listing_confirmed: boolean;
  hasOfficialProvenance: boolean;
  provenanceSources: string[];
}

export function classifyRecord(ipo: any, todayIST: string = '2026-09-14'): {
  classification: IpoRecordClassification;
  reason: string;
} {
  const prov = (ipo.provenance || {}) as Record<string, any>;
  const provKeys = Object.keys(prov);
  const sources = new Set<string>();
  let hasOfficial = false;

  for (const k of provKeys) {
    const item = prov[k];
    if (item && item.source) sources.add(item.source);
    if (item && item.is_official) hasOfficial = true;
  }

  // 1. Check for TEST records (draft publication status or explicit test marker)
  if (ipo.publication_status === 'draft') {
    return {
      classification: 'TEST',
      reason: `Draft status (publication_status = 'draft'). Excluded from public queries.`,
    };
  }

  // 2. Check for REAL_HISTORICAL: Listed on exchange with past listing date or confirmed listing
  const isPastListing = ipo.listing_date && ipo.listing_date < todayIST;
  const isPastClose = ipo.close_date && ipo.close_date < todayIST;

  if (ipo.status === 'listed' || ipo.is_listing_confirmed || (isPastListing && isPastClose)) {
    return {
      classification: 'REAL_HISTORICAL',
      reason: `Historical completed IPO: listing_date (${ipo.listing_date || 'N/A'}) is in the past.`,
    };
  }

  // 3. Check for REAL_CURRENT: Active bidding or upcoming with valid dates
  const isBiddingActive = ipo.open_date && ipo.close_date && ipo.open_date <= todayIST && ipo.close_date >= todayIST;
  const isUpcoming = ipo.open_date && ipo.open_date > todayIST;

  if (isBiddingActive || isUpcoming || ['open', 'upcoming'].includes(ipo.status)) {
    return {
      classification: 'REAL_CURRENT',
      reason: `Active/upcoming IPO: open_date (${ipo.open_date}), close_date (${ipo.close_date}), status (${ipo.status}).`,
    };
  }

  // 4. Fallback if no matching dates or unverified
  if (provKeys.length === 0 && !ipo.published_at) {
    return {
      classification: 'DEMO',
      reason: 'No observation provenance and no publication timestamp.',
    };
  }

  return {
    classification: 'UNKNOWN',
    reason: 'Indeterminate status: does not meet current or historical criteria.',
  };
}

export async function runDatabaseAudit() {
  console.log('========================================================================');
  console.log('📊 PROVENANCE-DRIVEN DATABASE AUDIT & CLASSIFICATION (STAGE 3A.4)');
  console.log('========================================================================\n');

  const { data: ipos, count: iposCount, error } = await client
    .from('ipos')
    .select('*', { count: 'exact' });

  if (error || !ipos) {
    console.error('Failed to fetch ipos:', error);
    process.exit(1);
  }

  const { data: inbox, count: inboxCount } = await client
    .from('ipo_ingestion_inbox')
    .select('id, canonical_name, review_status, has_conflict', { count: 'exact' });

  const todayIST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  console.log(`Current IST Date: ${todayIST}`);
  console.log(`Total IPO Records in DB: ${iposCount}`);
  console.log(`Total Ingestion Inbox Candidates: ${inboxCount}\n`);

  const classified: ClassifiedIpoRecord[] = [];
  const counts: Record<IpoRecordClassification, number> = {
    REAL_CURRENT: 0,
    REAL_HISTORICAL: 0,
    DEMO: 0,
    TEST: 0,
    UNKNOWN: 0,
  };

  for (const ipo of ipos) {
    const { classification, reason } = classifyRecord(ipo, todayIST);
    counts[classification]++;

    const prov = (ipo.provenance || {}) as Record<string, any>;
    const sources = Object.values(prov).map((v: any) => v.source).filter(Boolean);

    classified.push({
      id: ipo.id,
      slug: ipo.slug,
      company_name: ipo.company_name,
      symbol: ipo.symbol,
      status: ipo.status,
      publication_status: ipo.publication_status,
      classification,
      classificationReason: reason,
      open_date: ipo.open_date,
      close_date: ipo.close_date,
      listing_date: ipo.listing_date,
      is_listing_confirmed: ipo.is_listing_confirmed,
      hasOfficialProvenance: sources.length > 0,
      provenanceSources: Array.from(new Set(sources)),
    });
  }

  console.log('--- AUDIT SUMMARY BY CLASSIFICATION ---');
  console.log(`  REAL_CURRENT:    ${counts.REAL_CURRENT}`);
  console.log(`  REAL_HISTORICAL: ${counts.REAL_HISTORICAL}`);
  console.log(`  TEST:            ${counts.TEST}`);
  console.log(`  DEMO:            ${counts.DEMO}`);
  console.log(`  UNKNOWN:         ${counts.UNKNOWN}\n`);

  console.log('--- DETAILED RECORD AUDIT ---');
  console.table(
    classified.map((r) => ({
      Company: r.company_name,
      Symbol: r.symbol,
      Status: r.status,
      PubStatus: r.publication_status,
      Classification: r.classification,
      Sources: r.provenanceSources.join(', ') || 'none',
      Dates: `${r.open_date || 'N/A'} -> ${r.close_date || 'N/A'}`,
    }))
  );

  return { classified, counts };
}

if (require.main === module) {
  runDatabaseAudit().catch(console.error);
}
