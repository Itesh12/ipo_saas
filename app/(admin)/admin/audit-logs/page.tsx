import React from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { AuditLogTable } from "@/features/admin/components/audit/AuditLogTable";
import { queryAuditLogsAction } from "@/features/admin/actions/auditActions";
import { ShieldCheck, Lock } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminAuditLogsPage() {
  const { logs, total } = await queryAuditLogsAction({ pageSize: 100 }).catch(() => ({
    logs: [],
    total: 0,
  }));

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="System Governance & Audit Trail"
        description="Immutable governance log recording actor actions, state mutations, and privileged operations."
        badge={
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" />
            Append-Only Immutability
          </span>
        }
      />

      {/* Immutability & Masking Assurance Banner */}
      <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-start gap-3 text-xs text-[var(--text-secondary)]">
        <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-semibold text-[var(--text-primary)]">
            Cryptographic Storage Integrity & PII Masking Guarantee
          </div>
          <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
            All audit log entries are strictly append-only. PostgreSQL database triggers permanently block UPDATE and DELETE operations across all roles. Sensitive personal and financial identifiers (PAN, bank accounts, UPI IDs, passwords) are automatically redacted prior to storage and dynamically sanitized on read.
          </p>
        </div>
      </div>

      {/* Audit Log Table */}
      <AuditLogTable initialLogs={logs} total={total} />
    </div>
  );
}
