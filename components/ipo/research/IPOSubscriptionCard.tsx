"use client";

import { IPOSubscriptionSnapshotRow, IPORow } from "@/features/ipo/types/ipo.types";
import { formatSubscriptionMultiple } from "@/features/ipo/services/subscriptionEngine";
import { formatDate } from "@/lib/utils";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { BarChart3, Users, Building } from "lucide-react";

interface IPOSubscriptionCardProps {
  ipo: IPORow;
  latestSubscription: IPOSubscriptionSnapshotRow | null;
  snapshots: IPOSubscriptionSnapshotRow[];
}

export function IPOSubscriptionCard({ ipo, latestSubscription, snapshots }: IPOSubscriptionCardProps) {
  if (!latestSubscription && snapshots.length === 0) {
    return (
      <Card className="p-6 border-[var(--border-subtle)]">
        <div className="flex flex-col items-center justify-center py-6 text-center text-[var(--text-muted)] space-y-2">
          <BarChart3 className="w-8 h-8 text-[var(--text-muted)]" />
          <h4 className="text-sm font-semibold text-[var(--text-secondary)]">Subscription Bidding Not Yet Started</h4>
          <p className="text-xs max-w-md">
            Live subscription demand will be updated continuously during the bidding window (Open: {formatDate(ipo.open_date)} – Close: {formatDate(ipo.close_date)}).
          </p>
        </div>
      </Card>
    );
  }

  const sub = latestSubscription || snapshots[snapshots.length - 1];

  return (
    <div className="space-y-6">
      {/* Category Multiples Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Overall Multiple */}
        <div className="p-4 rounded-xl border border-[var(--brand-primary)]/40 bg-[var(--brand-primary)]/5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--brand-primary)] font-semibold">Total / Overall</span>
            <Badge variant="default" size="sm">
              Day {sub?.day_number ?? 1}
            </Badge>
          </div>
          <p className="text-2xl font-bold text-[var(--text-primary)]">
            {formatSubscriptionMultiple(sub?.overall_x)}
          </p>
          <span className="text-[10px] text-[var(--text-secondary)]">Cumulative demand</span>
        </div>

        {/* QIB Category */}
        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] font-medium">
            <Building className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
            <span>QIB (Institutions)</span>
          </div>
          <p className="text-xl font-bold text-[var(--text-primary)]">
            {formatSubscriptionMultiple(sub?.qib_x)}
          </p>
          <span className="text-[10px] text-[var(--text-secondary)]">
            Quota: {ipo.qib_quota_pct ? `${ipo.qib_quota_pct}%` : "50%"}
          </span>
        </div>

        {/* NII / HNI Category */}
        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] font-medium">
            <Users className="w-3.5 h-3.5 text-[var(--status-info)]" />
            <span>NII / HNI</span>
          </div>
          <p className="text-xl font-bold text-[var(--text-primary)]">
            {formatSubscriptionMultiple(sub?.nii_x)}
          </p>
          <span className="text-[10px] text-[var(--text-secondary)]">
            Quota: {ipo.hni_quota_pct ? `${ipo.hni_quota_pct}%` : "15%"}
          </span>
        </div>

        {/* Retail Individual Investors */}
        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] font-medium">
            <Users className="w-3.5 h-3.5 text-[var(--status-success)]" />
            <span>Retail (RII)</span>
          </div>
          <p className="text-xl font-bold text-[var(--text-primary)]">
            {formatSubscriptionMultiple(sub?.retail_x)}
          </p>
          <span className="text-[10px] text-[var(--text-secondary)]">
            Quota: {ipo.retail_quota_pct ? `${ipo.retail_quota_pct}%` : "35%"}
          </span>
        </div>

        {/* Employee / Other */}
        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-1">
          <span className="text-xs text-[var(--text-muted)] font-medium">Employee / Others</span>
          <p className="text-xl font-bold text-[var(--text-primary)]">
            {formatSubscriptionMultiple(sub?.employee_x)}
          </p>
          <span className="text-[10px] text-[var(--text-secondary)]">Reserved allocation</span>
        </div>
      </div>

      {/* Day-Wise Progression Table */}
      {snapshots.length > 0 && (
        <Card className="border-[var(--border-subtle)] overflow-hidden">
          <CardHeader className="py-3 px-5 bg-[var(--bg-surface-elevated)]/30 border-b border-[var(--border-subtle)] flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[var(--brand-primary)]" />
              <CardTitle className="text-sm">Day-wise Bidding Progression</CardTitle>
            </div>
            <span className="text-xs text-[var(--text-muted)]">Source: {sub?.source || "BSE / NSE Cumulative Feed"}</span>
          </CardHeader>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--bg-surface-elevated)]/40 border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">Bidding Period</th>
                  <th className="py-2.5 px-4 text-right font-semibold">QIB (x)</th>
                  <th className="py-2.5 px-4 text-right font-semibold">NII (x)</th>
                  <th className="py-2.5 px-4 text-right font-semibold">Retail (x)</th>
                  <th className="py-2.5 px-4 text-right font-semibold">Employee (x)</th>
                  <th className="py-2.5 px-4 text-right font-bold text-[var(--brand-primary)]">Total (x)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]/60 text-[var(--text-primary)]">
                {snapshots.map((snap) => (
                  <tr key={snap.id} className="hover:bg-[var(--bg-surface-elevated)]/20 transition-colors">
                    <td className="py-2.5 px-4 font-medium flex items-center gap-2">
                      <span className="font-semibold">Day {snap.day_number}</span>
                      <span className="text-[11px] text-[var(--text-muted)]">({formatDate(snap.snapshot_date)})</span>
                    </td>
                    <td className="py-2.5 px-4 text-right">{formatSubscriptionMultiple(snap.qib_x)}</td>
                    <td className="py-2.5 px-4 text-right">{formatSubscriptionMultiple(snap.nii_x)}</td>
                    <td className="py-2.5 px-4 text-right">{formatSubscriptionMultiple(snap.retail_x)}</td>
                    <td className="py-2.5 px-4 text-right">{formatSubscriptionMultiple(snap.employee_x)}</td>
                    <td className="py-2.5 px-4 text-right font-bold text-[var(--brand-primary)]">
                      {formatSubscriptionMultiple(snap.overall_x)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
