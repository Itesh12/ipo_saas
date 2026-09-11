/**
 * features/external-integrations/observability/alertContracts.ts
 *
 * Alert Contracts & Threshold Definitions for Operational Monitoring.
 * Does not emit noisy alerts; defines formal thresholds and ownership.
 */

export interface AlertContract {
  alertId: string;
  name: string;
  severity: 'critical' | 'high' | 'medium';
  threshold: string;
  evaluationWindowMinutes: number;
  ownershipTeam: 'integrations_infra' | 'security_ops' | 'finance_reconciliation';
  actionableRunbook: string;
}

export const ALERT_CONTRACTS: Record<string, AlertContract> = {
  REPEATED_SIGNATURE_FAILURES: {
    alertId: 'ALT-INT-001',
    name: 'Repeated Inbound Signature Failures',
    severity: 'critical',
    threshold: '> 5 failures in 10 minutes',
    evaluationWindowMinutes: 10,
    ownershipTeam: 'security_ops',
    actionableRunbook: 'Investigate potential secret rotation mismatch or malicious webhook spoofing.',
  },
  DUPLICATE_EVENT_SPIKE: {
    alertId: 'ALT-INT-002',
    name: 'Unusual Duplicate Event Spike',
    severity: 'high',
    threshold: '> 50 duplicates in 15 minutes',
    evaluationWindowMinutes: 15,
    ownershipTeam: 'integrations_infra',
    actionableRunbook: 'Check external provider webhook delivery retry storm or consumer network timeouts.',
  },
  STALE_EVENT_ACCUMULATION: {
    alertId: 'ALT-INT-003',
    name: 'Stale External Events in Inbox',
    severity: 'high',
    threshold: '> 100 events in "received" state for > 60 minutes',
    evaluationWindowMinutes: 60,
    ownershipTeam: 'integrations_infra',
    actionableRunbook: 'Verify background processor health and database event lock performance.',
  },
  PAYLOAD_PRUNING_FAILURE: {
    alertId: 'ALT-INT-004',
    name: 'Raw Payload Retention Pruning Failure',
    severity: 'high',
    threshold: 'Last successful run > 30 hours ago or failed execution logged',
    evaluationWindowMinutes: 1440,
    ownershipTeam: 'integrations_infra',
    actionableRunbook: 'Check database pruning function execution logs and database disk capacity.',
  },
  RECONCILIATION_DISCREPANCY_SPIKE: {
    alertId: 'ALT-INT-005',
    name: 'Critical Reconciliation Discrepancy Threshold',
    severity: 'critical',
    threshold: '> 10 high/critical discrepancies in single reconciliation run',
    evaluationWindowMinutes: 30,
    ownershipTeam: 'finance_reconciliation',
    actionableRunbook: 'Trigger Phase 8 admin investigation for share allotment or depository account mismatch.',
  },
};
