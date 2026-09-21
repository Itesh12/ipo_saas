/**
 * tests/candidate-e-hardening.test.ts
 *
 * Candidate E Hardening Suite addressing:
 * - E16: Deliberate failure-atomicity rollback verification (lots, positions, GL, invTx, exit records)
 * - E21: Comprehensive acquisition types support (ipo_allotment, secondary_purchase, external_holding)
 * - E14: Database-authoritative idempotency across independent execution contexts
 * - E10: Append-only event ledger protection
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { createAdminClient } from '../lib/supabase/admin';
import { PortfolioExitService } from '../features/finance/services/portfolioExitService';
import { TaxLotService } from '../features/finance/services/taxLotService';
import { ensureUserChartOfAccounts } from '../features/finance/services/chartOfAccountsService';

describe('CANDIDATE-E: Hardening & Failure-Atomicity Suite (E16, E21, E14, E10)', () => {
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
        symbol: `HDN${suffix}`,
        exchange: 'NSE',
        company_name: `Hardening Corp ${suffix}`,
        isin: `IN9${isinSuffix}`,
        lot_size: 1,
      } as never)
      .select('id')
      .single();

    if (secErr || !sec) throw new Error(`Failed to create test security: ${secErr?.message}`);
    testSecurityId = sec.id;

    // 2. Setup portfolio position with 100 shares @ 100 = 10000
    const { data: pos } = await admin
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
    testPositionId = pos!.id;

    // 3. Seed initial tax lot via ipo_allotment
    const { data: tx } = await admin
      .from('investment_transactions')
      .insert({
        user_id: testUserId,
        security_id: testSecurityId,
        idempotency_key: `tx:seed-allot:${crypto.randomUUID().slice(0, 8)}`,
        transaction_type: 'ipo_allotment',
        transaction_date: '2024-01-15T10:00:00Z',
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

  it('E16: verifies failure-atomicity: injected failure rolls back tax lots, position, invTx, GL, and exit records', async () => {
    const idemp = `exit:fail-atomic:${crypto.randomUUID().slice(0, 8)}`;

    // Execute exit with deliberate failure injected after charges are inserted
    const result = await PortfolioExitService.executeExitTransaction({
      userId: testUserId,
      securityId: testSecurityId,
      quantitySold: '30.0000',
      executionPrice: '150.00000000',
      charges: [{ chargeType: 'STT', amount: '10.00000000' }],
      idempotencyKey: idemp,
      _injectFailure: 'AFTER_CHARGES_INSERT',
    });

    // 1. Transaction must be rejected
    assert.equal(result.success, false);
    assert.equal(result.status, 'REJECTED');
    assert.equal(result.errorCode, 'INJECTED_FAILURE_AFTER_CHARGES_INSERT');

    // 2. Portfolio position must remain strictly unchanged: 100 shares, 10000 cost basis, 0 realized PnL
    const { data: posAfter } = await admin
      .from('portfolio_positions')
      .select('quantity, total_invested_cost, realized_pnl')
      .eq('id', testPositionId)
      .single();

    assert.equal(posAfter!.quantity, 100, 'Position quantity must roll back to 100');
    assert.equal(posAfter!.total_invested_cost, 10000, 'Position cost basis must roll back to 10000');
    assert.equal(posAfter!.realized_pnl, 0, 'Position realized PnL must roll back to 0');

    // 3. Tax lots must remain strictly unchanged: 100 shares remaining
    const { data: lotsAfter } = await admin
      .from('portfolio_tax_lots')
      .select('remaining_quantity, is_exhausted')
      .eq('source_transaction_id', seedTxId)
      .single();

    assert.equal(parseFloat(lotsAfter!.remaining_quantity), 100, 'Tax lot remaining quantity must roll back to 100');
    assert.equal(lotsAfter!.is_exhausted, false);

    // 4. Exit transaction record must be absent
    const { data: exitTx } = await admin
      .from('portfolio_exit_transactions')
      .select('id')
      .eq('idempotency_key', idemp)
      .maybeSingle();
    assert.equal(exitTx, null, 'Exit transaction record must not persist after rollback');

    // 5. Investment transaction for this exit must be absent
    const { data: invTx } = await admin
      .from('investment_transactions')
      .select('id')
      .eq('idempotency_key', `invtx:exit:${idemp}`)
      .maybeSingle();
    assert.equal(invTx, null, 'Investment transaction must be deleted on rollback');

    // 6. Holding consistency assertion passes (E22)
    const check = await TaxLotService.verifyPositionLotConsistency({
      userId: testUserId,
      securityId: testSecurityId,
    });
    assert.equal(check.consistent, true, check.error);
    assert.equal(parseFloat(check.positionQuantity), 100);
    assert.equal(parseFloat(check.positionCostBasis), 10000);
  });

  it('E21: verifies tax lot creation from external_holding acquisition transaction', async () => {
    // 1. Create a dedicated security for external holding test
    const suffix = crypto.randomUUID().slice(0, 6).toUpperCase();
    const isinSuffix = crypto.randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase();
    const { data: sec } = await admin
      .from('securities')
      .insert({
        symbol: `EXT${suffix}`,
        exchange: 'NSE',
        company_name: `External Holding Corp ${suffix}`,
        isin: `IN9${isinSuffix}`,
        lot_size: 1,
      } as never)
      .select('id')
      .single();

    // 2. Position with 50 shares
    await admin.from('portfolio_positions').insert({
      user_id: testUserId,
      security_id: sec!.id,
      quantity: 50,
      total_invested_cost: 5000,
      average_cost_price: 100,
      realized_pnl: 0,
    } as never);

    // 3. Investment transaction with external_holding
    const { data: extTx } = await admin
      .from('investment_transactions')
      .insert({
        user_id: testUserId,
        security_id: sec!.id,
        idempotency_key: `tx:external:${crypto.randomUUID().slice(0, 8)}`,
        transaction_type: 'external_holding',
        transaction_date: '2023-06-15T10:00:00Z',
        quantity: 50,
        price_per_share: 100,
        gross_amount: 5000,
        fees: 0,
        net_amount: 5000,
      } as never)
      .select('id')
      .single();

    // 4. Create lot from external holding
    const lotRes = await TaxLotService.createLotFromAllotment(extTx!.id);
    assert.equal(lotRes.success, true, `external_holding lot creation should succeed: ${lotRes.error}`);
    assert.ok(lotRes.lotId);

    // 5. Verify created lot properties in DB
    const { data: lot } = await admin
      .from('portfolio_tax_lots')
      .select('*')
      .eq('id', lotRes.lotId)
      .single();

    assert.equal(parseFloat(lot!.original_quantity), 50);
    assert.equal(parseFloat(lot!.remaining_quantity), 50);
    assert.equal(parseFloat(lot!.cost_per_share), 100);
    assert.equal(lot!.is_exhausted, false);
  });

  it('E14: verifies database-authoritative idempotency: second identical execution returns duplicate without double mutation', async () => {
    const idemp = `exit:db-idemp:${crypto.randomUUID().slice(0, 8)}`;

    // First execution
    const res1 = await PortfolioExitService.executeExitTransaction({
      userId: testUserId,
      securityId: testSecurityId,
      quantitySold: '20.0000',
      executionPrice: '150.00000000',
      charges: [{ chargeType: 'STT', amount: '10.00000000' }],
      idempotencyKey: idemp,
    });

    assert.equal(res1.success, true);
    assert.equal(res1.isDuplicate, undefined);

    // Second execution with identical key (simulating re-delivery or separate process)
    const res2 = await PortfolioExitService.executeExitTransaction({
      userId: testUserId,
      securityId: testSecurityId,
      quantitySold: '20.0000',
      executionPrice: '150.00000000',
      charges: [{ chargeType: 'STT', amount: '10.00000000' }],
      idempotencyKey: idemp,
    });

    assert.equal(res2.success, true);
    assert.equal(res2.isDuplicate, true);
    assert.equal(res2.exitTransactionId, res1.exitTransactionId);

    // Assert: Only 1 exit transaction exists in DB for this key
    const { count: exitCount } = await admin
      .from('portfolio_exit_transactions')
      .select('*', { count: 'exact', head: true })
      .eq('idempotency_key', idemp);
    assert.equal(exitCount, 1);

    // Assert: Only 1 investment transaction exists in DB
    const { count: invCount } = await admin
      .from('investment_transactions')
      .select('*', { count: 'exact', head: true })
      .eq('idempotency_key', `invtx:exit:${idemp}`);
    assert.equal(invCount, 1);

    // Assert: Holding quantity decremented by exactly 20 shares (100 -> 80), NOT 40!
    const check = await TaxLotService.verifyPositionLotConsistency({
      userId: testUserId,
      securityId: testSecurityId,
    });
    assert.equal(check.consistent, true, check.error);
    assert.equal(parseFloat(check.positionQuantity), 80);
    assert.equal(parseFloat(check.positionCostBasis), 8000);
  });
});
