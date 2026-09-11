"use client";

import React, { useState } from "react";
import { AuditLogRow } from "../../types/audit.types";
import { AuditDiffViewer } from "./AuditDiffViewer";
import { Button } from "@/components/ui/Button";
import {
  Search,
  Filter,
  Eye,
  X,
  ShieldCheck,
  User,
  Server,
  Clock,
} from "lucide-react";

interface AuditLogTableProps {
  initialLogs: AuditLogRow[];
  total: number;
}

export function AuditLogTable({ initialLogs }: AuditLogTableProps) {
  const [logs] = useState<AuditLogRow[]>(initialLogs);
  const [search, setSearch] = useState("");
  const [resourceFilter, setResourceFilter] = useState("all");
  const [activeDiffLog, setActiveDiffLog] = useState<AuditLogRow | null>(null);

  const resourceTypes = Array.from(new Set(logs.map((l) => l.resource_type)));

  const filtered = logs.filter((log) => {
    if (resourceFilter !== "all" && log.resource_type !== resourceFilter) return false;
    if (search) {
      const term = search.toLowerCase();
      const matchAction = log.action.toLowerCase().includes(term);
      const matchRes = log.resource_type.toLowerCase().includes(term);
      const matchId = log.resource_id?.toLowerCase().includes(term);
      const matchEmail = log.actor_profile?.email?.toLowerCase().includes(term);
      if (!matchAction && !matchRes && !matchId && !matchEmail) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search audit trail by action, resource, or actor email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-xs pl-9 pr-3 py-2 rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-primary)]"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          <select
            value={resourceFilter}
            onChange={(e) => setResourceFilter(e.target.value)}
            className="text-xs py-1.5 px-2.5 rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
          >
            <option value="all">All Resources</option>
            {resourceTypes.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/50 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Actor</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Resource & ID</th>
                <th className="py-3 px-4">IP / Client</th>
                <th className="py-3 px-4 text-right">Inspection</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[var(--text-muted)]">
                    No governance audit log entries found.
                  </td>
                </tr>
              ) : (
                filtered.map((log) => (
                  <tr key={log.id} className="hover:bg-[var(--bg-surface-elevated)]/40 transition-colors">
                    <td className="py-3.5 px-4 whitespace-nowrap text-[11px] text-[var(--text-muted)]">
                      <div className="flex items-center gap-1 font-mono">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{new Date(log.created_at).toLocaleString("en-IN")}</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {log.actor_type === "system" || !log.actor_id ? (
                        <div className="flex items-center gap-1.5 text-blue-400 text-[11px] font-medium">
                          <Server className="w-3.5 h-3.5" />
                          <span>System Service</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-[var(--text-primary)] text-[11px]">
                          <User className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                          <span className="font-medium">
                            {log.actor_profile?.full_name || log.actor_profile?.email || log.actor_id.slice(0, 8)}
                          </span>
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className="font-mono font-semibold text-[11px] px-2 py-0.5 rounded bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)]">
                        {log.action}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="text-[11px] font-medium text-[var(--text-primary)]">
                        {log.resource_type}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)] font-mono">
                        {log.resource_id ? `${log.resource_id.slice(0, 12)}...` : "—"}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap text-[11px] text-[var(--text-muted)] font-mono">
                      {log.ip_address || "internal"}
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setActiveDiffLog(log)}
                        className="text-[11px] h-7 px-2.5"
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" />
                        Inspect Diff
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Diff Inspection Modal */}
      {activeDiffLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-3xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl shadow-2xl p-6 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[var(--brand-primary)]" />
                <h3 className="text-base font-semibold text-[var(--text-primary)]">
                  Audit Entry: {activeDiffLog.action}
                </h3>
              </div>
              <button
                onClick={() => setActiveDiffLog(null)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 rounded-lg bg-[var(--bg-surface-elevated)] grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div>
                <span className="text-[var(--text-muted)] block text-[10px]">Resource</span>
                <span className="font-semibold text-[var(--text-primary)]">{activeDiffLog.resource_type}</span>
              </div>
              <div>
                <span className="text-[var(--text-muted)] block text-[10px]">Resource ID</span>
                <span className="font-mono text-[var(--text-primary)] truncate block">{activeDiffLog.resource_id || "N/A"}</span>
              </div>
              <div>
                <span className="text-[var(--text-muted)] block text-[10px]">Actor</span>
                <span className="text-[var(--text-primary)] truncate block">
                  {activeDiffLog.actor_profile?.email || (activeDiffLog.actor_type === "system" ? "System Service" : activeDiffLog.actor_id)}
                </span>
              </div>
              <div>
                <span className="text-[var(--text-muted)] block text-[10px]">Recorded At</span>
                <span className="font-mono text-[var(--text-primary)]">
                  {new Date(activeDiffLog.created_at).toLocaleString("en-IN")}
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <AuditDiffViewer
                oldValues={activeDiffLog.old_values}
                newValues={activeDiffLog.new_values}
              />
            </div>

            <div className="flex justify-end pt-2 border-t border-[var(--border-subtle)]">
              <Button size="sm" variant="outline" onClick={() => setActiveDiffLog(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
