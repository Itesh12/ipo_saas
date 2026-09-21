/**
 * tests/candidate-e-concurrency.test.ts
 *
 * Candidate E: Concurrency & Exactly-Once Mutation Suite.
 * Validates:
 * - E14: 10 concurrent identical exit requests yield exactly 1 mutation and 9 idempotent replies
 * - Concurrency race-condition protection: 2 concurrent exits exceeding available holding cannot double-spend
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { createAdminClient } from '../lib/supabase/admin';
import { PortfolioExitService } from '../features/finance/services/portfolioExitService';
import { TaxLotService } from '../features/finance/services/taxLotService';
import { ensureUserChartOfAccounts } from '../features/finance/services/chartOfAccountsService';

describe('CANDIDATE-E: Concurrency & Race Condition Suite (E14)', () => {
  const admin = createAdminClient();
  const testUserId = '2ab8fa6c-31d0-4804-a704-dfd30bf1e8dd';
  let testSecurityId: string;
  let testPositionId: string;
  let seedTxId: string;

  before(async () => {
    await ensureUserChartOfAccounts(testUserId);

    // 1. Create dedicated isolated test security
    const suffix = crypto.randomUUID().slice(0, 6).toUpperCase();
    const isinSuffix = crypto.randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase();
    const { data: sec, error: secErr } = await admin
      .from('securities')
      .insert({
        symbol: `CNC${suffix}`,
        exchange: 'NSE',
        company_name: `Concurrency Corp ${suffix}`,
        isin: `IN9${isinSuffix}`,
        lot_size: 1,
      } as never)
      .select('id')
      .single();

    if (secErr || !sec) {
      throw new Error(`Failed to create test security: ${secErr?.message}`);
    }
    testSecurityId = sec.id;

    // Reset holding to 100 shares @ 100 = 10000
    const { data: pos } = await admin
      .from('portfolio_positions')
      .select('id')
      .eq('user_id', testUserId)
      .eq('security_id', testSecurityId)
      .is('applicant_id', null)
      .maybeSingle();

    if (pos) {
      testPositionId = pos.id;
      await admin
        .from('portfolio_positions')
        .update({
          quantity: 100,
          total_invested_cost: 10000,
          average_cost_price: 100,
          realized_pnl: 0,
        } as never)
        .eq('id', pos.id);
    } else {
      const { data: newPos } = await admin
        .from('portfolio_positions')
        .insert({
          user_id: testUserId,
          security_id: testSecurityId,
          quantity: 100,
          total_invested_cost: 10000,
          average_cost_price: 100,
          realized_pnl: 0,
        } as never)
        .select('id')
        .single();
      testPositionId = newPos!.id;
    }

    // Clean previous test data in correct FK order
    await admin.from('portfolio_exit_events').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await admin.from('portfolio_exit_charges').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await admin.from('portfolio_exit_allocations').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await admin.from('portfolio_exit_transactions').delete().eq('user_id', testUserId).eq('security_id', testSecurityId);
    await admin.from('portfolio_tax_lots').delete().eq('user_id', testUserId).eq('security_id', testSecurityId);

    // Seed acquisition lot
    const { data: tx } = await admin
      .from('investment_transactions')
      .insert({
        user_id: testUserId,
        security_id: testSecurityId,
        idempotency_key: `tx:concur-seed:${crypto.randomUUID().slice(0, 8)}`,
        transaction_type: 'ipo_allotment',
        transaction_date: '2024-01-10T10:00:00Z',
        quantity: 100,
        price_per_share: 100,
        gross_amount: 10000,
        fees: 0,
        net_amount: 10000,
      } as never)
      .select('id')
      .single();

    seedTxId = tx!.id;
    await TaxLotService.createLotFromAllotment(seedTxId);
  });

  after(async () => {
    if (seedTxId) {
      await admin.from('investment_transactions').delete().eq('id', seedTxId);
    }
  });

  it('E14: 10 concurrent identical exit requests produce exactly 1 financial mutation and 9 idempotent responses', async () => {
    const identicalKey = `exit:concur-10x:${crypto.randomUUID().slice(0, 8)}`;

    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(
        PortfolioExitService.executeExitTransaction({
          userId: testUserId,
          securityId: testSecurityId,
          quantitySold: '30.0000',
          executionPrice: '150.00000000',
          idempotencyKey: identicalKey,
        })
      );
    }

    const results = await Promise.all(promises);

    // All 10 must succeed
    for (const r of results) {
      assert.equal(r.success, true);
    }

    // Exactly one has isDuplicate: undefined / false
    const firstRuns = results.filter((r) => !r.isDuplicate);
    const duplicates = results.filter((r) => r.isDuplicate);

    assert.equal(firstRuns.length, 1, 'Exactly one execution must be the primary mutation');
    assert.equal(duplicates.length, 9, 'Exactly 9 executions must be idempotent duplicate responses');

    // All 10 returned the exact same exitTransactionId
    const targetId = firstRuns[0].exitTransactionId!;
    for (const d of duplicates) {
      assert.equal(d.exitTransactionId, targetId);
    }

    // Holding must be decremented by exactly 30 shares (100 -> 70), NOT 300!
    const posCheck = await TaxLotService.verifyPositionLotConsistency({
      userId: testUserId,
      securityId: testSecurityId,
    });
    assert.equal(posCheck.consistent, true, posCheck.error);
    assert.equal(parseFloat(posCheck.positionQuantity), 70);
    assert.equal(parseFloat(posCheck.positionCostBasis), 7000);
  });

  it('E3: two concurrent conflicting exits exceeding remaining holding cannot double-spend', async () => {
    // Current holding = 70 shares.
    // Exit A wants 50 shares.
    // Exit B wants 40 shares.
    // 50 + 40 = 90 > 70!
    const keyA = `exit:race:A:${crypto.randomUUID().slice(0, 8)}`;
    const keyB = `exit:race:B:${crypto.randomUUID().slice(0, 8)}`;

    const [resA, resB] = await Promise.all([
      PortfolioExitService.executeExitTransaction({
        userId: testUserId,
        securityId: testSecurityId,
        quantitySold: '50.0000',
        executionPrice: '150.00000000',
        idempotencyKey: keyA,
      }),
      PortfolioExitService.executeExitTransaction({
        userId: testUserId,
        securityId: testSecurityId,
        quantitySold: '40.0000',
        executionPrice: '150.00000000',
        idempotencyKey: keyB,
      }),
    ]);

    // Exactly one should succeed, and one must fail
    const successes = [resA, resB].filter((r) => r.success);
    const failures = [resA, resB].filter((r) => !r.success);

    assert.equal(successes.length, 1, 'Exactly one conflicting exit must succeed');
    assert.equal(failures.length, 1, 'The competing exit exceeding available quantity must be rejected');
    assert.equal(failures[0].errorCode, 'INSUFFICIENT_HOLDING_QUANTITY');

    // Holding position must remain non-negative and consistent
    const posCheck = await TaxLotService.verifyPositionLotConsistency({
      userId: testUserId,
      securityId: testSecurityId,
    });
    assert.equal(posCheck.consistent, true, posCheck.error);
    assert.ok(parseFloat(posCheck.positionQuantity) >= 0);
  });
});
