'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Activity, AlertTriangle, CheckCircle2, ShieldAlert, RefreshCw, Layers } from 'lucide-react';
import type { UnifiedSystemTelemetry } from '@/features/finance/types/telemetryTypes';
import type { PortfolioReconciliationStateRecord } from '@/features/finance/types/reconciliationTypes';

export function UnifiedStage5TelemetryWidget() {
  const [telemetry, setTelemetry] = useState<UnifiedSystemTelemetry | null>(null);
  const [reconStates, setReconStates] = useState<PortfolioReconciliationStateRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTelemetry = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/unified-telemetry');
      if (!res.ok) {
        throw new Error(`Failed to load telemetry (HTTP ${res.status})`);
      }
      const data = await res.json();
      if (data.success) {
        setTelemetry(data.telemetry);
        setReconStates(data.reconciliationStates || []);
      } else {
        throw new Error(data.error || 'Failed to fetch telemetry');
      }
    } catch (err: any) {
      setError(err.message || 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTelemetry();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'HEALTHY':
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      case 'DEGRADED':
        return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
      case 'CRITICAL':
        return 'text-red-400 bg-red-500/10 border-red-500/20';
      default:
        return 'text-[var(--text-muted)] bg-[var(--bg-surface-elevated)] border-[var(--border-subtle)]';
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-red-500/20 text-red-400 border border-red-500/30">CRITICAL</span>;
      case 'WARNING':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">WARNING</span>;
      case 'INFO':
        return <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">INFO</span>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Overall Platform Health Banner */}
      <Card className="border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="w-5 h-5 text-blue-400" />
              <span>Unified System Health (Stages 3A – 5)</span>
            </CardTitle>
            <CardDescription>
              Authoritative operational heartbeat, subsystem-specific SLA compliance, and non-mutating portfolio reconciliation.
            </CardDescription>
          </div>
          <button
            onClick={fetchTelemetry}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </CardHeader>

        <CardContent className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {telemetry && (
            <>
              {/* Top Banner KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] flex flex-col justify-between">
                  <span className="text-[11px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">System Status</span>
                  <div className="mt-2 flex items-center gap-2">
                    <span className={`px-2.5 py-1 text-sm font-bold rounded-full border ${getStatusColor(telemetry.overallStatus)}`}>
                      {telemetry.overallStatus}
                    </span>
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)] mt-2">Evaluated {telemetry.evaluatedAtIST}</span>
                </div>

                <div className="p-4 rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] flex flex-col justify-between">
                  <span className="text-[11px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">Platform Health Score</span>
                  <div className="mt-2 text-3xl font-extrabold font-mono text-[var(--text-primary)]">
                    {telemetry.overallHealthScore}<span className="text-sm font-normal text-[var(--text-muted)]">/100</span>
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)] mt-2">Weighted across all stages</span>
                </div>

                <div className="p-4 rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] flex flex-col justify-between">
                  <span className="text-[11px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">GL Double-Entry Integrity</span>
                  <div className="mt-2 flex items-center gap-2">
                    {telemetry.financialIntegrity.isGlBalanced ? (
                      <span className="text-emerald-400 font-bold flex items-center gap-1 text-sm">
                        <CheckCircle2 className="w-4 h-4" /> Balanced
                      </span>
                    ) : (
                      <span className="text-red-400 font-bold flex items-center gap-1 text-sm">
                        <ShieldAlert className="w-4 h-4" /> Imbalance ₹{telemetry.financialIntegrity.trialBalanceImbalance}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)] mt-2">Debits = Credits check</span>
                </div>

                <div className="p-4 rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] flex flex-col justify-between">
                  <span className="text-[11px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">Event Ledger DLQ / Failures</span>
                  <div className="mt-2 text-2xl font-bold font-mono">
                    {telemetry.financialIntegrity.unhandledFinancialFailuresCount === 0 ? (
                      <span className="text-emerald-400">0 FAILED</span>
                    ) : (
                      <span className="text-red-400">{telemetry.financialIntegrity.unhandledFinancialFailuresCount} FAILED</span>
                    )}
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)] mt-2">Dual-key idempotency ledger</span>
                </div>
              </div>

              {/* Hard Critical Alert Overrides if any */}
              {telemetry.financialIntegrity.hardCriticalTriggered && (
                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300 space-y-1">
                  <div className="font-bold flex items-center gap-2 text-red-400">
                    <ShieldAlert className="w-4 h-4" />
                    <span>HARD CRITICAL OVERRIDE ACTIVE</span>
                  </div>
                  {telemetry.financialIntegrity.hardCriticalReasons.map((reason, idx) => (
                    <div key={idx} className="ml-6 list-disc">
                      • {reason}
                    </div>
                  ))}
                </div>
              )}

              {/* 2. Subsystem SLA Compliance Grid */}
              <div className="pt-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-blue-400" />
                  <span>Subsystem SLA Freshness (Stages 3A – 5)</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {Object.values(telemetry.subsystems).map((sub) => (
                    <div
                      key={sub.subsystemId}
                      className="p-3.5 rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] flex flex-col justify-between space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-[var(--text-primary)]">{sub.subsystemName}</span>
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${getStatusColor(sub.status)}`}>
                          {sub.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2">{sub.statusMessage}</p>
                      <div className="pt-2 border-t border-[var(--border-subtle)] text-[10px] text-[var(--text-muted)] flex justify-between items-center">
                        <span className="font-mono">{sub.stage}</span>
                        <span>{sub.policy.replace(/_/g, ' ')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3. Non-Mutating Reconciliation State Table */}
              <div className="pt-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span>Portfolio Reconciliation State (Read-Only Observer)</span>
                </h4>

                {reconStates.length === 0 ? (
                  <div className="p-6 text-center text-xs text-[var(--text-muted)] bg-[var(--bg-surface-elevated)] rounded-lg border border-[var(--border-subtle)]">
                    No portfolio reconciliation discrepancies detected. All holdings match external records.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead className="bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] font-semibold border-b border-[var(--border-subtle)]">
                        <tr>
                          <th className="p-2.5">Security ID</th>
                          <th className="p-2.5">Status</th>
                          <th className="p-2.5">Severity</th>
                          <th className="p-2.5 text-right">Expected</th>
                          <th className="p-2.5 text-right">Actual</th>
                          <th className="p-2.5 text-right">Delta</th>
                          <th className="p-2.5 text-right">Last Reconciled</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-subtle)]">
                        {reconStates.map((state) => (
                          <tr key={state.id} className="hover:bg-[var(--bg-surface-elevated)] transition-colors">
                            <td className="p-2.5 font-mono text-[11px] text-[var(--text-primary)]">
                              {state.security_id.slice(0, 12)}...
                            </td>
                            <td className="p-2.5 font-semibold text-[var(--text-secondary)]">
                              {state.reconciliation_status}
                            </td>
                            <td className="p-2.5">{getSeverityBadge(state.severity)}</td>
                            <td className="p-2.5 text-right font-mono">{state.expected_quantity}</td>
                            <td className="p-2.5 text-right font-mono">{state.actual_quantity}</td>
                            <td className="p-2.5 text-right font-mono font-bold text-amber-400">
                              {state.quantity_delta > 0 ? `+${state.quantity_delta}` : state.quantity_delta}
                            </td>
                            <td className="p-2.5 text-right text-[10px] text-[var(--text-muted)]">
                              {new Date(state.last_reconciled_at).toLocaleTimeString('en-IN')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
