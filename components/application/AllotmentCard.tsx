"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatINR } from "@/lib/utils";
import { IPOApplicationAllotmentRow } from "@/features/application/types/application.types";
import { PieChart, CheckCircle2, XCircle, Clock, AlertCircle } from "lucide-react";

interface AllotmentCardProps {
  allotment: IPOApplicationAllotmentRow | null;
  totalQuantity: number;
  totalLots: number;
  applicationAmount: number;
}

export function AllotmentCard({
  allotment,
  totalQuantity,
  totalLots,
  applicationAmount,
}: AllotmentCardProps) {
  if (!allotment || allotment.allotment_status === "pending") {
    return (
      <Card className="border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <CardHeader className="py-3 px-5 bg-[var(--bg-surface-elevated)]/30 border-b border-[var(--border-subtle)] flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <PieChart className="w-4 h-4 text-[var(--brand-primary)]" />
            <CardTitle className="text-sm">Registrar Allotment Status</CardTitle>
          </div>
          <Badge variant="warning">Allotment Pending</Badge>
        </CardHeader>

        <CardContent className="p-6 text-center space-y-2">
          <Clock className="w-8 h-8 text-[var(--status-warning)] mx-auto opacity-80" />
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">
            Awaiting Registrar Basis of Allotment
          </h4>
          <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
            The registrar is processing applications against the published basis of allotment. When allotment is finalized, your allotted share count and refund amounts will appear here.
          </p>
        </CardContent>
      </Card>
    );
  }

  const isAllotted = allotment.allotment_status === "allotted";
  const isPartial = allotment.allotment_status === "partially_allotted";

  return (
    <Card className="border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      <CardHeader className="py-3 px-5 bg-[var(--bg-surface-elevated)]/30 border-b border-[var(--border-subtle)] flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <PieChart className="w-4 h-4 text-[var(--brand-primary)]" />
          <CardTitle className="text-sm">Registrar Allotment Outcome</CardTitle>
        </div>
        {isAllotted ? (
          <Badge variant="success">Allotted (Full)</Badge>
        ) : isPartial ? (
          <Badge variant="info">Partially Allotted</Badge>
        ) : (
          <Badge variant="danger">Not Allotted</Badge>
        )}
      </CardHeader>

      <CardContent className="p-5 space-y-4">
        <div
          className={`flex items-start gap-3 p-4 rounded-xl border ${
            isAllotted
              ? "bg-[var(--status-success-bg)] border-[var(--status-success)]/20"
              : isPartial
              ? "bg-[var(--status-info-bg)] border-[var(--status-info)]/20"
              : "bg-[var(--status-danger-bg)] border-[var(--status-danger)]/20"
          }`}
        >
          {isAllotted ? (
            <CheckCircle2 className="w-5 h-5 text-[var(--status-success)] shrink-0 mt-0.5" />
          ) : isPartial ? (
            <AlertCircle className="w-5 h-5 text-[var(--status-info)] shrink-0 mt-0.5" />
          ) : (
            <XCircle className="w-5 h-5 text-[var(--status-danger)] shrink-0 mt-0.5" />
          )}

          <div>
            <h4
              className={`text-sm font-bold ${
                isAllotted
                  ? "text-[var(--status-success)]"
                  : isPartial
                  ? "text-[var(--status-info)]"
                  : "text-[var(--status-danger)]"
              }`}
            >
              {isAllotted
                ? `Congratulations! ${allotment.shares_allotted} Shares Allotted`
                : isPartial
                ? `Partial Allotment: ${allotment.shares_allotted} Shares Allotted`
                : "No Shares Allotted"}
            </h4>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              {isAllotted
                ? `Allotted at the final issue price of ₹${allotment.allotment_price || "—"}. Shares will be credited to your Demat account before listing day.`
                : isPartial
                ? `${allotment.shares_allotted} shares allotted. Surplus fund balance of ${formatINR(allotment.refund_amount)} queued for lien release.`
                : `Unfortunately no allotment was secured for this application. The full amount of ${formatINR(allotment.refund_amount || applicationAmount)} will be unblocked in your bank.`}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-[var(--bg-surface-elevated)]/30 border border-[var(--border-subtle)]">
            <span className="text-[11px] text-[var(--text-muted)]">Shares Allotted / Applied</span>
            <p className="font-bold text-sm text-[var(--text-primary)] mt-0.5">
              {allotment.shares_allotted} / {totalQuantity}
            </p>
            <span className="text-[10px] text-[var(--text-muted)]">
              {allotment.lots_allotted} of {totalLots} lots
            </span>
          </div>

          <div className="p-3 rounded-lg bg-[var(--bg-surface-elevated)]/30 border border-[var(--border-subtle)]">
            <span className="text-[11px] text-[var(--text-muted)]">Final Allotment Price</span>
            <p className="font-bold text-sm text-[var(--text-primary)] mt-0.5">
              {allotment.allotment_price ? `₹${allotment.allotment_price}` : "—"}
            </p>
            <span className="text-[10px] text-[var(--text-muted)]">Registrar Cutoff</span>
          </div>

          <div className="p-3 rounded-lg bg-[var(--bg-surface-elevated)]/30 border border-[var(--border-subtle)]">
            <span className="text-[11px] text-[var(--text-muted)]">Allotment Investment</span>
            <p className="font-bold text-sm text-[var(--status-success)] mt-0.5">
              {formatINR(allotment.allotment_amount)}
            </p>
            <span className="text-[10px] text-[var(--text-muted)]">Debited on allotment</span>
          </div>

          <div className="p-3 rounded-lg bg-[var(--bg-surface-elevated)]/30 border border-[var(--border-subtle)]">
            <span className="text-[11px] text-[var(--text-muted)]">Refund / Unblock Amount</span>
            <p className="font-bold text-sm text-[var(--brand-primary)] mt-0.5">
              {formatINR(allotment.refund_amount)}
            </p>
            <span className="text-[10px] text-[var(--text-muted)]">Lien released to bank</span>
          </div>
        </div>

        {allotment.basis_of_allotment_ref && (
          <div className="text-[11px] text-[var(--text-muted)] flex items-center justify-between pt-2 border-t border-[var(--border-subtle)]">
            <span>Basis of Allotment Reference:</span>
            <span className="font-mono font-semibold text-[var(--text-secondary)]">
              {allotment.basis_of_allotment_ref}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
