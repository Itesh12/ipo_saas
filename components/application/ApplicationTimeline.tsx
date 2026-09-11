"use client";

import React from "react";
import { ApplicationStatus, getApplicationStatusMeta } from "@/features/application/services/applicationLifecycle";
import { Badge } from "@/components/ui/Badge";
import { CheckCircle2, Clock, XCircle } from "lucide-react";

interface ApplicationTimelineProps {
  status: ApplicationStatus;
  appliedAt: string;
}

export function ApplicationTimeline({ status }: ApplicationTimelineProps) {
  const meta = getApplicationStatusMeta(status);

  // Standard linear milestones for visual display
  const milestones = [
    { key: "applied", label: "Applied", desc: "Bid Submitted" },
    { key: "mandate", label: "Mandate", desc: "UPI Request" },
    { key: "funds_blocked", label: "Blocked", desc: "Bank Lien" },
    { key: "bidding_closed", label: "Closed", desc: "Issue Ended" },
    { key: "allotment", label: "Allotment", desc: "Registrar Basis" },
    { key: "completed", label: "Completed", desc: "Final State" },
  ];

  const getCurrentMilestoneIndex = (st: ApplicationStatus) => {
    switch (st) {
      case "draft":
        return 0;
      case "applied":
        return 1;
      case "mandate_pending":
      case "mandate_approved":
        return 2;
      case "funds_blocked":
        return 3;
      case "bidding_closed":
        return 4;
      case "allotment_pending":
        return 4;
      case "allotted":
      case "partially_allotted":
      case "not_allotted":
      case "refund_pending":
      case "refund_completed":
      case "funds_unblocked":
        return 5;
      case "completed":
        return 6;
      case "cancelled":
        return -1;
    }
  };

  const currentIdx = getCurrentMilestoneIndex(status);

  if (status === "cancelled") {
    return (
      <div className="p-4 rounded-xl bg-[var(--status-danger-bg)] border border-[var(--status-danger)]/20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <XCircle className="w-5 h-5 text-[var(--status-danger)] shrink-0" />
          <div>
            <h4 className="text-sm font-semibold text-[var(--status-danger)]">Application Cancelled</h4>
            <p className="text-xs text-[var(--text-secondary)]">This application was cancelled before allotment allocation.</p>
          </div>
        </div>
        <Badge variant="danger">Cancelled</Badge>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
        <div>
          <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            Current Lifecycle Stage
          </span>
          <div className="flex items-center gap-2 mt-0.5">
            <h3 className="text-base font-bold text-[var(--text-primary)]">{meta.label}</h3>
            <Badge variant={meta.variant}>{meta.label}</Badge>
          </div>
        </div>
        <p className="text-xs text-[var(--text-secondary)] max-w-sm sm:text-right">
          {meta.description}
        </p>
      </div>

      {/* Progress Bar Steps */}
      <div className="overflow-x-auto py-2">
        <div className="flex items-center justify-between min-w-[540px] relative">
          {/* Connector Line */}
          <div className="absolute top-4 left-4 right-4 h-0.5 bg-[var(--border-subtle)] z-0" />
          <div
            className="absolute top-4 left-4 h-0.5 bg-[var(--brand-primary)] z-0 transition-all duration-500"
            style={{
              width: `${Math.min(100, Math.max(0, ((currentIdx - 1) / (milestones.length - 1)) * 100))}%`,
            }}
          />

          {milestones.map((m, idx) => {
            const stepNum = idx + 1;
            const isCompleted = currentIdx > stepNum;
            const isCurrent = currentIdx === stepNum;

            return (
              <div key={m.key} className="flex flex-col items-center relative z-10 space-y-1.5">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    isCompleted
                      ? "bg-[var(--brand-primary)] text-white"
                      : isCurrent
                      ? "bg-[var(--bg-surface-elevated)] border-2 border-[var(--brand-primary)] text-[var(--brand-primary)] shadow-sm"
                      : "bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-muted)]"
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : isCurrent ? (
                    <Clock className="w-4 h-4 animate-pulse" />
                  ) : (
                    stepNum
                  )}
                </div>
                <div className="text-center">
                  <p
                    className={`text-xs font-semibold ${
                      isCurrent
                        ? "text-[var(--brand-primary)]"
                        : isCompleted
                        ? "text-[var(--text-primary)]"
                        : "text-[var(--text-muted)]"
                    }`}
                  >
                    {m.label}
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)]">{m.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
