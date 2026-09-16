/**
 * features/finance/types/telemetryTypes.ts
 *
 * Phase 10 / Stage 5D: Unified Telemetry & System Health Types.
 */

export type SubsystemHealthStatus = 'HEALTHY' | 'DEGRADED' | 'CRITICAL' | 'STANDBY';
export type SubsystemFreshnessPolicy =
  | 'cron_oriented'
  | 'filing_oriented'
  | 'bidding_window_oriented'
  | 'market_data_oriented'
  | 'event_driven'
  | 'registrar_window_oriented'
  | 'financial_event_driven';

export interface SubsystemTelemetryRecord {
  subsystemId: string;
  subsystemName: string;
  stage: string;
  policy: SubsystemFreshnessPolicy;
  status: SubsystemHealthStatus;
  statusMessage: string;
  lastActiveAt: string | null;
  slaWindowDescription: string;
  isWithinSla: boolean;
  metrics: Record<string, unknown>;
}

export interface FinancialIntegrityTelemetry {
  isGlBalanced: boolean;
  trialBalanceImbalance: number;
  totalDebits: number;
  totalCredits: number;
  unhandledFinancialFailuresCount: number;
  criticalReconciliationDiscrepanciesCount: number;
  warningReconciliationDiscrepanciesCount: number;
  hardCriticalTriggered: boolean;
  hardCriticalReasons: string[];
}

export interface UnifiedSystemTelemetry {
  overallStatus: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  overallHealthScore: number; // 0 to 100
  evaluatedAt: string;
  evaluatedAtIST: string;
  financialIntegrity: FinancialIntegrityTelemetry;
  subsystems: Record<string, SubsystemTelemetryRecord>;
  operatorAlerts: string[];
}
