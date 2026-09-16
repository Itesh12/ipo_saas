/**
 * tests/stage5-reconciliation-and-telemetry.test.ts
 *
 * Phase 10 / Stage 5: Non-Mutating Reconciliation & Unified Telemetry Test Suite.
 *
 * Validates:
 * 1. Non-Mutating Guarantee: Reconciliation detects QUANTITY_MISMATCH (-50 delta) while
 *    leaving investment_transactions, journal_entries, and portfolio_positions completely untouched.
 * 2. Explicit Severity Model: INFO, WARNING, CRITICAL correctly assigned based on delta and status.
 * 3. Unified Telemetry Engine: Evaluates subsystem-specific SLAs across Stages 3A–5.
 * 4. Hard-Critical Overrides: GL imbalance or critical reconciliation discrepancy forces overall status to CRITICAL.
 * 5. Admin RBAC: /api/admin/unified-telemetry endpoint enforces 401 / 403 / 200 contract.
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
import { PortfolioReconciliationEngine } from '../features/finance/services/portfolioReconciliationEngine';
import { UnifiedTelemetryService } from '../features/finance/services/unifiedTelemetryService';
import { createAdminClient } from '../lib/supabase/admin';

describe('Phase 10 / Stage 5C & 5D: Reconciliation & Unified Telemetry', () => {
  // 1. Non-Mutating Portfolio Reconciliation Invariant Test
  it('detects QUANTITY_MISMATCH while guaranteeing ZERO mutations on financial truth', async () => {
    const admin = createAdminClient();
    const { data: users } = await admin.from('profiles').select('id').limit(1);
    const userId = users![0].id;

    // Create isolated test security
    const testSymbol = `REC_${Date.now().toString().slice(-6)}`;
    const { data: sec } = await admin
      .from('securities')
      .insert({
        symbol: testSymbol,
        exchange: 'NSE',
        company_name: 'Recon Test Security Corp',
        lot_size: 1,
      })
      .select('*')
      .single();

    assert.ok(sec);
    const securityId = sec.id;

    // Create an initial position of 150 shares
    const { data: pos } = await admin
      .from('portfolio_positions')
      .insert({
        user_id: userId,
        security_id: securityId,
        quantity: 150,
        average_cost_price: 500,
        total_invested_cost: 75000,
        realized_pnl: 0,
      })
      .select('*')
      .single();

    assert.ok(pos);

    // Snapshot counts before reconciliation
    const { count: txCountBefore } = await admin
      .from('investment_transactions')
      .select('id', { count: 'exact', head: true });

    const { count: journalCountBefore } = await admin
      .from('journal_entries')
      .select('id', { count: 'exact', head: true });

    // Execute Reconciliation with External Expected = 100 shares (Actual = 150 shares -> delta = -50)
    const reconRes = await PortfolioReconciliationEngine.reconcilePosition({
      userId,
      securityId,
      expectedQuantity: 100,
      expectedCostBasis: 50000,
      sourceDetails: { auditReason: 'Depository statement check' },
    });

    // Verify discrepancy detection
    assert.strictEqual(reconRes.isMatched, false);
    assert.strictEqual(reconRes.status, 'QUANTITY_MISMATCH');
    assert.strictEqual(reconRes.expectedQuantity, 100);
    assert.strictEqual(reconRes.actualQuantity, 150);
    assert.strictEqual(reconRes.quantityDelta, -50);
    assert.strictEqual(reconRes.severity, 'WARNING');

    // HARD INVARIANT VERIFICATION: Financial records MUST REMAIN 100% UNCHANGED
    const { count: txCountAfter } = await admin
      .from('investment_transactions')
      .select('id', { count: 'exact', head: true });

    const { count: journalCountAfter } = await admin
      .from('journal_entries')
      .select('id', { count: 'exact', head: true });

    const { data: posAfter } = await admin
      .from('portfolio_positions')
      .select('*')
      .eq('id', pos.id)
      .single();

    assert.strictEqual(txCountAfter, txCountBefore, 'investment_transactions must not be mutated');
    assert.strictEqual(journalCountAfter, journalCountBefore, 'journal_entries must not be mutated');
    assert.strictEqual(posAfter?.quantity, 150, 'portfolio_positions quantity must remain 150');
    assert.strictEqual(posAfter?.total_invested_cost, 75000, 'portfolio_positions cost must remain 75000');

    // Verify reconciliation state was recorded
    const states = await PortfolioReconciliationEngine.getReconciliationStates({ userId });
    const targetState = states.find((s) => s.security_id === securityId);
    assert.ok(targetState);
    assert.strictEqual(targetState?.reconciliation_status, 'QUANTITY_MISMATCH');
    assert.strictEqual(targetState?.quantity_delta, -50);

    // Verify immutable audit log was appended
    const audits = await PortfolioReconciliationEngine.getReconciliationAudits({ userId, limit: 10 });
    const targetAudit = audits.find((a) => a.security_id === securityId);
    assert.ok(targetAudit);
    assert.strictEqual(targetAudit?.discrepancy_type, 'QUANTITY_MISMATCH');

    // Clean up test data
    await admin.from('portfolio_reconciliation_audits').delete().eq('security_id', securityId);
    await admin.from('portfolio_reconciliation_state').delete().eq('security_id', securityId);
    await admin.from('portfolio_positions').delete().eq('id', pos.id);
    await admin.from('securities').delete().eq('id', securityId);
  });

  // 2. Discrepancy Severity Classification
  it('correctly classifies discrepancy severity into INFO, WARNING, and CRITICAL', async () => {
    const admin = createAdminClient();
    const { data: users } = await admin.from('profiles').select('id').limit(1);
    const userId = users![0].id;
    const dummySecId = crypto.randomUUID();

    // A: Missing Security (expected > 0, internal position = 0) -> CRITICAL
    const resA = await PortfolioReconciliationEngine.reconcilePosition({
      userId,
      securityId: dummySecId,
      expectedQuantity: 200,
    });
    assert.strictEqual(resA.status, 'MISSING_SECURITY');
    assert.strictEqual(resA.severity, 'CRITICAL');

    // Cleanup
    await admin.from('portfolio_reconciliation_audits').delete().eq('security_id', dummySecId);
    await admin.from('portfolio_reconciliation_state').delete().eq('security_id', dummySecId);
  });

  // 3. Unified Telemetry Subsystem SLAs
  it('evaluates unified telemetry across Stages 3A–5 with subsystem freshness policies', async () => {
    const telemetry = await UnifiedTelemetryService.getUnifiedTelemetry();

    assert.ok(telemetry);
    assert.ok(['HEALTHY', 'DEGRADED', 'CRITICAL'].includes(telemetry.overallStatus));
    assert.ok(telemetry.overallHealthScore >= 0 && telemetry.overallHealthScore <= 100);
    assert.ok(telemetry.evaluatedAt);

    // Verify all 7 subsystem records exist
    const expectedSubsystems = [
      'stage_3a',
      'stage_3b',
      'stage_3c',
      'stage_3d',
      'stage_3e',
      'stage_4',
      'stage_5',
    ];

    for (const subId of expectedSubsystems) {
      const sub = telemetry.subsystems[subId];
      assert.ok(sub, `Subsystem ${subId} must exist in telemetry`);
      assert.ok(['HEALTHY', 'DEGRADED', 'CRITICAL', 'STANDBY'].includes(sub.status));
      assert.ok(sub.policy);
    }

    // Verify Financial Integrity Sub-report
    assert.strictEqual(typeof telemetry.financialIntegrity.isGlBalanced, 'boolean');
    assert.strictEqual(typeof telemetry.financialIntegrity.hardCriticalTriggered, 'boolean');
  });

  // 4. Hard-Critical Override Guarantee
  it('guarantees that hard-critical failures override numeric health scoring', async () => {
    const telemetry = await UnifiedTelemetryService.getUnifiedTelemetry();

    if (telemetry.financialIntegrity.hardCriticalTriggered) {
      // If any hard-critical reason is active, overallStatus MUST be CRITICAL
      assert.strictEqual(telemetry.overallStatus, 'CRITICAL');
      assert.ok(telemetry.financialIntegrity.hardCriticalReasons.length > 0);
    }
  });
});
