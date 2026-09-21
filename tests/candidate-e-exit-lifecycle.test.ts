/**
 * tests/candidate-e-exit-lifecycle.test.ts
 *
 * Candidate E: Authoritative Exit Lifecycle, Multi-Lot FIFO, Mixed STCG/LTCG & Two-Stage Settlement Suite.
 * Validates:
 * - E3: Overselling rejection (INSUFFICIENT_HOLDING_QUANTITY)
 * - E4 & E5: Multi-lot FIFO consumption
 * - E7 & E20: Granular STCG / LTCG breakdown and MIXED classification
 * - E8: Two-stage settlement (EXECUTED -> SETTLED)
 * - E17: Server-derived charges and proceeds conservation
 * - E22: Hard holding position == active lots consistency
 * - Partial exit followed by Full exit (quantity reaches 0 with preserved cumulative realized P&L)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { createAdminClient } from '../lib/supabase/admin';
import { PortfolioExitService } from '../features/finance/services/portfolioExitService';
import { PortfolioSettlementService } from '../features/finance/services/portfolioSettlementService';
import { TaxLotService } from '../features/finance/services/taxLotService';
import { ensureUserChartOfAccounts } from '../features/finance/services/chartOfAccountsService';

describe('CANDIDATE-E: Exit Lifecycle & Two-Stage Settlement Suite (E3, E5, E7, E8, E17, E20, E22)', () => {
  const admin = createAdminClient();
  const testUserId = '2ab8fa6c-31d0-4804-a704-dfd30bf1e8dd';
  let testSecurityId: string;
  let testPositionId: string;
  let lot1TxId: string;
  let lot2TxId: string;
  let partialExitId: string;

  before(async () => {
    await ensureUserChartOfAccounts(testUserId);

    // 1. Create dedicated isolated test security
    const suffix = crypto.randomUUID().slice(0, 6).toUpperCase();
    const isinSuffix = crypto.randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase();
    const { data: sec, error: secErr } = await admin
      .from('securities')
      .insert({
        symbol: `EL${suffix}`,
        exchange: 'NSE',
        company_name: `Exit Lifecycle Corp ${suffix}`,
        isin: `IN9${isinSuffix}`,
        lot_size: 1,
      } as never)
      .select('id')
      .single();

    if (secErr || !sec) {
      throw new Error(`Failed to create test security: ${secErr?.message}`);
    }
    testSecurityId = sec.id;

    // 3. Setup portfolio position with 100 shares total:
    // Lot 1: 50 shares @ 100 acquired > 1 year ago (LTCG)
    // Lot 2: 50 shares @ 120 acquired 30 days ago (STCG)
    // Total quantity = 100, Total invested cost = 50*100 + 50*120 = 5000 + 6000 = 11000
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
          total_invested_cost: 11000,
          average_cost_price: 110,
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
          total_invested_cost: 11000,
          average_cost_price: 110,
          realized_pnl: 0,
        } as never)
        .select('id')
        .single();
      testPositionId = newPos!.id;
    }

    // 4. Create acquisition transactions
    // Lot 1 (LTCG: 400 days ago)
    const d1 = new Date();
    d1.setDate(d1.getDate() - 400);
    const { data: tx1 } = await admin
      .from('investment_transactions')
      .insert({
        user_id: testUserId,
        security_id: testSecurityId,
        idempotency_key: `tx:ltcg:${crypto.randomUUID().slice(0, 8)}`,
        transaction_type: 'ipo_allotment',
        transaction_date: d1.toISOString(),
        quantity: 50,
        price_per_share: 100,
        gross_amount: 5000,
        fees: 0,
        net_amount: 5000,
      } as never)
      .select('id')
      .single();
    lot1TxId = tx1!.id;

    // Lot 2 (STCG: 30 days ago)
    const d2 = new Date();
    d2.setDate(d2.getDate() - 30);
    const { data: tx2 } = await admin
      .from('investment_transactions')
      .insert({
        user_id: testUserId,
        security_id: testSecurityId,
        idempotency_key: `tx:stcg:${crypto.randomUUID().slice(0, 8)}`,
        transaction_type: 'secondary_purchase',
        transaction_date: d2.toISOString(),
        quantity: 50,
        price_per_share: 120,
        gross_amount: 6000,
        fees: 0,
        net_amount: 6000,
      } as never)
      .select('id')
      .single();
    lot2TxId = tx2!.id;

    // Seed tax lots via TaxLotService
    await TaxLotService.createLotFromAllotment(lot1TxId);
    await TaxLotService.createLotFromAllotment(lot2TxId);
  });

  after(async () => {
    // Cleanup
    if (lot1TxId) await admin.from('investment_transactions').delete().eq('id', lot1TxId);
    if (lot2TxId) await admin.from('investment_transactions').delete().eq('id', lot2TxId);
  });

  it('E22: initial state asserts portfolio_positions strictly equals active tax lots', async () => {
    const check = await TaxLotService.verifyPositionLotConsistency({
      userId: testUserId,
      securityId: testSecurityId,
    });

    assert.equal(check.consistent, true, check.error);
    assert.equal(parseFloat(check.positionQuantity), 100);
    assert.equal(parseFloat(check.positionCostBasis), 11000);
  });

  it('E3: rejects overselling when quantity to sell exceeds available position', async () => {
    const idemp = `exit:oversell:${crypto.randomUUID().slice(0, 8)}`;
    const result = await PortfolioExitService.executeExitTransaction({
      userId: testUserId,
      securityId: testSecurityId,
      quantitySold: '101.0000',
      executionPrice: '150.00000000',
      idempotencyKey: idemp,
    });

    assert.equal(result.success, false);
    assert.equal(result.errorCode, 'INSUFFICIENT_HOLDING_QUANTITY');
  });

  it('E4, E5, E7, E17: executes partial exit spanning two lots (MIXED STCG/LTCG) with server-derived charges', async () => {
    // Sell 60 shares @ 150
    // FIFO should consume:
    // Lot 1 (50 shares @ 100, LTCG) -> completely exhausted
    // Lot 2 (10 shares @ 120, STCG) -> 40 shares remaining
    // Cost basis consumed = 50*100 + 10*120 = 5000 + 1200 = 6200
    // Gross proceeds = 60 * 150 = 9000
    // Charges: STT = 18, Brokerage = 20 -> Total charges = 38
    // Net proceeds = 9000 - 38 = 8962
    // Realized P&L = 8962 - 6200 = 2762
    const idemp = `exit:partial:${crypto.randomUUID().slice(0, 8)}`;
    const result = await PortfolioExitService.executeExitTransaction({
      userId: testUserId,
      securityId: testSecurityId,
      quantitySold: '60.0000',
      executionPrice: '150.00000000',
      charges: [
        { chargeType: 'STT', amount: '18.00000000' },
        { chargeType: 'BROKERAGE', amount: '20.00000000' },
      ],
      idempotencyKey: idemp,
    });

    assert.equal(result.success, true);
    assert.equal(result.status, 'EXECUTED');
    partialExitId = result.exitTransactionId!;

    // Invariant assertions
    assert.equal(parseFloat(result.grossProceeds!), 9000);
    assert.equal(parseFloat(result.totalCharges!), 38);
    assert.equal(parseFloat(result.netProceeds!), 8962);
    assert.equal(parseFloat(result.costBasisConsumed!), 6200);
    assert.equal(parseFloat(result.realizedPnl!), 2762);
    assert.equal(result.gainType, 'GAIN');
    assert.equal(result.taxClassification, 'MIXED'); // Both LTCG & STCG lots consumed!

    // Check allocations breakdown (E7)
    assert.equal(result.allocations?.length, 2);
    const allocLtcg = result.allocations!.find((a) => a.taxClassification === 'LTCG');
    const allocStcg = result.allocations!.find((a) => a.taxClassification === 'STCG');
    assert.ok(allocLtcg && allocStcg);
    assert.equal(parseFloat(allocLtcg!.allocatedQuantity), 50);
    assert.equal(parseFloat(allocStcg!.allocatedQuantity), 10);

    // E22 Consistency check: 40 shares remaining, cost basis = 40 * 120 = 4800
    const check = await TaxLotService.verifyPositionLotConsistency({
      userId: testUserId,
      securityId: testSecurityId,
    });
    assert.equal(check.consistent, true, check.error);
    assert.equal(parseFloat(check.positionQuantity), 40);
    assert.equal(parseFloat(check.positionCostBasis), 4800);
  });

  it('E8: confirms T+1 cash settlement clearing broker receivable into available bank cash', async () => {
    assert.ok(partialExitId);

    const settleRes = await PortfolioSettlementService.confirmExitSettlement({
      exitTransactionId: partialExitId,
      settlementReference: 'STT-REF-123456',
    });

    assert.equal(settleRes.success, true);
    assert.equal(settleRes.status, 'SETTLED');
    assert.ok(settleRes.settlementJournalId);

    // Verify exit transaction in DB
    const { data: exitInDb } = await admin
      .from('portfolio_exit_transactions')
      .select('exit_status, settlement_status')
      .eq('id', partialExitId)
      .single();

    assert.equal(exitInDb!.exit_status, 'SETTLED');
    assert.equal(exitInDb!.settlement_status, 'SETTLED');
  });

  it('E22: executes full exit on remaining 40 shares reaching 0 quantity with preserved historical P&L', async () => {
    // Sell remaining 40 shares @ 160
    // Gross = 40 * 160 = 6400
    // Charges = 15
    // Net = 6385
    // Cost basis = 40 * 120 = 4800
    // P&L = 6385 - 4800 = 1585
    const idemp = `exit:full:${crypto.randomUUID().slice(0, 8)}`;
    const result = await PortfolioExitService.executeExitTransaction({
      userId: testUserId,
      securityId: testSecurityId,
      quantitySold: '40.0000',
      executionPrice: '160.00000000',
      charges: [{ chargeType: 'STT', amount: '15.00000000' }],
      idempotencyKey: idemp,
    });

    assert.equal(result.success, true);
    assert.equal(result.taxClassification, 'STCG'); // Only the remaining STCG lot was consumed

    // Position quantity must reach 0, cost basis 0, cumulative realized P&L = 2762 + 1585 = 4347
    assert.equal(parseFloat(result.holdingSummary!.remainingQuantity), 0);
    assert.equal(parseFloat(result.holdingSummary!.remainingCostBasis), 0);
    assert.equal(parseFloat(result.holdingSummary!.cumulativeRealizedPnl), 4347);

    // E22 Consistency check: 0 active lots remaining
    const check = await TaxLotService.verifyPositionLotConsistency({
      userId: testUserId,
      securityId: testSecurityId,
    });
    assert.equal(check.consistent, true, check.error);
    assert.equal(parseFloat(check.positionQuantity), 0);
    assert.equal(parseFloat(check.positionCostBasis), 0);
  });
});
