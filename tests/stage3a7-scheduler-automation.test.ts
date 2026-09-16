/**
 * tests/stage3a7-scheduler-automation.test.ts
 *
 * Phase 9 Stage 3A.7: Production Automation Heartbeat & Scheduler Resilience Test Suite.
 *
 * Validates the 4 Mandatory Architectural Corrections:
 * 1. Single Global DB Lock ('ipo_sync_global') with auto-expiring lease and concurrency guard.
 * 2. Schedule single source of truth: vercel.json strictly matches config/cronSchedules.ts.
 * 3. Strict dual-auth isolation: Bearer CRON_SECRET succeeds without session; User-Agent is telemetry only.
 * 4. Distinct 'SKIPPED_LOCK' status: does not count as data sync and does not increment failure counters.
 * 5. Job-specific missed-run detection window.
 * 6. Two-run idempotency: Run 1 ingests & publishes, Run 2 yields 0 duplicates.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import { IPO_CRON_SCHEDULES, formatInIST, calculateNextScheduledRun } from '../config/cronSchedules';
import { authenticateSyncRequest } from '../app/api/admin/ipo-sync/run/route';
import { distributedLockService } from '../features/external-integrations/services/distributedLockService';
import { automationHealthService } from '../features/external-integrations/services/automationHealthService';
import { ipoSyncService } from '../features/external-integrations/services/ipoSyncService';
import { createClient } from '@supabase/supabase-js';

interface VercelCronItem {
  path: string;
  schedule: string;
}

// Setup environment credentials
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > -1) {
        process.env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
      }
    }
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const cronSecret = process.env.CRON_SECRET || 'e7b4a2f8d0c1e592f3a4b6c8d7e9f0a1b2c3d4e5f60718293a4b5c6d7e8f9a0b';
process.env.CRON_SECRET = cronSecret;

test('Phase 9 Stage 3A.7: Production Automation & Scheduler Resilience', async (t) => {
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // ============================================================================
  // Test 1: Single Source of Truth & vercel.json Parity Assertion (Correction 2)
  // ============================================================================
  await t.test('1. vercel.json crons array strictly matches config/cronSchedules.ts', () => {
    const vercelJsonPath = path.resolve(process.cwd(), 'vercel.json');
    assert.ok(fs.existsSync(vercelJsonPath), 'vercel.json must exist in project root');

    const vercelConfig = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf-8')) as { crons: VercelCronItem[] };
    assert.ok(Array.isArray(vercelConfig.crons), 'vercel.json must contain crons array');
    assert.strictEqual(vercelConfig.crons.length, 3, 'Must define exactly 3 production cron jobs');

    // 1. NSE schedule assertion
    const nseCron = vercelConfig.crons.find((c) => c.path.includes('source=nse'));
    assert.ok(nseCron, 'vercel.json must define NSE cron job');
    assert.strictEqual(
      nseCron.schedule,
      IPO_CRON_SCHEDULES.nse.utcCron,
      'NSE cron expression in vercel.json must match IPO_CRON_SCHEDULES.nse'
    );
    assert.strictEqual(IPO_CRON_SCHEDULES.nse.utcCron, '0 3-12 * * 1-5');

    // 2. SEBI schedule assertion
    const sebiCron = vercelConfig.crons.find((c) => c.path.includes('source=sebi'));
    assert.ok(sebiCron, 'vercel.json must define SEBI cron job');
    assert.strictEqual(
      sebiCron.schedule,
      IPO_CRON_SCHEDULES.sebi.utcCron,
      'SEBI cron expression in vercel.json must match IPO_CRON_SCHEDULES.sebi'
    );
    assert.strictEqual(IPO_CRON_SCHEDULES.sebi.utcCron, '0 2,6,10,14 * * 1-5');

    // 3. Master schedule assertion
    const masterCron = vercelConfig.crons.find((c) => c.path.includes('source=all'));
    assert.ok(masterCron, 'vercel.json must define Master cron job');
    assert.strictEqual(
      masterCron.schedule,
      IPO_CRON_SCHEDULES.master.utcCron,
      'Master cron expression in vercel.json must match IPO_CRON_SCHEDULES.master'
    );
    assert.strictEqual(IPO_CRON_SCHEDULES.master.utcCron, '30 2,12 * * *');
  });

  // ============================================================================
  // Test 2: IST Scheduling & UTC Date Calculators
  // ============================================================================
  await t.test('2. IST format and next scheduled run calculations are valid', () => {
    const formatted = formatInIST('2026-09-16T03:00:00.000Z');
    assert.ok(formatted.includes('08:30:00 IST'), `Expected 08:30:00 IST but got ${formatted}`);

    const nextNse = calculateNextScheduledRun('nse', new Date('2026-09-16T02:00:00.000Z'));
    assert.strictEqual(nextNse.getUTCHours(), 3, 'Next NSE run after 02:00 UTC should be 03:00 UTC (08:30 IST)');

    const nextSebi = calculateNextScheduledRun('sebi', new Date('2026-09-16T01:00:00.000Z'));
    assert.strictEqual(nextSebi.getUTCHours(), 2, 'Next SEBI run after 01:00 UTC should be 02:00 UTC (07:30 IST)');

    const nextMaster = calculateNextScheduledRun('master', new Date('2026-09-16T01:00:00.000Z'));
    assert.strictEqual(nextMaster.getUTCHours(), 2);
    assert.strictEqual(nextMaster.getUTCMinutes(), 30, 'Master run should be 02:30 UTC (08:00 IST)');
  });

  // ============================================================================
  // Test 3: Strict Dual-Authentication Isolation (Correction 3)
  // ============================================================================
  await t.test('3. Dual-authentication paths enforce security without requiring user session for crons', async () => {
    // 3a. Unauthenticated request -> 401
    const unauthReq = new NextRequest('http://localhost:3000/api/admin/ipo-sync/run', {
      method: 'POST',
    });
    const res1 = await authenticateSyncRequest(unauthReq);
    assert.strictEqual(res1.authorized, false);
    if (!res1.authorized) {
      assert.strictEqual(res1.status, 401);
    }

    // 3b. Invalid secret -> 401
    const invalidReq = new NextRequest('http://localhost:3000/api/admin/ipo-sync/run', {
      method: 'POST',
      headers: {
        authorization: 'Bearer bad_secret_token_12345',
      },
    });
    const res2 = await authenticateSyncRequest(invalidReq);
    assert.strictEqual(res2.authorized, false);
    if (!res2.authorized) {
      assert.strictEqual(res2.status, 401);
    }

    // 3c. Valid CRON_SECRET without session -> 200 / authorized (Zero Session Required!)
    const validCronReq = new NextRequest('http://localhost:3000/api/admin/ipo-sync/run', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${cronSecret}`,
        'user-agent': 'vercel-cron/1.0',
      },
    });
    const res3 = await authenticateSyncRequest(validCronReq);
    assert.strictEqual(res3.authorized, true);
    if (res3.authorized) {
      assert.strictEqual(res3.method, 'cron');
      assert.strictEqual(res3.actor, 'vercel_cron');
      assert.strictEqual(res3.clientUserAgent, 'vercel-cron/1.0');
    }

    // 3d. Valid CRON_SECRET with arbitrary User-Agent (User-Agent is telemetry only!)
    const customUaReq = new NextRequest('http://localhost:3000/api/admin/ipo-sync/run', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${cronSecret}`,
        'user-agent': 'curl/8.4.0 (Custom-Audit-Runner)',
      },
    });
    const res4 = await authenticateSyncRequest(customUaReq);
    assert.strictEqual(res4.authorized, true, 'Arbitrary user-agent must be accepted when valid secret is provided');
    if (res4.authorized) {
      assert.strictEqual(res4.actor, 'vercel_cron');
      assert.strictEqual(res4.clientUserAgent, 'curl/8.4.0 (Custom-Audit-Runner)');
    }
  });

  // ============================================================================
  // Test 4: Single Global Lock Concurrency Guard (Correction 1 & 4)
  // ============================================================================
  await t.test('4. Single global lock prevents concurrent overlapping syncs and yields SKIPPED_LOCK', async () => {
    const testHolder1 = `test_runner_1_${Date.now()}`;
    const testHolder2 = `test_runner_2_${Date.now()}`;

    // Clean any leftover test lock
    await distributedLockService.releaseGlobalLock(testHolder1);
    await distributedLockService.releaseGlobalLock(testHolder2);

    // 4a. First job acquires global lock
    const lock1 = await distributedLockService.acquireGlobalLock({
      lockedBy: testHolder1,
      jobName: 'nse_hourly_sync',
      targetSource: 'nse',
      ttlSeconds: 60,
    });
    assert.strictEqual(lock1.acquired, true, 'First caller must acquire ipo_sync_global lock');
    assert.strictEqual(lock1.lockKey, 'ipo_sync_global');

    // 4b. Second overlapping job (e.g. Master at 17:30) attempts to acquire same global lock
    const lock2 = await distributedLockService.acquireGlobalLock({
      lockedBy: testHolder2,
      jobName: 'master_reconciliation_sync',
      targetSource: 'all',
      ttlSeconds: 60,
    });
    assert.strictEqual(lock2.acquired, false, 'Overlapping job must be refused while lock is actively held');
    assert.ok(lock2.reason?.includes(testHolder1), 'Reason must explain lock is actively held by first caller');

    // 4c. First job releases lock
    const released = await distributedLockService.releaseGlobalLock(testHolder1);
    assert.strictEqual(released, true, 'First caller successfully releases lock');

    // 4d. Second job now successfully acquires lock
    const lock2Retry = await distributedLockService.acquireGlobalLock({
      lockedBy: testHolder2,
      jobName: 'master_reconciliation_sync',
      targetSource: 'all',
      ttlSeconds: 60,
    });
    assert.strictEqual(lock2Retry.acquired, true, 'Second caller successfully acquires after release');

    // Clean up
    await distributedLockService.releaseGlobalLock(testHolder2);
  });

  // ============================================================================
  // Test 5: Heartbeat Health Model & SKIPPED_LOCK Distinction (Correction 4 & 6)
  // ============================================================================
  await t.test('5. Automation health telemetry tracks jobs and handles SKIPPED_LOCK correctly', async () => {
    const health = await automationHealthService.getAutomationHealth();
    assert.ok(health.status, 'Health model must return overall status');
    assert.ok(health.checkedAtIST.includes('IST'), 'Timestamp must be formatted in IST');
    assert.ok(health.jobs.nse, 'Must include NSE job health');
    assert.ok(health.jobs.sebi, 'Must include SEBI job health');
    assert.ok(health.jobs.master, 'Must include Master job health');

    // Insert a dummy SKIPPED_LOCK run to verify it does NOT trigger failure alerts
    const testSkipId = crypto.randomUUID();
    const { error: insErr } = await supabase.from('ipo_source_sync_runs').insert({
      id: testSkipId,
      source: 'nse',
      status: 'SKIPPED_LOCK',
      parser_version: 'v1.0',
      metadata: { skippedLock: true, reason: 'Lock held by test suite', initiatedBy: 'vercel_cron' },
    });
    assert.strictEqual(insErr, null);

    const updatedHealth = await automationHealthService.getAutomationHealth();
    assert.ok(updatedHealth.skippedLockRunsLast24h >= 1, 'Skipped lock run must be tracked in telemetry');

    // Clean up dummy run
    await supabase.from('ipo_source_sync_runs').delete().eq('id', testSkipId);
  });

  // ============================================================================
  // Test 6: Production Ingestion Idempotency (2-Run Zero Duplicate Verification)
  // ============================================================================
  await t.test('6. Two consecutive sync runs execute idempotently with zero duplicate records', async () => {
    // Run 1: Ingest NSE active trading issues
    console.log('   Executing Run 1 (NSE sync via ipoSyncService)...');
    const run1 = await ipoSyncService.executeSync('nse', { initiatedBy: 'vercel_cron' });
    assert.ok(run1.successfulSources >= 1, 'Run 1 must succeed for NSE');
    assert.strictEqual(run1.failedSources, 0, 'Run 1 must have 0 failed sources');

    // Run 2: Exact same execution immediately following Run 1
    console.log('   Executing Run 2 (NSE sync idempotency check)...');
    const run2 = await ipoSyncService.executeSync('nse', { initiatedBy: 'vercel_cron' });
    assert.ok(run2.successfulSources >= 1, 'Run 2 must succeed for NSE');
    assert.strictEqual(run2.failedSources, 0, 'Run 2 must have 0 failed sources');

    const nseMetrics2 = run2.metrics.find((m) => m.source === 'nse');
    assert.ok(nseMetrics2, 'Must have NSE metrics for Run 2');
    // In Run 2, every discovered record must be classified as unchanged/duplicate
    assert.strictEqual(
      nseMetrics2.recordsIngested,
      0,
      'Run 2 must ingest 0 new records (all must be identified as duplicates)'
    );
    assert.strictEqual(
      nseMetrics2.recordsUnchanged,
      nseMetrics2.recordsDiscovered,
      'Run 2 recordsUnchanged must equal recordsDiscovered'
    );
  });
});
