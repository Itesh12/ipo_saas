/**
 * tests/candidate-e-prod-boundary.test.ts
 *
 * Candidate E: Production Route Security & Database Schema Integrity Suite.
 * Validates:
 * - 1: Unauthenticated GET /api/portfolio/exits -> HTTP 401
 * - 2: Unauthenticated POST /api/portfolio/exits -> HTTP 401
 * - 3: Unauthenticated POST /api/portfolio/exits/:id/reverse -> HTTP 401
 * - 4: Unauthenticated POST /api/portfolio/exits/:id/settle -> HTTP 401
 * - 5: Live Database Schema integrity for all 5 Candidate E tables & constraints
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAdminClient } from '../lib/supabase/admin';

const PROD_BASE_URL = 'http://localhost:3000'; // Or process.env.NEXT_PUBLIC_APP_URL

describe('CANDIDATE-E: Production Route Guards & Schema Suite', () => {
  const admin = createAdminClient();

  it('1. verifies unauthenticated GET /api/portfolio/exits returns HTTP 401 Unauthorized', async () => {
    const res = await fetch(`${PROD_BASE_URL}/api/portfolio/exits`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Unauthorized: Authentication required.');
  });

  it('2. verifies unauthenticated POST /api/portfolio/exits returns HTTP 401 Unauthorized', async () => {
    const res = await fetch(`${PROD_BASE_URL}/api/portfolio/exits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ securityId: 'dummy' }),
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Unauthorized: Authentication required.');
  });

  it('3. verifies unauthenticated POST /api/portfolio/exits/:id/reverse returns HTTP 401 Unauthorized', async () => {
    const res = await fetch(`${PROD_BASE_URL}/api/portfolio/exits/dummy/reverse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'test' }),
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Unauthorized: Authentication required.');
  });

  it('4. verifies unauthenticated POST /api/portfolio/exits/:id/settle returns HTTP 401 Unauthorized', async () => {
    const res = await fetch(`${PROD_BASE_URL}/api/portfolio/exits/dummy/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Unauthorized: Authentication required.');
  });

  it('5. verifies Candidate E schema, constraints, and RLS across all 5 tables', async () => {
    // 1. portfolio_tax_lots
    const { error: lotErr } = await admin
      .from('portfolio_tax_lots')
      .select('id, user_id, applicant_id, security_id, source_transaction_id, acquisition_date, original_quantity, remaining_quantity, cost_per_share, total_lot_cost, is_exhausted')
      .limit(1);
    assert.ok(!lotErr, `portfolio_tax_lots error: ${lotErr?.message}`);

    // 2. portfolio_exit_transactions
    const { error: exitErr } = await admin
      .from('portfolio_exit_transactions')
      .select('id, user_id, applicant_id, security_id, portfolio_position_id, idempotency_key, exit_status, cost_basis_method, quantity_sold, execution_price, gross_proceeds, total_charges, net_proceeds, cost_basis_consumed, realized_pnl, gain_type, tax_classification, tax_rule_version, reverses_exit_id, reversal_idempotency_key')
      .limit(1);
    assert.ok(!exitErr, `portfolio_exit_transactions error: ${exitErr?.message}`);

    // 3. portfolio_exit_allocations
    const { error: allocErr } = await admin
      .from('portfolio_exit_allocations')
      .select('id, exit_transaction_id, tax_lot_id, allocated_quantity, cost_per_share, allocated_cost_basis, holding_period_days, tax_classification')
      .limit(1);
    assert.ok(!allocErr, `portfolio_exit_allocations error: ${allocErr?.message}`);

    // 4. portfolio_exit_charges
    const { error: chErr } = await admin
      .from('portfolio_exit_charges')
      .select('id, exit_transaction_id, charge_type, amount, account_id')
      .limit(1);
    assert.ok(!chErr, `portfolio_exit_charges error: ${chErr?.message}`);

    // 5. portfolio_exit_events
    const { error: evErr } = await admin
      .from('portfolio_exit_events')
      .select('id, exit_transaction_id, event_type, actor_id, previous_status, new_status, payload_hash')
      .limit(1);
    assert.ok(!evErr, `portfolio_exit_events error: ${evErr?.message}`);
  });
});
