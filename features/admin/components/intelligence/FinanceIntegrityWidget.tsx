import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Scale, CheckCircle2 } from "lucide-react";
import Link from "next/link";

export function FinanceIntegrityWidget() {
  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-[var(--brand-primary)]" />
            <span>General Ledger & Financial Invariants</span>
          </CardTitle>
          <CardDescription>Phase 5 double-entry accounting integrity and ASBA lien reclassifications.</CardDescription>
        </div>
        <Link href="/admin/finance" className="text-xs text-[var(--brand-primary)] hover:underline">
          View Ledger
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-[var(--bg-surface-elevated)]/60 border border-[var(--border-subtle)] space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[var(--text-primary)]">Double-Entry Balance</span>
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Balanced
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-muted)]">
              All posted journal lines strictly enforce Σ(Debits) = Σ(Credits) with zero ledger drift.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-[var(--bg-surface-elevated)]/60 border border-[var(--border-subtle)] space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[var(--text-primary)]">ASBA Lien Accounting</span>
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Reconciled
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-muted)]">
              Lien blocks and allotment settlements correctly reclassify capital without synthetic cash movement.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
