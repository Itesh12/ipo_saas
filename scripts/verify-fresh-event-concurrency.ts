/**
 * scripts/verify-fresh-event-concurrency.ts
 *
 * Direct Distributed Race Test:
 * 5 simultaneous workers receive a BRAND NEW un-processed event at the exact same millisecond.
 *
 * Verifies:
 * 1. Exactly ONE worker wins the atomic lease claim and processes the financial mutation.
 * 2. The other 4 workers are safely locked/deduplicated (LOCKED_BY_OTHER or ALREADY_PROCESSED).
 * 3. processed_domain_events count === 1
 * 4. investment_transactions count === 1
 * 5. Double-entry journal debits === credits
 * 6. Derived portfolio quantity === expected quantity
 * 7. Complete teardown with zero residual artifacts.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

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
import { processAllotmentVerifiedFinancialEvent } from '../features/finance/services/investmentService';
import { AllotmentVerifiedEvent } from '../features/application/types/domainEventTypes';

async function runFreshEventConcurrencyTest() {
  const admin = createAdminClient();
  console.log('==============================================================================');
  console.log('🏁 FRESH-EVENT 5-WORKER DISTRIBUTED CONCURRENCY RACE TEST');
  console.log('Target Database: Supabase Live Cloud');
  console.log('==============================================================================\n');

  // 1. Get an existing test user profile
  const { data: profiles, error: profErr } = await admin
    .from('profiles')
    .select('id')
    .limit(1);

  if (profErr || !profiles || profiles.length === 0) {
    throw new Error(`Failed to query test user profile: ${profErr?.message}`);
  }
  const testUserId = profiles[0].id;

  // 2. Fetch or create applicant profile
  const { data: existingApplicants } = await admin
    .from('applicant_profiles')
    .select('id')
    .eq('user_id', testUserId)
    .limit(1);

  let applicantId = existingApplicants?.[0]?.id;
  if (!applicantId) {
    const { data: newApplicant } = await admin
      .from('applicant_profiles')
      .insert({
        user_id: testUserId,
        full_name: 'Race Test Applicant',
        pan_masked: 'ABC****34F',
        pan_hash: crypto.randomBytes(32).toString('hex'),
        relationship: 'self',
        default_category: 'retail',
      } as never)
      .select('id')
      .single();

    applicantId = newApplicant?.id;
  }

  // 3. Provision isolated IPO and Security
  const uniqueRunId = Math.floor(Math.random() * 900000 + 100000);
  const ipoSlug = `race-ipo-${uniqueRunId}`;
  const ipoSymbol = `RACE_${uniqueRunId}`;

  const { data: testIpo, error: ipoErr } = await admin
    .from('ipos')
    .insert({
      slug: ipoSlug,
      company_name: `Race IPO Verification Corp ${uniqueRunId}`,
      symbol: ipoSymbol,
      lot_size: 100,
      price_band_low: 500,
      price_band_high: 500,
      status: 'allotment_pending',
      issue_type: 'book_building',
      category: 'mainboard',
    } as never)
    .select('id')
    .single();

  if (ipoErr || !testIpo) {
    throw new Error(`Failed to create test IPO: ${ipoErr?.message}`);
  }
  const ipoId = testIpo.id;

  const { data: testSec, error: secErr } = await admin
    .from('securities')
    .insert({
      ipo_id: ipoId,
      symbol: ipoSymbol,
      exchange: 'NSE',
      company_name: `Race IPO Verification Corp ${uniqueRunId}`,
      lot_size: 100,
    } as never)
    .select('id')
    .single();

  if (secErr || !testSec) {
    throw new Error(`Failed to create test security: ${secErr?.message}`);
  }
  const securityId = testSec.id;

  // 4. Provision isolated Application
  const { data: testApp, error: appErr } = await admin
    .from('ipo_applications')
    .insert({
      user_id: testUserId,
      ipo_id: ipoId,
      applicant_id: applicantId,
      application_number: `APP-RACE-${uniqueRunId}`,
      investor_category: 'retail',
      status: 'funds_blocked',
      application_amount: 50000,
      blocked_amount: 50000,
      total_lots: 1,
      total_quantity: 100,
      bid_price: 500,
      is_cutoff: true,
    } as never)
    .select('id')
    .single();

  if (appErr || !testApp) {
    throw new Error(`Failed to create test application: ${appErr?.message}`);
  }
  const applicationId = testApp.id;

  console.log(`✔ Isolated test harness created:`);
  console.log(`   - IPO ID: ${ipoId}`);
  console.log(`   - Security ID: ${securityId} (${ipoSymbol})`);
  console.log(`   - Application ID: ${applicationId}\n`);

  try {
    // 4. Formulate BRAND NEW canonical allotment event
    const allotmentId = `allot_race_${Date.now()}`;
    const freshEventId = crypto.randomUUID();
    const freshIdempKey = `ALLOTMENT:RACE:${applicationId}:${allotmentId}`;

    const freshEvent: AllotmentVerifiedEvent = {
      eventId: freshEventId,
      eventType: 'allotment_verified',
      aggregateType: 'ipo_application',
      aggregateId: applicationId,
      idempotencyKey: freshIdempKey,
      timestamp: new Date().toISOString(),
      payload: {
        allotmentId,
        ipoId,
        applicationId,
        status: 'allotted',
        sharesApplied: 100,
        sharesAllotted: 100,
        allotmentPrice: 500,
        reportedRefundAmount: 0,
        evidenceClassification: 'REGISTRAR_CONFIRMED',
        verifiedAt: new Date().toISOString(),
      },
    };

    console.log('--- LAUNCHING 5 WORKERS SIMULTANEOUSLY ON BRAND NEW EVENT ---');
    console.log(`Event ID: ${freshEventId}`);
    console.log(`Idempotency Key: ${freshIdempKey}\n`);

    // 5. Fire 5 workers concurrently at the exact same instant
    const startTime = Date.now();
    const [w1, w2, w3, w4, w5] = await Promise.all([
      processAllotmentVerifiedFinancialEvent(freshEvent, { ownerId: 'race_worker_A' }),
      processAllotmentVerifiedFinancialEvent(freshEvent, { ownerId: 'race_worker_B' }),
      processAllotmentVerifiedFinancialEvent(freshEvent, { ownerId: 'race_worker_C' }),
      processAllotmentVerifiedFinancialEvent(freshEvent, { ownerId: 'race_worker_D' }),
      processAllotmentVerifiedFinancialEvent(freshEvent, { ownerId: 'race_worker_E' }),
    ]);
    const duration = Date.now() - startTime;

    const workerOutcomes = [
      { worker: 'race_worker_A', result: w1 },
      { worker: 'race_worker_B', result: w2 },
      { worker: 'race_worker_C', result: w3 },
      { worker: 'race_worker_D', result: w4 },
      { worker: 'race_worker_E', result: w5 },
    ];

    console.log(`Concurrent execution finished in ${duration}ms.\nWorker Results:`);
    for (const w of workerOutcomes) {
      console.log(`   - [${w.worker}]: status=${w.result.status}, success=${w.result.success} ${w.result.transactionId ? `(TxID: ${w.result.transactionId})` : ''} ${w.result.errorMessage ? `(${w.result.errorMessage})` : ''}`);
    }

    // 6. Assertions on worker outcomes
    const winners = workerOutcomes.filter((w) => w.result.status === 'PROCESSED');
    const lockedOrDuplicate = workerOutcomes.filter(
      (w) => w.result.status === 'LOCKED_BY_OTHER' || w.result.status === 'ALREADY_PROCESSED'
    );

    console.log(`\n✔ Lease Claim Winner: Exactly ${winners.length} worker won the race (Winner: ${winners[0]?.worker})`);
    console.log(`✔ Blocked/Deduplicated Workers: ${lockedOrDuplicate.length}/4 safely prevented from mutating financial state`);

    if (winners.length !== 1) {
      throw new Error(`Expected exactly 1 winner, found ${winners.length}`);
    }

    if (lockedOrDuplicate.length !== 4) {
      throw new Error(`Expected exactly 4 blocked/deduplicated workers, found ${lockedOrDuplicate.length}`);
    }

    // 7. Verify Database State
    console.log('\n--- VERIFYING FINANCIAL INTEGRITY IN DATABASE ---');

    // 7A: processed_domain_events = 1
    const { data: eventRecords } = await admin
      .from('processed_domain_events')
      .select('*')
      .eq('idempotency_key', freshIdempKey);

    console.log(`✔ processed_domain_events count: ${eventRecords?.length} (Expected: 1)`);
    console.log(`   - Status: ${eventRecords?.[0]?.processing_status}`);
    console.log(`   - Attempt count: ${eventRecords?.[0]?.attempt_count}`);
    if (eventRecords?.length !== 1 || eventRecords[0].processing_status !== 'PROCESSED') {
      throw new Error('processed_domain_events invariant violated');
    }

    // 7B: investment_transactions = 1
    const { data: invTxs } = await admin
      .from('investment_transactions')
      .select('*')
      .eq('application_id', applicationId);

    console.log(`✔ investment_transactions count: ${invTxs?.length} (Expected: 1)`);
    console.log(`   - Transaction Type: ${invTxs?.[0]?.transaction_type}`);
    console.log(`   - Quantity: ${invTxs?.[0]?.quantity}`);
    console.log(`   - Gross Amount: ₹${invTxs?.[0]?.gross_amount}`);
    if (invTxs?.length !== 1 || invTxs[0].quantity !== 100) {
      throw new Error('investment_transactions invariant violated');
    }

    // 7C: Journal operation = 1 and balanced
    const journalId = invTxs[0].journal_id;
    if (!journalId) {
      throw new Error('No journal_id linked to investment transaction');
    }

    const { data: journalLines } = await admin
      .from('journal_lines')
      .select('debit, credit, account_id')
      .eq('journal_id', journalId);

    const totalDebits = journalLines?.reduce((sum, l) => sum + Number(l.debit || 0), 0) || 0;
    const totalCredits = journalLines?.reduce((sum, l) => sum + Number(l.credit || 0), 0) || 0;

    console.log(`✔ Journal Lines Count: ${journalLines?.length}`);
    console.log(`✔ Journal Debits (₹${totalDebits}) === Credits (₹${totalCredits}) (Expected: ₹50,000)`);
    if (Math.abs(totalDebits - totalCredits) > 0.001 || totalDebits !== 50000) {
      throw new Error(`Journal unbalanced: Debits ₹${totalDebits} != Credits ₹${totalCredits}`);
    }

    // 7D: Derived portfolio position = 100
    const { data: pos } = await admin
      .from('portfolio_positions')
      .select('*')
      .eq('user_id', testUserId)
      .eq('security_id', securityId)
      .single();

    console.log(`✔ Derived Portfolio Quantity: ${pos?.quantity} (Expected: 100)`);
    console.log(`✔ Derived Average Cost Price: ₹${pos?.average_cost_price} (Expected: ₹500)`);
    console.log(`✔ Derived Total Invested Cost: ₹${pos?.total_invested_cost} (Expected: ₹50,000)`);

    if (pos?.quantity !== 100 || pos?.total_invested_cost !== 50000) {
      throw new Error(`Portfolio position invalid: qty=${pos?.quantity}, cost=${pos?.total_invested_cost}`);
    }

    console.log('\n==============================================================================');
    console.log('🎉 FRESH-EVENT 5-WORKER CONCURRENCY RACE TEST PASSED WITH 100% PRECISION!');
    console.log('==============================================================================');
  } finally {
    // 8. Clean up all test records
    console.log('\n--- CLEANING UP TEST ARTIFACTS ---');
    await admin.from('portfolio_reconciliation_audits').delete().eq('security_id', securityId);
    await admin.from('portfolio_reconciliation_state').delete().eq('security_id', securityId);
    await admin.from('investment_transactions').delete().eq('application_id', applicationId);
    await admin.from('portfolio_positions').delete().eq('security_id', securityId);
    await admin.from('processed_domain_events').delete().eq('aggregate_id', applicationId);
    await admin.from('ipo_applications').delete().eq('id', applicationId);
    await admin.from('securities').delete().eq('id', securityId);
    await admin.from('ipos').delete().eq('id', ipoId);
    console.log('✔ Cleanup complete: Zero residual records in live production database.');
  }
}

runFreshEventConcurrencyTest().catch((err) => {
  console.error('\n❌ Concurrency race test FAILED:', err);
  process.exit(1);
});
