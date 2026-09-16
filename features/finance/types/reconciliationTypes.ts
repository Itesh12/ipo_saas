/**
 * features/finance/types/reconciliationTypes.ts
 *
 * Phase 10 / Stage 5C: Portfolio Reconciliation Types & Severities.
 */

export type PortfolioDiscrepancySeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export type PortfolioDiscrepancyType =
  | 'MATCHED'
  | 'QUANTITY_MISMATCH'
  | 'MISSING_SECURITY'
  | 'FINANCIAL_TRANSACTION_MISMATCH'
  | 'COST_BASIS_MISMATCH';

export interface PortfolioReconciliationStateRecord {
  id: string;
  user_id: string;
  applicant_id: string | null;
  security_id: string;
  reconciliation_status: PortfolioDiscrepancyType;
  severity: PortfolioDiscrepancySeverity;
  expected_quantity: number;
  actual_quantity: number;
  quantity_delta: number;
  expected_cost_basis: number;
  actual_cost_basis: number;
  cost_delta: number;
  details: Record<string, unknown>;
  last_reconciled_at: string;
  operator_notes?: string | null;
  is_acknowledged: boolean;
}

export interface PortfolioReconciliationAuditRecord {
  id: string;
  reconciliation_state_id?: string | null;
  user_id: string;
  applicant_id: string | null;
  security_id: string;
  discrepancy_type: PortfolioDiscrepancyType;
  severity: PortfolioDiscrepancySeverity;
  expected_quantity: number;
  actual_quantity: number;
  quantity_delta: number;
  details: Record<string, unknown>;
  audited_at: string;
}

export interface ReconciliationResult {
  isMatched: boolean;
  status: PortfolioDiscrepancyType;
  severity: PortfolioDiscrepancySeverity;
  expectedQuantity: number;
  actualQuantity: number;
  quantityDelta: number;
  expectedCostBasis: number;
  actualCostBasis: number;
  costDelta: number;
  stateId?: string;
  auditId?: string;
}
