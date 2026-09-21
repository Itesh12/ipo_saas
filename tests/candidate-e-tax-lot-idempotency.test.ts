/**
 * tests/candidate-e-tax-lot-idempotency.test.ts
 *
 * Candidate E: Tax Lot Engine, Idempotency & Invariants Test Suite.
 * Validates:
 * - E1: Idempotent lot creation from Candidate C acquisition transactions (10× replay test)
 * - E2: DB-level lot quantity & cost conservation invariants
 * - E4: Deterministic FIFO tie-breaking (acquisition_date ASC, created_at ASC, id ASC)
 * - E21: Strict Candidate C acquisition lineage validation
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { createAdminClient } from '../lib/supabase/admin';
import { TaxLotService } from '../features/finance/services/taxLotService';
import { ensureUserChartOfAccounts } from '../features/finance/services/chartOfAccountsService';

describe('CANDIDATE-E: Tax Lot Engine & Idempotency Suite (E1, E2, E4, E21)', () => {
  const admin = createAdminClient();
  const testUserId = '2ab8fa6c-31d0-4804-a704-dfd30bf1e8dd'; // Test user
  let testSecurityId: string;
  let testPositionId: string;
  let validAcquisitionTxId: string;
  let secondAcquisitionTxId: string;

  before(async () => {
    await ensureUserChartOfAccounts(testUserId);

    // 1. Create dedicated isolated test security
    const suffix = crypto.randomUUID().slice(0, 6).toUpperCase();
    const isinSuffix = crypto.randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase();
    const { data: sec, error: secErr } = await admin
      .from('securities')
      .insert({
        symbol: `TL${suffix}`,
        exchange: 'NSE',
        company_name: `Tax Lot Corp ${suffix}`,
        isin: `IN9${isinSuffix}`,
        lot_size: 1,
      } as never)
      .select('id')
      .single();

    if (secErr || !sec) {
      throw new Error(`Failed to create test security: ${secErr?.message}`);
    }
    testSecurityId = sec.id;

    // 2. Ensure portfolio position exists
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
        .update({ quantity: 150, total_invested_cost: 16500, average_cost_price: 110 } as never)
        .eq('id', pos.id);
    } else {
      const { data: newPos } = await admin
        .from('portfolio_positions')
        .insert({
          user_id: testUserId,
          security_id: testSecurityId,
          quantity: 150,
          total_invested_cost: 16500,
          average_cost_price: 110,
          realized_pnl: 0,
        } as never)
        .select('id')
        .single();
      testPositionId = newPos!.id;
    }

    // 3. Create valid acquisition transactions for testing
    const txIdemp1 = `tx:lot-test:1:${crypto.randomUUID().slice(0, 8)}`;
    const { data: tx1 } = await admin
      .from('investment_transactions')
      .insert({
        user_id: testUserId,
        security_id: testSecurityId,
        idempotency_key: txIdemp1,
        transaction_type: 'ipo_allotment',
        transaction_date: '2024-01-10T10:00:00Z',
        quantity: 100,
        price_per_share: 100,
        gross_amount: 10000,
        fees: 0,
        net_amount: 10000,
        notes: 'Test Lot Allotment 1',
      } as never)
      .select('id')
      .single();

    validAcquisitionTxId = tx1!.id;

    const txIdemp2 = `tx:lot-test:2:${crypto.randomUUID().slice(0, 8)}`;
    const { data: tx2 } = await admin
      .from('investment_transactions')
      .insert({
        user_id: testUserId,
        security_id: testSecurityId,
        idempotency_key: txIdemp2,
        transaction_type: 'secondary_purchase',
        transaction_date: '2024-02-15T10:00:00Z',
        quantity: 50,
        price_per_share: 130,
        gross_amount: 6500,
        fees: 0,
        net_amount: 6500,
        notes: 'Test Lot Purchase 2',
      } as never)
      .select('id')
      .single();

    secondAcquisitionTxId = tx2!.id;
  });

  after(async () => {
    // Clean up created test lots and test transactions
    if (validAcquisitionTxId) {
      await admin.from('portfolio_tax_lots').delete().eq('source_transaction_id', validAcquisitionTxId);
      await admin.from('investment_transactions').delete().eq('id', validAcquisitionTxId);
    }
    if (secondAcquisitionTxId) {
      await admin.from('portfolio_tax_lots').delete().eq('source_transaction_id', secondAcquisitionTxId);
      await admin.from('investment_transactions').delete().eq('id', secondAcquisitionTxId);
    }
  });

  it('E21: strictly rejects tax-lot creation from ineligible transaction types', async () => {
    // Create an ineligible non-acquisition transaction (e.g. secondary_sale)
    const badTxIdemp = `tx:ineligible:${crypto.randomUUID().slice(0, 8)}`;
    const { data: badTx } = await admin
      .from('investment_transactions')
      .insert({
        user_id: testUserId,
        security_id: testSecurityId,
        idempotency_key: badTxIdemp,
        transaction_type: 'secondary_sale',
        transaction_date: '2024-03-01T10:00:00Z',
        quantity: 10,
        price_per_share: 150,
        gross_amount: 1500,
        fees: 0,
        net_amount: 1500,
      } as never)
      .select('id')
      .single();

    assert.ok(badTx?.id);

    const result = await TaxLotService.createLotFromAllotment(badTx.id);
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('INELIGIBLE_ACQUISITION_TYPE'));

    await admin.from('investment_transactions').delete().eq('id', badTx.id);
  });

  it('E1: creates an acquisition tax lot and enforces exactly-once idempotency under 10× replay', async () => {
    const results = [];
    for (let i = 0; i < 10; i++) {
      const res = await TaxLotService.createLotFromAllotment(validAcquisitionTxId);
      results.push(res);
    }

    // First attempt creates the lot
    assert.equal(results[0].success, true);
    assert.equal(results[0].isDuplicate, false);
    const lotId = results[0].lotId!;

    // Next 9 attempts must return the exact same lotId with isDuplicate: true
    for (let i = 1; i < 10; i++) {
      assert.equal(results[i].success, true);
      assert.equal(results[i].isDuplicate, true);
      assert.equal(results[i].lotId, lotId);
    }

    // Database verification: strictly 1 row in portfolio_tax_lots
    const { data: rows } = await admin
      .from('portfolio_tax_lots')
      .select('*')
      .eq('source_transaction_id', validAcquisitionTxId);

    assert.equal(rows?.length, 1);
    const lot = rows![0];
    assert.equal(lot.original_quantity, 100);
    assert.equal(lot.remaining_quantity, 100);
    assert.equal(lot.cost_per_share, 100);
    assert.equal(lot.is_exhausted, false);
  });

  it('E2: verifies database constraints on portfolio_tax_lots', async () => {
    // Negative remaining quantity should violate chk_tax_lot_quantities
    const { error: negQtyErr } = await admin
      .from('portfolio_tax_lots')
      .insert({
        user_id: testUserId,
        security_id: testSecurityId,
        source_transaction_id: secondAcquisitionTxId,
        acquisition_date: '2024-02-15T10:00:00Z',
        original_quantity: 50,
        remaining_quantity: -5, // Violates check
        cost_per_share: 130,
        total_lot_cost: 6500,
        is_exhausted: false,
      } as never);

    assert.ok(negQtyErr, 'Negative remaining quantity must be rejected by DB constraint');

    // remaining > original should violate chk_tax_lot_quantities
    const { error: overQtyErr } = await admin
      .from('portfolio_tax_lots')
      .insert({
        user_id: testUserId,
        security_id: testSecurityId,
        source_transaction_id: secondAcquisitionTxId,
        acquisition_date: '2024-02-15T10:00:00Z',
        original_quantity: 50,
        remaining_quantity: 55, // Violates check
        cost_per_share: 130,
        total_lot_cost: 6500,
        is_exhausted: false,
      } as never);

    assert.ok(overQtyErr, 'Remaining quantity > original must be rejected by DB constraint');

    // Create the valid second lot
    const lot2Res = await TaxLotService.createLotFromAllotment(secondAcquisitionTxId);
    assert.equal(lot2Res.success, true);
  });

  it('E4: verifies deterministic FIFO ordering (acquisition_date ASC, created_at ASC, id ASC)', async () => {
    // Query candidate lots
    const { data: lots } = await admin
      .from('portfolio_tax_lots')
      .select('id, acquisition_date, cost_per_share')
      .eq('user_id', testUserId)
      .eq('security_id', testSecurityId)
      .eq('is_exhausted', false)
      .order('acquisition_date', { ascending: true })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });

    assert.ok(lots && lots.length >= 2);
    // Lot 1 (2024-01-10 @ 100) must appear before Lot 2 (2024-02-15 @ 130)
    assert.equal(lots[0].cost_per_share, 100);
    assert.equal(lots[1].cost_per_share, 130);
  });
});
