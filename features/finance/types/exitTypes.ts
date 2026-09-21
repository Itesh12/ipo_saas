/**
 * features/finance/types/exitTypes.ts
 *
 * Candidate E: Realized P&L, Exit & Trading Lifecycle Engine Domain Types.
 * 
 * ARCHITECTURAL INVARIANTS:
 * 1. String-Decimal Arithmetic: All monetary amounts, prices, costs, and quantities are strings.
 * 2. E17: Server-derived charge aggregation and proceeds conservation.
 * 3. E18: Distinct EXECUTED vs SETTLED reversal paths.
 * 4. E19: Reversal idempotency and uniqueness constraint.
 * 5. E20: Versioned, config-driven tax rule classification.
 * 6. E22: Strict consistency between portfolio_positions and active portfolio_tax_lots.
 */

export type ExitStatus = 
  | 'DRAFT'
  | 'VALIDATING'
  | 'EXECUTED'
  | 'SETTLEMENT_PENDING'
  | 'SETTLED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'REVERSED';

export type TaxClassification = 'STCG' | 'LTCG' | 'MIXED';

export type ExecutionSource = 'MANUAL' | 'IMPORTED' | 'BROKER_FEED' | 'SYSTEM';

export type CostBasisMethod = 'FIFO' | 'WEIGHTED_AVERAGE';

export type GainType = 'GAIN' | 'LOSS' | 'BREAKEVEN';

export type ChargeType = 
  | 'STT'
  | 'BROKERAGE'
  | 'EXCHANGE_TXN_CHARGE'
  | 'GST'
  | 'SEBI_TURNOVER'
  | 'STAMP_DUTY'
  | 'OTHER';

export interface ChargeLine {
  chargeType: ChargeType | string;
  amount: string; // Decimal string >= 0
  accountId?: string | null;
  notes?: string;
}

export interface TaxLotRecord {
  id: string;
  userId: string;
  applicantId: string | null;
  securityId: string;
  sourceTransactionId: string;
  acquisitionDate: string; // ISO string
  originalQuantity: string;
  remainingQuantity: string;
  costPerShare: string;
  totalLotCost: string;
  isExhausted: boolean;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface LotAllocationItem {
  taxLotId: string;
  allocatedQuantity: string;
  costPerShare: string;
  allocatedCostBasis: string;
  holdingPeriodDays: number;
  taxClassification: 'STCG' | 'LTCG';
  taxRuleVersion: string;
}

export interface ExecuteExitInput {
  userId: string;
  applicantId?: string | null;
  securityId: string;
  quantitySold: string; // Decimal string > 0
  executionPrice: string; // Decimal string > 0
  charges?: ChargeLine[];
  executionDate?: string; // ISO string (default: now)
  settlementDate?: string | null; // ISO string (default: T+1 calculation)
  idempotencyKey: string;
  executionSource?: ExecutionSource;
  sourceRecordId?: string | null;
  sourceTimestamp?: string | null;
  metadata?: Record<string, any>;
  actorId?: string | null;
  /** Test hook for verifying E16 failure atomicity */
  _injectFailure?: 'BEFORE_EXIT_INSERT' | 'AFTER_EXIT_INSERT' | 'AFTER_CHARGES_INSERT';
}

export interface ExitExecutionResult {
  success: boolean;
  status: ExitStatus;
  exitTransactionId?: string;
  investmentTransactionId?: string | null;
  journalEntryId?: string | null;
  quantitySold?: string;
  executionPrice?: string;
  grossProceeds?: string;
  totalCharges?: string;
  netProceeds?: string;
  costBasisConsumed?: string;
  realizedPnl?: string;
  realizedPnlPct?: string;
  gainType?: GainType;
  taxClassification?: TaxClassification;
  taxRuleVersion?: string;
  allocations?: LotAllocationItem[];
  holdingSummary?: {
    remainingQuantity: string;
    remainingCostBasis: string;
    averageCostPrice: string;
    cumulativeRealizedPnl: string;
  };
  errorCode?: string;
  errorMessage?: string;
  isDuplicate?: boolean;
}

export interface ReversalInput {
  exitTransactionId: string;
  reversalIdempotencyKey: string;
  reason: string;
  actorId?: string | null;
}

export interface ReversalResult {
  success: boolean;
  reversalExitId?: string;
  compensatingJournalId?: string | null;
  restoredQuantity?: string;
  restoredCostBasis?: string;
  errorCode?: string;
  errorMessage?: string;
  isDuplicate?: boolean;
}

export interface ConfirmSettlementInput {
  exitTransactionId: string;
  settlementDate?: string; // ISO string (default: now)
  settlementReference?: string;
  actorId?: string | null;
}

export interface ConfirmSettlementResult {
  success: boolean;
  exitTransactionId: string;
  settlementJournalId?: string | null;
  status: ExitStatus;
  errorCode?: string;
  errorMessage?: string;
}
