/**
 * features/finance/types/settlementTypes.ts
 *
 * Candidate C: Stage 5 Financial Settlement & Demat Accounting Workflow Engine.
 * Canonical Types & Contract Specifications.
 *
 * Strictly enforces:
 * - Decimal-safe string representation at event boundary
 * - Authoritative settlement state machine
 * - Zero dependency on Stage 4 internal services or tables
 */

export type SettlementStatus =
  | 'RECEIVED'
  | 'VALIDATING'
  | 'SECURITY_RESOLVED'
  | 'SETTLEMENT_READY'
  | 'SETTLED'
  | 'SETTLED_WITH_REFUND'
  | 'REFUND_SETTLED'
  | 'BLOCKED'
  | 'NEEDS_REVIEW';

/**
 * Decimal-safe Canonical Allotment Verified Event Payload
 */
export interface AllotmentVerifiedEventPayload {
  userId: string;
  applicationId: string;
  ipoId: string;
  applicantId: string | null;
  allotmentId: string;
  sharesAllotted: string;       // Decimal string e.g. "150.0000" (NUMERIC 18,4)
  allotmentPrice: string;       // Decimal string e.g. "99.00000000" (NUMERIC 20,8)
  allotmentAmount: string;      // Decimal string e.g. "14850.00000000" (NUMERIC 20,8)
  refundAmount: string;         // Decimal string e.g. "14850.00000000" (NUMERIC 20,8)
  evidenceClassification: string;
  verificationAttemptId: string;
  rawObservationHash: string;
  fundingOwnerType: 'user_personal' | 'external_tracked';
}

/**
 * Canonical Allotment Verified Event Contract
 */
export interface AllotmentVerifiedEvent {
  eventId: string;
  eventType: 'allotment_verified';
  occurredAt: string;
  producer: 'stage4_allotment_engine';
  schemaVersion: '1.0.0';
  idempotencyKey: string;
  payload: AllotmentVerifiedEventPayload;
  payloadHash: string;
}

/**
 * Dedicated Settlement Ledger Record (ipo_application_settlements)
 */
export interface SettlementRecord {
  id: string;
  application_id: string;
  user_id: string;
  applicant_id: string | null;
  
  event_id: string;
  allotment_id: string;
  idempotency_key: string;
  
  settlement_status: SettlementStatus;
  
  shares_applied: number;
  shares_allotted: number;
  allotment_price: number;
  allotted_value: number;
  refund_value: number;
  applicable_blocked_amount: number;
  
  security_id: string | null;
  journal_entry_id: string | null;
  portfolio_position_id: string | null;
  investment_transaction_id: string | null;
  
  failure_code: string | null;
  failure_reason: string | null;
  metadata: Record<string, unknown>;
  
  processed_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Settlement Engine Execution Result
 */
export interface SettlementProcessingResult {
  success: boolean;
  status: SettlementStatus;
  settlementId?: string;
  journalId?: string;
  portfolioPositionId?: string;
  investmentTransactionId?: string;
  errorCode?: string;
  errorMessage?: string;
  isDuplicate?: boolean;
}
