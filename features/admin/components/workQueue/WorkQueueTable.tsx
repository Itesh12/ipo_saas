"use client";

import React, { useState } from "react";
import Link from "next/link";
import { AdminWorkItem, WorkItemCategory, WorkItemSeverity, WorkItemStatus } from "../../types/workQueue.types";
import { WorkItemSeverityBadge, WorkItemStatusBadge } from "./WorkItemSeverityBadge";
import { WorkItemResolutionModal } from "./WorkItemResolutionModal";
import { markInvestigatingAction } from "../../actions/workQueueActions";
import { Button } from "@/components/ui/Button";
import {
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  ArrowRight,
  User,
  Clock,
} from "lucide-react";

interface WorkQueueTableProps {
  initialItems: AdminWorkItem[];
  userRole?: string;
  userId?: string;
}

export function WorkQueueTable({ initialItems, userRole, userId }: WorkQueueTableProps) {
  const [items, setItems] = useState<AdminWorkItem[]>(initialItems);
  const [statusFilter, setStatusFilter] = useState<WorkItemStatus | "all">("open");
  const [severityFilter, setSeverityFilter] = useState<WorkItemSeverity | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<WorkItemCategory | "all">("all");
  const [assignedToMeOnly, setAssignedToMeOnly] = useState(false);
  const [search, setSearch] = useState("");

  const [activeModal, setActiveModal] = useState<{
    item: AdminWorkItem;
    mode: "resolve" | "dismiss" | "reopen";
  } | null>(null);

  const canResolve = ["super_admin", "admin"].includes(userRole || "");
  const canInvestigate = ["super_admin", "admin", "editor"].includes(userRole || "");

  // Filter items in memory
  const filtered = items.filter((item) => {
    if (assignedToMeOnly && userId && item.assigned_to !== userId) return false;
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    if (severityFilter !== "all" && item.severity !== severityFilter) return false;
    if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
    if (search) {
      const term = search.toLowerCase();
      const matchTitle = item.title.toLowerCase().includes(term);
      const matchDesc = item.description.toLowerCase().includes(term);
      const matchEntity = item.entity_id.toLowerCase().includes(term);
      if (!matchTitle && !matchDesc && !matchEntity) return false;
    }
    return true;
  });

  async function handleInvestigate(itemId: string) {
    try {
      const res = await markInvestigatingAction(itemId);
      if (res.success && res.item) {
        setItems((prev) => prev.map((i) => (i.id === itemId ? res.item : i)));
      }
    } catch (err) {
      console.error("Failed to mark investigating:", err);
    }
  }

  function handleModalSuccess(updated: AdminWorkItem) {
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
  }

  return (
    <div className="space-y-4">
      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search work items by title, description, or entity ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-xs pl-9 pr-3 py-2 rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-primary)]"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            <Filter className="w-3.5 h-3.5" />
            <span className="text-[11px] font-medium">Status:</span>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as WorkItemStatus | "all")}
            className="text-xs py-1.5 px-2.5 rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
          >
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="investigating">Investigating</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
          </select>

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as WorkItemSeverity | "all")}
            className="text-xs py-1.5 px-2.5 rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as WorkItemCategory | "all")}
            className="text-xs py-1.5 px-2.5 rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
          >
            <option value="all">All Categories</option>
            <option value="ipo_data_gap">IPO Data Gap</option>
            <option value="stale_market_data">Stale Market Data</option>
            <option value="application_anomaly">Application Anomaly</option>
            <option value="finance_reconciliation">Finance Invariant</option>
            <option value="notification_dead_letter">Dead-Letter Alert</option>
          </select>

          {userId && (
            <button
              type="button"
              onClick={() => setAssignedToMeOnly((prev) => !prev)}
              className={`text-xs py-1.5 px-2.5 rounded-lg border transition-colors ${
                assignedToMeOnly
                  ? "bg-[var(--brand-primary)] text-white border-[var(--brand-primary)]"
                  : "bg-[var(--bg-surface-elevated)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              Assigned to me
            </button>
          )}
        </div>
      </div>

      {/* Items Table */}
      <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/50 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                <th className="py-3 px-4">Severity & Status</th>
                <th className="py-3 px-4">Work Item Title & Diagnostic</th>
                <th className="py-3 px-4">Category & Entity</th>
                <th className="py-3 px-4">Assignee</th>
                <th className="py-3 px-4">Detected</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[var(--text-muted)]">
                    No work items found matching current criteria.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-[var(--bg-surface-elevated)]/40 transition-colors">
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex flex-col gap-1 items-start">
                        <WorkItemSeverityBadge severity={item.severity} />
                        <WorkItemStatusBadge status={item.status} />
                      </div>
                    </td>

                    <td className="py-3.5 px-4 max-w-sm">
                      <Link
                        href={`/admin/work-queue/${item.id}`}
                        className="font-semibold text-[var(--text-primary)] hover:text-[var(--brand-primary)] transition-colors block truncate"
                      >
                        {item.title}
                      </Link>
                      <p className="text-[11px] text-[var(--text-muted)] line-clamp-1 mt-0.5">
                        {item.description}
                      </p>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="text-[11px] font-medium text-[var(--text-primary)]">
                        {item.category.replace(/_/g, " ")}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)] font-mono">
                        {item.entity_type} ({item.entity_id.slice(0, 8)}...)
                      </div>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {item.assigned_profile ? (
                        <div className="flex items-center gap-1 text-[11px] text-[var(--text-primary)]">
                          <User className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                          <span>{item.assigned_profile.full_name || item.assigned_profile.email}</span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-[var(--text-muted)] italic">Unassigned</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap text-[11px] text-[var(--text-muted)]">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{new Date(item.created_at).toLocaleDateString("en-IN")}</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {item.status === "open" && canInvestigate && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleInvestigate(item.id)}
                            className="text-[11px] h-7 px-2"
                          >
                            Investigate
                          </Button>
                        )}

                        {["open", "investigating"].includes(item.status) && canResolve && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setActiveModal({ item, mode: "resolve" })}
                              className="text-[11px] h-7 px-2 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                            >
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Resolve
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setActiveModal({ item, mode: "dismiss" })}
                              className="text-[11px] h-7 px-2 text-[var(--text-muted)] hover:text-red-400"
                            >
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              Dismiss
                            </Button>
                          </>
                        )}

                        {["resolved", "dismissed"].includes(item.status) && canResolve && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setActiveModal({ item, mode: "reopen" })}
                            className="text-[11px] h-7 px-2 text-blue-400 hover:bg-blue-500/10"
                          >
                            <RotateCcw className="w-3 h-3 mr-1" />
                            Reopen
                          </Button>
                        )}

                        <Link href={`/admin/work-queue/${item.id}`}>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {activeModal && (
        <WorkItemResolutionModal
          item={activeModal.item}
          mode={activeModal.mode}
          onClose={() => setActiveModal(null)}
          onSuccess={handleModalSuccess}
        />
      )}
    </div>
  );
}
