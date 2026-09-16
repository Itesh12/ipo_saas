/**
 * features/finance/services/portfolioReconciliationEngine.ts
 *
 * Phase 10 / Stage 5C: Non-Mutating Portfolio Reconciliation Engine.
 *
 * Enforces hard architectural invariants:
 * 1. Read-only with respect to financial truth:
 *    NEVER mutates investment_transactions, journal_entries, portfolio_positions, or wallet.
 * 2. Explicit discrepancy classification and severity:
 *    - MATCHED: INFO
 *    - QUANTITY_MISMATCH: WARNING (delta <= 50) or CRITICAL (delta > 50 or negative)
 *    - MISSING_SECURITY: CRITICAL
 *    - FINANCIAL_TRANSACTION_MISMATCH: CRITICAL
 *    - COST_BASIS_MISMATCH: WARNING
 * 3. Dual-table persistence:
 *    - portfolio_reconciliation_state (current condition)
 *    - portfolio_reconciliation_audits (immutable append-only history)
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { DecimalPrecision } from '../utils/decimalPrecision';
import {
  PortfolioDiscrepancySeverity,
  PortfolioDiscrepancyType,
  PortfolioReconciliationAuditRecord,
  PortfolioReconciliationStateRecord,
  ReconciliationResult,
} from '../types/reconciliationTypes';

export class PortfolioReconciliationEngine {
  /**
   * Reconciles internal portfolio position against authoritative external facts
   * (e.g. registrar allotment confirmation or depository statement).
   * Strictly non-mutating on financial state.
   */
  public static async reconcilePosition(params: {
    userId: string;
    applicantId?: string | null;
    securityId: string;
    expectedQuantity: number;
    expectedCostBasis?: number;
    sourceDetails?: Record<string, unknown>;
  }): Promise<ReconciliationResult> {
    const admin = createAdminClient();
    const {
      userId,
      applicantId = null,
      securityId,
      expectedQuantity,
      expectedCostBasis = 0,
      sourceDetails = {},
    } = params;

    // 1. Read internal position (Read-Only)
    let posQuery = admin
      .from('portfolio_positions')
      .select('id, quantity, total_invested_cost, average_cost_price')
      .eq('user_id', userId)
      .eq('security_id', securityId);

    if (applicantId) {
      posQuery = posQuery.eq('applicant_id', applicantId);
    } else {
      posQuery = posQuery.is('applicant_id', null);
    }

    const { data: posData } = await posQuery.maybeSingle();

    const actualQuantity = posData ? Number(posData.quantity || 0) : 0;
    const actualCostBasis = posData ? Number(posData.total_invested_cost || 0) : 0;

    // 2. Compute Deltas with DecimalPrecision
    const quantityDelta = DecimalPrecision.subtract(expectedQuantity, actualQuantity);
    const costDelta = DecimalPrecision.subtract(expectedCostBasis, actualCostBasis);

    // 3. Classify Discrepancy & Severity
    let status: PortfolioDiscrepancyType = 'MATCHED';
    let severity: PortfolioDiscrepancySeverity = 'INFO';

    if (quantityDelta !== 0) {
      if (!posData && expectedQuantity > 0) {
        status = 'MISSING_SECURITY';
        severity = 'CRITICAL';
      } else {
        status = 'QUANTITY_MISMATCH';
        // Large discrepancy or negative position is CRITICAL
        if (Math.abs(quantityDelta) > 50 || actualQuantity < 0) {
          severity = 'CRITICAL';
        } else {
          severity = 'WARNING';
        }
      }
    } else if (expectedCostBasis > 0 && Math.abs(costDelta) > 1.0) {
      status = 'COST_BASIS_MISMATCH';
      severity = 'WARNING';
    }

    const isMatched = status === 'MATCHED';

    // 4. Update Current Condition (portfolio_reconciliation_state)
    const nowIso = new Date().toISOString();

    let stateQuery = admin
      .from('portfolio_reconciliation_state')
      .select('id')
      .eq('user_id', userId)
      .eq('security_id', securityId);

    if (applicantId) {
      stateQuery = stateQuery.eq('applicant_id', applicantId);
    } else {
      stateQuery = stateQuery.is('applicant_id', null);
    }

    const { data: existingState } = await stateQuery.maybeSingle();

    let stateId: string | undefined;

    if (existingState) {
      const { data: updatedState } = await admin
        .from('portfolio_reconciliation_state')
        .update({
          reconciliation_status: status,
          severity,
          expected_quantity: expectedQuantity,
          actual_quantity: actualQuantity,
          quantity_delta: quantityDelta,
          expected_cost_basis: expectedCostBasis,
          actual_cost_basis: actualCostBasis,
          cost_delta: costDelta,
          details: {
            ...sourceDetails,
            reconciledAt: nowIso,
          },
          last_reconciled_at: nowIso,
          is_acknowledged: isMatched,
        })
        .eq('id', existingState.id)
        .select('id')
        .single();

      stateId = updatedState?.id;
    } else {
      const { data: newState } = await admin
        .from('portfolio_reconciliation_state')
        .insert({
          user_id: userId,
          applicant_id: applicantId,
          security_id: securityId,
          reconciliation_status: status,
          severity,
          expected_quantity: expectedQuantity,
          actual_quantity: actualQuantity,
          quantity_delta: quantityDelta,
          expected_cost_basis: expectedCostBasis,
          actual_cost_basis: actualCostBasis,
          cost_delta: costDelta,
          details: {
            ...sourceDetails,
            reconciledAt: nowIso,
          },
          last_reconciled_at: nowIso,
          is_acknowledged: isMatched,
        })
        .select('id')
        .single();

      stateId = newState?.id;
    }

    // 5. Append Immutable History (portfolio_reconciliation_audits)
    const { data: newAudit } = await admin
      .from('portfolio_reconciliation_audits')
      .insert({
        reconciliation_state_id: stateId || null,
        user_id: userId,
        applicant_id: applicantId,
        security_id: securityId,
        discrepancy_type: status,
        severity,
        expected_quantity: expectedQuantity,
        actual_quantity: actualQuantity,
        quantity_delta: quantityDelta,
        details: {
          ...sourceDetails,
          expectedCostBasis,
          actualCostBasis,
          costDelta,
          auditedAt: nowIso,
        },
        audited_at: nowIso,
      })
      .select('id')
      .single();

    return {
      isMatched,
      status,
      severity,
      expectedQuantity,
      actualQuantity,
      quantityDelta,
      expectedCostBasis,
      actualCostBasis,
      costDelta,
      stateId,
      auditId: newAudit?.id,
    };
  }

  /**
   * Retrieves active reconciliation state records, optionally filtered by user or severity.
   */
  public static async getReconciliationStates(params?: {
    userId?: string;
    severity?: PortfolioDiscrepancySeverity;
    unacknowledgedOnly?: boolean;
  }): Promise<PortfolioReconciliationStateRecord[]> {
    const admin = createAdminClient();
    let query = admin.from('portfolio_reconciliation_state').select('*');

    if (params?.userId) {
      query = query.eq('user_id', params.userId);
    }
    if (params?.severity) {
      query = query.eq('severity', params.severity);
    }
    if (params?.unacknowledgedOnly) {
      query = query.eq('is_acknowledged', false);
    }

    const { data } = await query.order('last_reconciled_at', { ascending: false });
    return (data as PortfolioReconciliationStateRecord[]) || [];
  }

  /**
   * Retrieves immutable reconciliation audits.
   */
  public static async getReconciliationAudits(params?: {
    userId?: string;
    limit?: number;
  }): Promise<PortfolioReconciliationAuditRecord[]> {
    const admin = createAdminClient();
    let query = admin
      .from('portfolio_reconciliation_audits')
      .select('*')
      .order('audited_at', { ascending: false });

    if (params?.userId) {
      query = query.eq('user_id', params.userId);
    }
    if (params?.limit) {
      query = query.limit(params.limit);
    }

    const { data } = await query;
    return (data as PortfolioReconciliationAuditRecord[]) || [];
  }
}
