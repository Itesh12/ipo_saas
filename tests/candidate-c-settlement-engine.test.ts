/**
 * tests/candidate-c-settlement-engine.test.ts
 *
 * Candidate C: Stage 5 Financial Settlement & Demat Accounting Workflow Engine.
 * Comprehensive Acceptance & Invariants Test Suite.
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

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { SettlementService } from '../features/finance/services/settlementService';
import { SecurityResolver } from '../features/finance/services/securityResolver';
import { DecimalPrecision } from '../features/finance/utils/decimalPrecision';
import { AllotmentVerifiedEvent, AllotmentVerifiedEventPayload } from '../features/finance/types/settlementTypes';
import { createAdminClient } from '../lib/supabase/admin';

function createMockEvent(params: {
  userId: string;
  applicationId: string;
  ipoId: string;
  allotmentId?: string;
  sharesAllotted: string;
  allotmentPrice: string;
  allotmentAmount: string;
  refundAmount: string;
  idempotencyKey?: string;
}): AllotmentVerifiedEvent {
  const allotmentId = params.allotmentId || crypto.randomUUID();
  const eventId = crypto.randomUUID();
  const idempotencyKey = params.idempotencyKey || `phase5:test:${eventId}`;

  const payload: AllotmentVerifiedEventPayload = {
    userId: params.userId,
    applicationId: params.applicationId,
    ipoId: params.ipoId,
    applicantId: null,
    allotmentId,
    sharesAllotted: params.sharesAllotted,
    allotmentPrice: params.allotmentPrice,
    allotmentAmount: params.allotmentAmount,
    refundAmount: params.refundAmount,
    evidenceClassification: 'OFFICIAL_REGISTRAR_PORTAL',
    verificationAttemptId: crypto.randomUUID(),
    rawObservationHash: crypto.randomBytes(32).toString('hex'),
    fundingOwnerType: 'user_personal',
  };

  const payloadHash = SettlementService.computePayloadHash(payload as unknown as Record<string, unknown>);

  return {
    eventId,
    eventType: 'allotment_verified',
    occurredAt: new Date().toISOString(),
    producer: 'stage4_allotment_engine',
    schemaVersion: '1.0.0',
    idempotencyKey,
    payload,
    payloadHash,
  };
}

const TEST_USER_ID = '2ab8fa6c-31d0-4804-a704-dfd30bf1e8dd';
const TEST_APPLICANT_ID = 'f0c63604-93eb-4987-8299-e321cec129dc';
const CANONICAL_IPO_ID = '2eb1c66b-b9be-4539-b927-762c8c05869f'; // Sona Selection

async function createTestApplication(params: {
  id: string;
  ipoId?: string;
  amount: number;
  blockedAmount: number;
  totalShares: number;
}) {
  const admin = createAdminClient();
  // Clear any existing active application for this test applicant/IPO
  await admin
    .from('ipo_applications')
    .delete()
    .eq('applicant_id', TEST_APPLICANT_ID)
    .eq('ipo_id', params.ipoId || CANONICAL_IPO_ID);

  const { error } = await admin.from('ipo_applications').insert({
    id: params.id,
    user_id: TEST_USER_ID,
    applicant_id: TEST_APPLICANT_ID,
    ipo_id: params.ipoId || CANONICAL_IPO_ID,
    application_number: `APP-SETTLE-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    investor_category: 'retail',
    status: 'allotment_pending',
    total_lots: Math.max(1, Math.floor(params.totalShares / 150)),
    total_quantity: params.totalShares,
    bid_price: 99,
    is_cutoff: true,
    application_amount: params.amount,
    blocked_amount: params.blockedAmount,
  } as never);

  if (error) {
    throw new Error(`Failed to create test application: ${error.message}`);
  }
}

describe('CANDIDATE-C: Settlement Engine & Demat Accounting Suite', () => {
  const admin = createAdminClient();

  // Test 1: Decimal precision
  it('enforces NUMERIC(20,8) and NUMERIC(18,4) decimal precision without float rounding errors', () => {
    const qty = '150.0000';
    const price = '99.55500000';
    const gross = DecimalPrecision.multiply(parseFloat(qty), parseFloat(price));
    assert.strictEqual(gross, 14933.25);

    const sum = DecimalPrecision.add(14933.25, 14766.75);
    assert.strictEqual(sum, 29700);
  });

  // Test 2: Payload Hash Integrity & Tamper Detection
  it('rejects tampered event payload with PAYLOAD_HASH_MISMATCH', async () => {
    const event = createMockEvent({
      userId: TEST_USER_ID,
      applicationId: crypto.randomUUID(),
      ipoId: CANONICAL_IPO_ID,
      sharesAllotted: '150.0000',
      allotmentPrice: '99.00000000',
      allotmentAmount: '14850.00000000',
      refundAmount: '0.00000000',
    });

    // Deliberately tamper with hash
    event.payloadHash = '0000000000000000000000000000000000000000000000000000000000000000';

    const result = await SettlementService.processAllotmentEvent(event);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.status, 'BLOCKED');
    assert.strictEqual(result.errorCode, 'PAYLOAD_HASH_MISMATCH');
  });

  // Test 3: Canonical 5-Step Security Resolution & Ambiguity Safety
  it('halts with NEEDS_REVIEW on AMBIGUOUS_SECURITY without mutating financial state', async () => {
    const nonExistentIpoId = crypto.randomUUID();
    const fakeAppId = crypto.randomUUID();

    try {
      await createTestApplication({
        id: fakeAppId,
        ipoId: CANONICAL_IPO_ID,
        amount: 14850,
        blockedAmount: 14850,
        totalShares: 150,
      });

      const event = createMockEvent({
        userId: TEST_USER_ID,
        applicationId: fakeAppId,
        ipoId: nonExistentIpoId,
        sharesAllotted: '150.0000',
        allotmentPrice: '99.00000000',
        allotmentAmount: '14850.00000000',
        refundAmount: '0.00000000',
      });

      const result = await SettlementService.processAllotmentEvent(event);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.status, 'NEEDS_REVIEW');
      assert.strictEqual(result.errorCode, 'AMBIGUOUS_SECURITY');

      // Verify 0 journal entries posted for this application
      const { data: journals } = await admin
        .from('journal_entries')
        .select('id')
        .eq('reference_id', fakeAppId);
      assert.strictEqual(journals?.length || 0, 0, 'Must NOT post journals on ambiguous security');
    } finally {
      // Clean up
      await admin.from('ipo_application_settlements').delete().eq('application_id', fakeAppId);
      await admin.from('ipo_applications').delete().eq('id', fakeAppId);
    }
  });

  // Test 4: Scenario A - Full Allotment Settlement & Demat Crediting
  it('processes Scenario A: Full Allotment with 100% shares credited and 0 refund', async () => {
    const testAppId = crypto.randomUUID();
    let journalId: string | undefined;
    let invTxId: string | undefined;

    try {
      await createTestApplication({
        id: testAppId,
        amount: 14850,
        blockedAmount: 14850,
        totalShares: 150,
      });

      const event = createMockEvent({
        userId: TEST_USER_ID,
        applicationId: testAppId,
        ipoId: CANONICAL_IPO_ID,
        sharesAllotted: '150.0000',
        allotmentPrice: '99.00000000',
        allotmentAmount: '14850.00000000',
        refundAmount: '0.00000000',
      });

      const result = await SettlementService.processAllotmentEvent(event);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.status, 'SETTLED');
      assert.ok(result.journalId, 'Must generate double-entry journal');
      assert.ok(result.portfolioPositionId, 'Must credit Demat portfolio position');

      journalId = result.journalId;
      invTxId = result.investmentTransactionId;

      // Verify journal line semantics: Dr 1110 (14,850), Cr 1020 (14,850)
      const { data: lines } = await admin
        .from('journal_lines')
        .select('debit, credit, account_id, financial_accounts(account_code)')
        .eq('journal_id', result.journalId);

      assert.strictEqual(lines?.length, 2, 'Full allotment must have 2 journal lines');
      const equityLine = lines?.find((l: any) => l.financial_accounts?.account_code === '1110');
      const lienLine = lines?.find((l: any) => l.financial_accounts?.account_code === '1020');

      assert.ok(equityLine && Number(equityLine.debit) === 14850, 'Dr 1110 must be 14,850');
      assert.ok(lienLine && Number(lienLine.credit) === 14850, 'Cr 1020 must be 14,850');
    } finally {
      await admin.from('ipo_application_settlements').delete().eq('application_id', testAppId);
      if (journalId) {
        await admin.from('journal_lines').delete().eq('journal_id', journalId);
        await admin.from('journal_entries').delete().eq('id', journalId);
      }
      if (invTxId) {
        await admin.from('investment_transactions').delete().eq('id', invTxId);
      }
      await admin.from('ipo_applications').delete().eq('id', testAppId);
    }
  });

  // Test 5: Scenario B - Partial Allotment with Split Equity Debit and ASBA Refund
  it('processes Scenario B: Partial Allotment with equity debit and surplus ASBA refund', async () => {
    const testAppId = crypto.randomUUID();
    let journalId: string | undefined;
    let invTxId: string | undefined;

    try {
      await createTestApplication({
        id: testAppId,
        amount: 29700,
        blockedAmount: 29700,
        totalShares: 300,
      });

      // 300 applied (29,700), but only 150 allotted (14,850), refund 14,850
      const event = createMockEvent({
        userId: TEST_USER_ID,
        applicationId: testAppId,
        ipoId: CANONICAL_IPO_ID,
        sharesAllotted: '150.0000',
        allotmentPrice: '99.00000000',
        allotmentAmount: '14850.00000000',
        refundAmount: '14850.00000000',
      });

      const result = await SettlementService.processAllotmentEvent(event);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.status, 'SETTLED_WITH_REFUND');
      assert.ok(result.journalId, 'Must generate journal for partial allotment');
      assert.ok(result.portfolioPositionId, 'Must credit portfolio for partial allotment');

      journalId = result.journalId;
      invTxId = result.investmentTransactionId;

      // Verify journal lines:
      // Leg 1: Dr 1110 (14,850), Cr 1020 (14,850)
      // Leg 2: Dr 1010 (14,850), Cr 1020 (14,850)
      const { data: lines } = await admin
        .from('journal_lines')
        .select('debit, credit, account_id, financial_accounts(account_code)')
        .eq('journal_id', result.journalId);

      assert.strictEqual(lines?.length, 4, 'Partial allotment must have 4 journal lines (2 balanced legs)');
      const equityLine = lines?.find((l: any) => l.financial_accounts?.account_code === '1110');
      const cashLine = lines?.find((l: any) => l.financial_accounts?.account_code === '1010');
      const lienLines = lines?.filter((l: any) => l.financial_accounts?.account_code === '1020');

      assert.ok(equityLine && Number(equityLine.debit) === 14850, 'Dr 1110 must be 14,850');
      assert.ok(cashLine && Number(cashLine.debit) === 14850, 'Dr 1010 must be 14,850');
      assert.strictEqual(lienLines?.length, 2, 'Cr 1020 must appear in both allotment and refund legs');
      const totalLienCredit = lienLines?.reduce((sum: number, l: any) => sum + Number(l.credit), 0);
      assert.strictEqual(totalLienCredit, 29700, 'Total Cr 1020 must be 29,700');
    } finally {
      await admin.from('ipo_application_settlements').delete().eq('application_id', testAppId);
      if (journalId) {
        await admin.from('journal_lines').delete().eq('journal_id', journalId);
        await admin.from('journal_entries').delete().eq('id', journalId);
      }
      if (invTxId) {
        await admin.from('investment_transactions').delete().eq('id', invTxId);
      }
      await admin.from('ipo_applications').delete().eq('id', testAppId);
    }
  });

  // Test 6: Scenario C - Zero Allotment Full Refund
  it('processes Scenario C: Zero Allotment with full refund and 0 equities created', async () => {
    const testAppId = crypto.randomUUID();
    let journalId: string | undefined;

    try {
      await createTestApplication({
        id: testAppId,
        amount: 14850,
        blockedAmount: 14850,
        totalShares: 150,
      });

      const event = createMockEvent({
        userId: TEST_USER_ID,
        applicationId: testAppId,
        ipoId: CANONICAL_IPO_ID,
        sharesAllotted: '0.0000',
        allotmentPrice: '99.00000000',
        allotmentAmount: '0.00000000',
        refundAmount: '14850.00000000',
      });

      const result = await SettlementService.processAllotmentEvent(event);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.status, 'REFUND_SETTLED');
      assert.strictEqual(result.portfolioPositionId, undefined, 'Zero allotment must not create Demat position');

      journalId = result.journalId;

      // Verify journal lines:
      // Dr 1010 (14,850), Cr 1020 (14,850)
      const { data: lines } = await admin
        .from('journal_lines')
        .select('debit, credit, account_id, financial_accounts(account_code)')
        .eq('journal_id', result.journalId);

      assert.strictEqual(lines?.length, 2, 'Zero allotment must have 2 journal lines');
      const cashLine = lines?.find((l: any) => l.financial_accounts?.account_code === '1010');
      const lienLine = lines?.find((l: any) => l.financial_accounts?.account_code === '1020');

      assert.ok(cashLine && Number(cashLine.debit) === 14850, 'Dr 1010 must be 14,850');
      assert.ok(lienLine && Number(lienLine.credit) === 14850, 'Cr 1020 must be 14,850');
    } finally {
      await admin.from('ipo_application_settlements').delete().eq('application_id', testAppId);
      if (journalId) {
        await admin.from('journal_lines').delete().eq('journal_id', journalId);
        await admin.from('journal_entries').delete().eq('id', journalId);
      }
      await admin.from('ipo_applications').delete().eq('id', testAppId);
    }
  });

  // Test 7: 10x Replay Idempotency
  it('guarantees exactly-once effective financial mutation under 10x replay', async () => {
    const testAppId = crypto.randomUUID();
    let journalId: string | undefined;
    let invTxId: string | undefined;

    try {
      await createTestApplication({
        id: testAppId,
        amount: 14850,
        blockedAmount: 14850,
        totalShares: 150,
      });

      const event = createMockEvent({
        userId: TEST_USER_ID,
        applicationId: testAppId,
        ipoId: CANONICAL_IPO_ID,
        sharesAllotted: '150.0000',
        allotmentPrice: '99.00000000',
        allotmentAmount: '14850.00000000',
        refundAmount: '0.00000000',
      });

      // 1st delivery
      const res1 = await SettlementService.processAllotmentEvent(event);
      assert.strictEqual(res1.success, true);
      assert.strictEqual(res1.status, 'SETTLED');
      journalId = res1.journalId;
      invTxId = res1.investmentTransactionId;

      // 9 subsequent replays
      for (let i = 2; i <= 10; i++) {
        const replayRes = await SettlementService.processAllotmentEvent(event);
        assert.strictEqual(replayRes.success, true);
        assert.strictEqual(replayRes.isDuplicate, true, `Replay ${i} must be marked isDuplicate: true`);
        assert.strictEqual(replayRes.settlementId, res1.settlementId);
      }

      // Verify exactly 1 journal entry was created across all 10 deliveries
      const { data: journals } = await admin
        .from('journal_entries')
        .select('id')
        .eq('reference_id', testAppId);
      assert.strictEqual(journals?.length, 1, 'Must have exactly 1 journal entry despite 10x replays');
    } finally {
      await admin.from('ipo_application_settlements').delete().eq('application_id', testAppId);
      if (journalId) {
        await admin.from('journal_lines').delete().eq('journal_id', journalId);
        await admin.from('journal_entries').delete().eq('id', journalId);
      }
      if (invTxId) {
        await admin.from('investment_transactions').delete().eq('id', invTxId);
      }
      await admin.from('ipo_applications').delete().eq('id', testAppId);
    }
  });

  // Test 8: Monetary Conservation Rejection
  it('rejects event violating monetary conservation with CONSERVATION_VIOLATION', async () => {
    const testAppId = crypto.randomUUID();

    try {
      await createTestApplication({
        id: testAppId,
        amount: 14850,
        blockedAmount: 14850,
        totalShares: 150,
      });

      // Event where allotted + refund (14,850 + 5,000 = 19,850) != canonical blocked amount 14,850
      const event = createMockEvent({
        userId: TEST_USER_ID,
        applicationId: testAppId,
        ipoId: CANONICAL_IPO_ID,
        sharesAllotted: '150.0000',
        allotmentPrice: '99.00000000',
        allotmentAmount: '14850.00000000',
        refundAmount: '5000.00000000', // Invalid surplus
      });

      const result = await SettlementService.processAllotmentEvent(event);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.status, 'BLOCKED');
      assert.strictEqual(result.errorCode, 'CONSERVATION_VIOLATION');
    } finally {
      await admin.from('ipo_application_settlements').delete().eq('application_id', testAppId);
      await admin.from('ipo_applications').delete().eq('id', testAppId);
    }
  });
});
