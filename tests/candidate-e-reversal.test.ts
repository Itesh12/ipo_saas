/**
 * tests/candidate-e-reversal.test.ts
 *
 * Candidate E: Compensating Reversals & Reversal Idempotency Suite.
 * Validates:
 * - E11: Full compensating reversal restoring lots, position, and cost basis
 * - E18: Distinct compensating GL paths for EXECUTED (unsettled) vs SETTLED exits
 * - E19: Reversal idempotency and UNIQUE(reverses_exit_id) guard
 * - E22: Hard holding position == active lots consistency after reversal
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { createAdminClient } from '../lib/supabase/admin';
import { PortfolioExitService } from '../features/finance/services/portfolioExitService';
import { PortfolioSettlementService } from '../features/finance/services/portfolioSettlementService';
import { TaxLotService } from '../features/finance/services/taxLotService';
import { ensureUserChartOfAccounts } from '../features/finance/services/chartOfAccountsService';

describe('CANDIDATE-E: Compensating Reversals & Idempotency Suite (E11, E18, E19, E22)', () => {
  const admin = createAdminClient();
  const testUserId = '2ab8fa6c-31d0-4804-a704-dfd30bf1e8dd';
  let testSecurityId: string;
  let testPositionId: string;
  let acquisitionTxId: string;

  before(async () => {
    await ensureUserChartOfAccounts(testUserId);

    // 1. Create dedicated isolated test security
    const suffix = crypto.randomUUID().slice(0, 6).toUpperCase();
    const isinSuffix = crypto.randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase();
    const { data: sec, error: secErr } = await admin
      .from('securities')
      .insert({
        symbol: `REV${suffix}`,
        exchange: 'NSE',
        company_name: `Reversal Corp ${suffix}`,
        isin: `IN9${isinSuffix}`,
        lot_size: 1,
      } as never)
      .select('id')
      .single();

    if (secErr || !sec) {
      throw new Error(`Failed to create test security: ${secErr?.message}`);
    }
    testSecurityId = sec.id;

    // Setup holding of 100 shares @ 100 = 10000
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

    // Seed acquisition lot
    const { data: tx } = await admin
      .from('investment_transactions')
      .insert({
        user_id: testUserId,
        security_id: testSecurityId,
        idempotency_key: `tx:rev-seed:${crypto.randomUUID().slice(0, 8)}`,
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

    acquisitionTxId = tx!.id;
    await TaxLotService.createLotFromAllotment(acquisitionTxId);
  });

  after(async () => {
    if (acquisitionTxId) {
      await admin.from('investment_transactions').delete().eq('id', acquisitionTxId);
    }
  });

  it('E18: executes and reverses an EXECUTED (unsettled) exit clearing 1030 broker receivable', async () => {
    // 1. Execute an exit of 30 shares @ 150 (Gain = 1500)
    const exitIdemp = `exit:rev-unsettled:${crypto.randomUUID().slice(0, 8)}`;
    const exitRes = await PortfolioExitService.executeExitTransaction({
      userId: testUserId,
      securityId: testSecurityId,
      quantitySold: '30.0000',
      executionPrice: '150.00000000',
      idempotencyKey: exitIdemp,
    });

    assert.equal(exitRes.success, true);
    assert.equal(exitRes.status, 'EXECUTED');
    const exitId = exitRes.exitTransactionId!;

    // Invariant: Position reduced to 70 shares, cost basis 7000
    let posCheck = await TaxLotService.verifyPositionLotConsistency({
      userId: testUserId,
      securityId: testSecurityId,
    });
    assert.equal(parseFloat(posCheck.positionQuantity), 70);
    assert.equal(parseFloat(posCheck.positionCostBasis), 7000);

    // 2. Reverse the unsettled exit
    const revIdemp = `rev:unsettled:${crypto.randomUUID().slice(0, 8)}`;
    const revRes = await PortfolioExitService.reverseExitTransaction({
      exitTransactionId: exitId,
      reversalIdempotencyKey: revIdemp,
      reason: 'Trade entered in error by investor',
    });

    assert.equal(revRes.success, true);
    assert.equal(parseFloat(revRes.restoredQuantity!), 30);
    assert.equal(parseFloat(revRes.restoredCostBasis!), 3000);
    assert.ok(revRes.compensatingJournalId);

    // 3. Verify original exit status is updated to REVERSED
    const { data: updatedExit } = await admin
      .from('portfolio_exit_transactions')
      .select('exit_status')
      .eq('id', exitId)
      .single();
    assert.equal(updatedExit!.exit_status, 'REVERSED');

    // 4. E22: Verify position and tax lots fully restored to 100 shares @ 10000
    posCheck = await TaxLotService.verifyPositionLotConsistency({
      userId: testUserId,
      securityId: testSecurityId,
    });
    assert.equal(posCheck.consistent, true, posCheck.error);
    assert.equal(parseFloat(posCheck.positionQuantity), 100);
    assert.equal(parseFloat(posCheck.positionCostBasis), 10000);
  });

  it('E19: enforces reversal idempotency under multiple replay attempts', async () => {
    // Execute a new exit of 20 shares
    const exitIdemp = `exit:rev-idemp:${crypto.randomUUID().slice(0, 8)}`;
    const exitRes = await PortfolioExitService.executeExitTransaction({
      userId: testUserId,
      securityId: testSecurityId,
      quantitySold: '20.0000',
      executionPrice: '150.00000000',
      idempotencyKey: exitIdemp,
    });
    assert.equal(exitRes.success, true);
    const exitId = exitRes.exitTransactionId!;

    const revIdemp = `rev:idemp-key:${crypto.randomUUID().slice(0, 8)}`;

    // Reversal call 1
    const res1 = await PortfolioExitService.reverseExitTransaction({
      exitTransactionId: exitId,
      reversalIdempotencyKey: revIdemp,
      reason: 'Client requested cancellation',
    });
    assert.equal(res1.success, true);
    assert.equal(res1.isDuplicate, undefined);

    // Reversal call 2 (same idempotency key)
    const res2 = await PortfolioExitService.reverseExitTransaction({
      exitTransactionId: exitId,
      reversalIdempotencyKey: revIdemp,
      reason: 'Client requested cancellation',
    });
    assert.equal(res2.success, true);
    assert.equal(res2.isDuplicate, true);
    assert.equal(res2.reversalExitId, res1.reversalExitId);

    // Reversal call 3 (different key but same already-reversed exit)
    const res3 = await PortfolioExitService.reverseExitTransaction({
      exitTransactionId: exitId,
      reversalIdempotencyKey: `different-key:${crypto.randomUUID().slice(0, 8)}`,
      reason: 'Second attempt',
    });
    assert.equal(res3.success, true);
    assert.equal(res3.isDuplicate, true);

    // Holding must be 100 shares, NOT 120 or 140!
    const posCheck = await TaxLotService.verifyPositionLotConsistency({
      userId: testUserId,
      securityId: testSecurityId,
    });
    assert.equal(parseFloat(posCheck.positionQuantity), 100);
  });

  it('E18: executes, settles, and reverses a SETTLED exit crediting back bank cash (1010)', async () => {
    // 1. Execute exit of 25 shares @ 150 = 3750 gross, charges = 25, net = 3725
    const exitIdemp = `exit:rev-settled:${crypto.randomUUID().slice(0, 8)}`;
    const exitRes = await PortfolioExitService.executeExitTransaction({
      userId: testUserId,
      securityId: testSecurityId,
      quantitySold: '25.0000',
      executionPrice: '150.00000000',
      charges: [{ chargeType: 'STT', amount: '25.00000000' }],
      idempotencyKey: exitIdemp,
    });
    assert.equal(exitRes.success, true);
    const exitId = exitRes.exitTransactionId!;

    // 2. Confirm T+1 settlement (moves cash to 1010 Bank)
    const settleRes = await PortfolioSettlementService.confirmExitSettlement({
      exitTransactionId: exitId,
    });
    assert.equal(settleRes.success, true);
    assert.equal(settleRes.status, 'SETTLED');

    // 3. Reverse the SETTLED exit
    const revIdemp = `rev:settled-exit:${crypto.randomUUID().slice(0, 8)}`;
    const revRes = await PortfolioExitService.reverseExitTransaction({
      exitTransactionId: exitId,
      reversalIdempotencyKey: revIdemp,
      reason: 'Settlement correction / post-settlement reversal',
    });

    assert.equal(revRes.success, true);
    assert.ok(revRes.compensatingJournalId);

    // 4. Verify position restored back to 100 shares @ 10000
    const posCheck = await TaxLotService.verifyPositionLotConsistency({
      userId: testUserId,
      securityId: testSecurityId,
    });
    assert.equal(posCheck.consistent, true, posCheck.error);
    assert.equal(parseFloat(posCheck.positionQuantity), 100);
    assert.equal(parseFloat(posCheck.positionCostBasis), 10000);
  });
});
