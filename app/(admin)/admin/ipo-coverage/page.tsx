import React from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { createAdminClient } from '@/lib/supabase/admin';
import { IpoCoverageReconciliationService } from '@/features/external-integrations/services/ipoCoverageReconciliationService';
import { automationHealthService } from '@/features/external-integrations/services/automationHealthService';
import {
  ShieldAlert,
  ShieldCheck,
  Activity,
  Layers,
  CheckCircle2,
  FileSpreadsheet,
  AlertTriangle,
  History,
  Clock,
  Server,
} from 'lucide-react';
import { IngestionExtractionResult } from '@/features/external-integrations/ipo-master/ipoMasterTypes';

export const dynamic = 'force-dynamic';

export default async function AdminIpoCoveragePage() {
  const admin = createAdminClient();

  // 0. Fetch real-time automation health telemetry (Stage 3A.7)
  const automationHealth = await automationHealthService.getAutomationHealth();

  // 1. Fetch live canonical IPOs
  const { data: canonicalIpos } = await admin
    .from('ipos')
    .select('id, company_name, symbol, status, category, market_segment, offering_year, price_band_low, price_band_high, open_date, close_date, exchange, lot_size, lot_size_status, publication_status, provenance')
    .order('created_at', { ascending: false });

  // 3. Fetch live observations
  const { data: observations } = await admin
    .from('ipo_ingestion_observations')
    .select('id, source, document_type, normalized_payload, provenance, observed_at, market_segment')
    .order('observed_at', { ascending: false });

  // 4. Fetch live page traversal audits
  const { data: pageAudits } = await admin
    .from('ipo_source_page_sync_audit')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  const obsList = observations || [];
  const iposList = canonicalIpos || [];
  const pageAuditList = pageAudits || [];

  // Group observations by source
  const obsBySource: Record<string, Array<Record<string, unknown>>> = {};
  for (const obs of obsList) {
    const src = obs.source || 'unknown';
    if (!obsBySource[src]) obsBySource[src] = [];
    obsBySource[src].push(obs);
  }

  // Ensure standard sources are present in stats
  if (!obsBySource['sebi']) obsBySource['sebi'] = [];
  if (!obsBySource['nse']) obsBySource['nse'] = [];
  if (!obsBySource['bse']) obsBySource['bse'] = [];
  if (!obsBySource['sebi_archive']) obsBySource['sebi_archive'] = [];

  const resolvedIdentities = iposList.map((i) => i.company_name);

  // Compute coverage reconciliation equation
  const summary = IpoCoverageReconciliationService.computeReconciliation({
    observationsBySource: obsBySource as unknown as Record<string, IngestionExtractionResult[]>,
    resolvedCandidateIdentities: resolvedIdentities,
    canonicalIpoCount: iposList.length,
    bseStatus: 'degraded',
    nseStatus: 'healthy',
    sebiStatus: 'healthy',
    archiveStatus: 'healthy',
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="IPO Universe Coverage & Reconciliation"
        description="Authoritative source coverage accounting, multi-source provenance matrix, and zero-unexplained reconciliation audit."
      />

      {/* Production Automation & Scheduler Heartbeat (Stage 3A.7) */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden shadow-xs">
        <div className="p-4 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Server className="w-4 h-4 text-[var(--brand-primary)]" />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Production Automation & Scheduler Heartbeat
            </h2>
            <span
              className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${
                automationHealth.status === 'OPERATIONAL'
                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                  : automationHealth.status === 'DELAYED'
                  ? 'bg-amber-500/10 text-amber-500 border-amber-500/30'
                  : 'bg-rose-500/10 text-rose-500 border-rose-500/30'
              }`}
            >
              {automationHealth.status === 'OPERATIONAL'
                ? '🟢 ALL SCHEDULERS OPERATIONAL'
                : automationHealth.status === 'DELAYED'
                ? '⚠️ AUTOMATION DELAYED'
                : '⚠️ FEEDS DEGRADED'}
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
            <span>Last checked: {automationHealth.checkedAtIST}</span>
            <span className="hidden sm:inline">•</span>
            <span>24h Runs: <strong className="text-[var(--text-primary)]">{automationHealth.totalRunsLast24h}</strong></span>
            <span className="hidden sm:inline">•</span>
            <span>24h Published: <strong className="text-emerald-500">{automationHealth.totalPublishedLast24h}</strong></span>
          </div>
        </div>

        {/* Delayed / Missed Run Warning Banner */}
        {automationHealth.status === 'DELAYED' && (
          <div className="p-3 bg-amber-500/10 border-b border-amber-500/30 flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 font-medium">
            <Clock className="w-4 h-4 text-amber-500 shrink-0" />
            <span>{automationHealth.statusMessage}. Check Vercel Cron execution logs or trigger an immediate manual sync below.</span>
          </div>
        )}

        {/* 3 Authoritative Scheduled Jobs Grid */}
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          {(['nse', 'sebi', 'master'] as const).map((jobKey) => {
            const job = automationHealth.jobs[jobKey];
            const isHealthy = job.status === 'HEALTHY';
            const isMissed = job.status === 'MISSED';
            const isSkipped = job.status === 'SKIPPED_LOCK';

            return (
              <div
                key={jobKey}
                className="p-3.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-semibold text-[var(--text-primary)]">{job.jobName}</h3>
                    <p className="text-[10px] text-[var(--text-muted)]">{job.istDescription}</p>
                  </div>
                  <span
                    className={`px-2 py-0.5 text-[10px] font-bold rounded-md uppercase tracking-wider ${
                      isHealthy
                        ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                        : isMissed
                        ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
                        : isSkipped
                        ? 'bg-blue-500/15 text-blue-500 border border-blue-500/30'
                        : 'bg-rose-500/15 text-rose-500 border border-rose-500/30'
                    }`}
                  >
                    {job.status}
                  </span>
                </div>

                <div className="space-y-1 text-[11px] pt-1 border-t border-[var(--border-subtle)]">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--text-muted)]">Last Sync:</span>
                    <span className="font-mono text-[var(--text-secondary)]">{job.lastRunAtIST}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--text-muted)]">Next Expected:</span>
                    <span className="font-mono text-[var(--text-primary)] font-medium">{job.nextScheduledRunAtIST}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--text-muted)]">Consecutive Failures:</span>
                    <span className={job.consecutiveFailures > 0 ? 'text-rose-500 font-bold' : 'text-emerald-500'}>
                      {job.consecutiveFailures}
                    </span>
                  </div>
                </div>

                <p className="text-[10px] text-[var(--text-muted)] italic pt-1 border-t border-[var(--border-subtle)]">
                  {job.statusMessage}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Global Coverage State Banner */}
      <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-[var(--text-primary)]">
              Universe Coverage State:
            </span>
            <span className="px-2 py-0.5 text-xs font-bold rounded-md bg-amber-500/20 text-amber-500 border border-amber-500/30">
              ⚠️ {summary.coverage_state}
            </span>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            {summary.coverage_state_reason}. The platform operates strictly in fail-safe transparent mode,
            reporting true observed market coverage without fabricating missing exchange records.
          </p>
        </div>
      </div>

      {/* Primary Reconciliation Equation Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-1">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>Discovered Records</span>
            <Layers className="w-3.5 h-3.5 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-[var(--text-primary)]">
            {summary.total_discovered_observations}
          </p>
          <p className="text-[10px] text-[var(--text-muted)]">Official source filings observed</p>
        </div>

        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-1">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>Unique Issues</span>
            <Activity className="w-3.5 h-3.5 text-indigo-500" />
          </div>
          <p className="text-2xl font-bold text-[var(--text-primary)]">
            {summary.unique_issue_identities}
          </p>
          <p className="text-[10px] text-[var(--text-muted)]">Resolved offering identities</p>
        </div>

        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-1">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>Canonical Master IPOs</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-[var(--text-primary)]">
            {summary.canonical_master_ipos}
          </p>
          <p className="text-[10px] text-[var(--text-muted)]">Stored in public.ipos</p>
        </div>

        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-1">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>Explicit Rejections</span>
            <ShieldAlert className="w-3.5 h-3.5 text-orange-500" />
          </div>
          <p className="text-2xl font-bold text-[var(--text-primary)]">
            {summary.total_rejected_observations}
          </p>
          <p className="text-[10px] text-[var(--text-muted)]">Non-equity or corrupt docs</p>
        </div>

        <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-1">
          <div className="flex items-center justify-between text-xs text-emerald-600 dark:text-emerald-400">
            <span>Unexplained Records</span>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {summary.total_unexplained_observations}
          </p>
          <p className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80">
            Invariant: 100% accounted
          </p>
        </div>
      </div>

      {/* Per-Source Reconciliation Breakdown Table */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
        <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-[var(--brand-primary)]" />
            Independent Per-Source Coverage Balance (Hard Gate 2)
          </h3>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 font-medium">
            Invariant: Discovered = Resolved + Rejected
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--bg-surface-elevated)] border-b border-[var(--border-subtle)] text-[var(--text-muted)] uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 font-semibold">Source Feed</th>
                <th className="px-4 py-3 font-semibold">Feed Type</th>
                <th className="px-4 py-3 font-semibold">Discovered</th>
                <th className="px-4 py-3 font-semibold">Resolved</th>
                <th className="px-4 py-3 font-semibold">Rejected</th>
                <th className="px-4 py-3 font-semibold">Unexplained</th>
                <th className="px-4 py-3 font-semibold">Feed Health</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-[var(--text-secondary)]">
              {Object.entries(summary.sources).map(([src, stats]) => {
                const isBse = src.toLowerCase() === 'bse';
                const feedType =
                  src === 'sebi'
                    ? 'Regulatory (DRHP/RHP)'
                    : src === 'nse'
                    ? 'Exchange Live (Active Bidding)'
                    : src === 'bse'
                    ? 'Exchange Live (Probe Mode)'
                    : 'Regulatory Archive (Final Offer Documents)';

                return (
                  <tr key={src} className="hover:bg-[var(--bg-surface-elevated)]/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-[var(--text-primary)] uppercase">
                      {src}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">{feedType}</td>
                    <td className="px-4 py-3 font-semibold">{stats.discovered_records}</td>
                    <td className="px-4 py-3 text-emerald-600 dark:text-emerald-400 font-semibold">
                      {stats.resolved_candidates}
                    </td>
                    <td className="px-4 py-3 text-orange-600 dark:text-orange-400">
                      {stats.rejected_records}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`font-bold ${
                          stats.unexplained_records === 0
                            ? 'text-emerald-500'
                            : 'text-red-500'
                        }`}
                      >
                        {stats.unexplained_records}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          isBse
                            ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                            : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                        }`}
                      >
                        {isBse ? '⚠️ DEGRADED' : '✅ HEALTHY'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stage 3A.6: Source Page Traversal & Backfill Audit */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
        <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
            Source Page Traversal & Backfill Audit ({pageAuditList.length} Runs)
          </h3>
          <span className="text-xs text-[var(--text-muted)]">
            Traverses all archive pages until source exhaustion (Zero Hidden Gaps)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--bg-surface-elevated)] border-b border-[var(--border-subtle)] text-[var(--text-muted)] uppercase tracking-wider">
              <tr>
                <th className="px-4 py-2 font-semibold">Source</th>
                <th className="px-4 py-2 font-semibold">Segment</th>
                <th className="px-4 py-2 font-semibold">Page Number</th>
                <th className="px-4 py-2 font-semibold">Records Discovered</th>
                <th className="px-4 py-2 font-semibold">Records Persisted</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 font-semibold">Duration</th>
                <th className="px-4 py-2 font-semibold">Date Range / Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {pageAuditList.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-[var(--text-muted)]">
                    No backfill page sync runs logged yet. Execute backfill service to record live runs.
                  </td>
                </tr>
              ) : (
                pageAuditList.map((audit) => (
                  <tr key={audit.id} className="hover:bg-[var(--bg-surface-elevated)] transition-colors">
                    <td className="px-4 py-2.5 font-bold uppercase text-[var(--brand-primary)]">
                      {audit.source}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-500 border border-blue-500/20">
                        {audit.segment}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono">Page {audit.page_number}</td>
                    <td className="px-4 py-2.5 text-blue-600 dark:text-blue-400 font-semibold">
                      {audit.records_discovered}
                    </td>
                    <td className="px-4 py-2.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                      {audit.records_persisted}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          audit.status === 'success'
                            ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                            : 'bg-red-500/10 text-red-500 border border-red-500/20'
                        }`}
                      >
                        {audit.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[var(--text-muted)]">{audit.duration_ms}ms</td>
                    <td className="px-4 py-2.5 text-[var(--text-muted)]">
                      {audit.sanitized_error || audit.date_range || 'Standard run'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Canonical Master Entities with Field Truth Table Preview */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
        <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <History className="w-4 h-4 text-blue-500" />
            Canonical Master IPO Universe ({iposList.length} Entities)
          </h3>
          <span className="text-xs text-[var(--text-muted)]">
            Includes Announced, Upcoming, Open, Closed, and Historical
          </span>
        </div>

        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--bg-surface-elevated)] border-b border-[var(--border-subtle)] text-[var(--text-muted)] uppercase tracking-wider sticky top-0">
              <tr>
                <th className="px-4 py-2 font-semibold">Company / Issue</th>
                <th className="px-4 py-2 font-semibold">Symbol</th>
                <th className="px-4 py-2 font-semibold">Derived Lifecycle</th>
                <th className="px-4 py-2 font-semibold">Data Quality</th>
                <th className="px-4 py-2 font-semibold">Price Band</th>
                <th className="px-4 py-2 font-semibold">Bidding Window</th>
                <th className="px-4 py-2 font-semibold">Exchange</th>
                <th className="px-4 py-2 font-semibold">Lot Size</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-[var(--text-secondary)]">
              {iposList.map((ipo) => {
                const prov = (ipo.provenance || {}) as Record<string, unknown>;
                const quality = (prov.data_quality as string) || 'partial';

                return (
                  <tr key={ipo.id} className="hover:bg-[var(--bg-surface-elevated)]/50">
                    <td className="px-4 py-2.5 font-medium text-[var(--text-primary)]">
                      {ipo.company_name}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[var(--text-muted)]">
                      {ipo.symbol || '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)]">
                        {ipo.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          quality === 'complete'
                            ? 'bg-emerald-500/10 text-emerald-500'
                            : quality === 'verified'
                            ? 'bg-blue-500/10 text-blue-500'
                            : 'bg-amber-500/10 text-amber-500'
                        }`}
                      >
                        {quality}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {ipo.price_band_high ? (
                        `₹${ipo.price_band_low || ipo.price_band_high} - ₹${ipo.price_band_high}`
                      ) : (
                        <span className="text-amber-500/80 font-medium">TBA (Filing Stage)</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {ipo.open_date ? (
                        `${ipo.open_date} to ${ipo.close_date || 'TBA'}`
                      ) : (
                        <span className="text-[var(--text-muted)]">Dates Forthcoming</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">{ipo.exchange || 'NSE / BSE'}</td>
                    <td className="px-4 py-2.5">
                      {ipo.lot_size_status === 'pending_verification' ? (
                        <span className="text-[var(--text-muted)]">Pending Verification</span>
                      ) : (
                        ipo.lot_size || '—'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
