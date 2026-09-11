"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatINR } from "@/lib/utils";
import { IPOApplicationMandateRow } from "@/features/application/types/application.types";
import { ShieldCheck, Smartphone, CheckCircle, Clock, XCircle } from "lucide-react";

interface MandateStatusCardProps {
  mandate: IPOApplicationMandateRow | null;
  applicationAmount: number;
}

export function MandateStatusCard({ mandate, applicationAmount }: MandateStatusCardProps) {
  const getStatusBadge = (st: string) => {
    switch (st) {
      case "approved":
        return <Badge variant="success">Approved</Badge>;
      case "blocked":
        return <Badge variant="success">Funds Blocked</Badge>;
      case "pending":
      case "created":
        return <Badge variant="warning">Mandate Pending</Badge>;
      case "rejected":
        return <Badge variant="danger">Rejected</Badge>;
      case "unblocked":
        return <Badge variant="info">Funds Unblocked</Badge>;
      default:
        return <Badge variant="secondary">{st}</Badge>;
    }
  };

  const getStatusIcon = (st: string) => {
    switch (st) {
      case "approved":
      case "blocked":
        return <CheckCircle className="w-5 h-5 text-[var(--status-success)]" />;
      case "rejected":
        return <XCircle className="w-5 h-5 text-[var(--status-danger)]" />;
      case "unblocked":
        return <CheckCircle className="w-5 h-5 text-[var(--status-info)]" />;
      default:
        return <Clock className="w-5 h-5 text-[var(--status-warning)]" />;
    }
  };

  return (
    <Card className="border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      <CardHeader className="py-3 px-5 bg-[var(--bg-surface-elevated)]/30 border-b border-[var(--border-subtle)] flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-[var(--brand-primary)]" />
          <CardTitle className="text-sm">UPI Mandate Status</CardTitle>
        </div>
        {mandate ? getStatusBadge(mandate.mandate_status) : <Badge variant="secondary">Pending Setup</Badge>}
      </CardHeader>

      <CardContent className="p-5 space-y-4">
        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-[var(--bg-surface-elevated)]/40 border border-[var(--border-subtle)]">
          {mandate ? getStatusIcon(mandate.mandate_status) : <Clock className="w-5 h-5 text-[var(--status-warning)]" />}
          <div className="space-y-0.5">
            <h4 className="text-sm font-semibold text-[var(--text-primary)]">
              {mandate?.mandate_status === "blocked"
                ? "Bank Lien Active"
                : mandate?.mandate_status === "approved"
                ? "Mandate Approved by Investor"
                : mandate?.mandate_status === "unblocked"
                ? "Lien Released by Bank"
                : "Awaiting Mandate Authorization"}
            </h4>
            <p className="text-xs text-[var(--text-secondary)]">
              {mandate?.mandate_status === "blocked"
                ? `Lien successfully marked on ${formatINR(mandate.blocked_amount)}. Funds remain in your bank earning interest until allotment.`
                : mandate?.mandate_status === "approved"
                ? "Mandate request accepted on UPI app. Final lien confirmation from sponsor bank pending."
                : "Please open your UPI application (BHIM, Google Pay, PhonePe) and accept the pending mandate request."}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-[var(--bg-surface-elevated)]/30 border border-[var(--border-subtle)]">
            <span className="text-[11px] text-[var(--text-muted)]">Mandate Amount</span>
            <p className="font-bold text-sm text-[var(--text-primary)] mt-0.5">
              {formatINR(mandate?.requested_amount || applicationAmount)}
            </p>
          </div>

          <div className="p-3 rounded-lg bg-[var(--bg-surface-elevated)]/30 border border-[var(--border-subtle)]">
            <span className="text-[11px] text-[var(--text-muted)]">Lien Blocked</span>
            <p className="font-bold text-sm text-[var(--status-success)] mt-0.5">
              {formatINR(mandate?.blocked_amount || 0)}
            </p>
          </div>

          <div className="p-3 rounded-lg bg-[var(--bg-surface-elevated)]/30 border border-[var(--border-subtle)]">
            <span className="text-[11px] text-[var(--text-muted)]">UPI ID</span>
            <p className="font-semibold text-xs text-[var(--text-primary)] mt-1 font-mono">
              {mandate?.upi_id_masked || "—"}
            </p>
          </div>

          <div className="p-3 rounded-lg bg-[var(--bg-surface-elevated)]/30 border border-[var(--border-subtle)]">
            <span className="text-[11px] text-[var(--text-muted)]">Provider / Ref</span>
            <p className="font-semibold text-xs text-[var(--text-secondary)] mt-1 truncate">
              {mandate?.provider_reference || mandate?.provider || "BHIM_UPI"}
            </p>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-[var(--bg-surface-elevated)]/20 border border-[var(--border-subtle)] flex items-start gap-2.5 text-[11px] text-[var(--text-muted)]">
          <ShieldCheck className="w-4 h-4 text-[var(--status-success)] shrink-0 mt-0.5" />
          <p>
            <strong>Regulatory ASBA Security:</strong> In IPO applications under SEBI ASBA rules, your application money remains in your bank account under a lien. It is never debited until shares are allotted. Never disclose your UPI PIN or OTP.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
