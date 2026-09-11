/**
 * features/external-integrations/reconciliation/reconciliationTypes.ts
 *
 * Cross-domain reconciliation framework types.
 * Separates Execution Run ID (UUID v4) from Deterministic Run Fingerprint (HMAC/SHA-256).
 */

export type ReconciliationDomain = 'demat_accounts' | 'allotments' | 'mandates';

export interface ReconciliationRecordPair {
  entityId: string;
  internalState: Record<string, unknown>;
  externalState: Record<string, unknown>;
}

export interface DiscrepancyDetail {
  entityId: string;
  domain: ReconciliationDomain;
  discrepancyType: string;
  field: string;
  internalValue: unknown;
  externalValue: unknown;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface ReconciliationRunSummary {
  runId: string; // Unique execution run identifier (UUID v4)
  runFingerprint: string; // Deterministic hash of canonical input state
  providerId: string;
  domain: ReconciliationDomain;
  status: 'completed' | 'completed_with_discrepancies' | 'failed';
  totalRecords: number;
  matchedRecords: number;
  discrepancyCount: number;
  discrepancies: DiscrepancyDetail[];
  startedAt: string;
  completedAt: string;
}

export interface EmitPhase8WorkItemSpec {
  title: string;
  category: 'allotment_discrepancy' | 'application_anomaly' | 'finance_reconciliation';
  severity: 'critical' | 'high' | 'medium' | 'low';
  entityType: string;
  entityId: string;
  discrepancyType: string;
  metadata: Record<string, unknown>;
}
