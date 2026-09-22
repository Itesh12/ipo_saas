"use client";

import React, { useState } from "react";
import { IPOSubscriptionSnapshotRow, IPORow } from "@/features/ipo/types/ipo.types";
import { formatSubscriptionMultiple } from "@/features/ipo/services/subscriptionEngine";
import { formatDate } from "@/lib/utils";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { BarChart3, Users, Building, ShieldCheck, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";

interface IPOSubscriptionCardProps {
  ipo: IPORow;
  latestSubscription: IPOSubscriptionSnapshotRow | null;
  snapshots: IPOSubscriptionSnapshotRow[];
}

export function IPOSubscriptionCard({ ipo, latestSubscription, snapshots }: IPOSubscriptionCardProps) {
  const [showDetailedShares, setShowDetailedShares] = useState(false);

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
  const isVerified = sub?.validation_status === "verified";
  const categoryDetails = (sub?.category_details || {}) as Record<
    string,
    { shares_offered?: number; shares_bid?: number; bids_count?: number; subscription_x?: number }
  >;

  return (
    <div className="space-y-6">
      {/* Top Banner with Provenance and Validation Status */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/30 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[var(--text-primary)]">Source Authority:</span>
          <span className="text-[var(--text-secondary)]">{sub?.source || "BSE / NSE Cumulative Feed"}</span>
          {sub?.authoritative_exchange && (
            <Badge variant="outline" size="sm">
              {sub.authoritative_exchange}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isVerified ? (
            <Badge variant="success" size="sm" className="gap-1 flex items-center">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              Verified Official Exchange Feed
            </Badge>
          ) : (
            <Badge variant="warning" size="sm" className="gap-1 flex items-center">
              <AlertCircle className="w-3 h-3 text-amber-400" />
              Pending Verification
            </Badge>
          )}
          {sub?.is_final_for_day && (
            <Badge variant="default" size="sm">
              Session Closed
            </Badge>
          )}
        </div>
      </div>

      {/* Category Multiples Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
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
            <span>QIB (Inst.)</span>
          </div>
          <p className="text-xl font-bold text-[var(--text-primary)]">
            {formatSubscriptionMultiple(sub?.qib_x)}
          </p>
          <span className="text-[10px] text-[var(--text-secondary)]">
            Quota: {ipo.qib_quota_pct ? `${ipo.qib_quota_pct}%` : "50%"}
          </span>
        </div>

        {/* Big HNI (>10L) */}
        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] font-medium">
            <Users className="w-3.5 h-3.5 text-purple-400" />
            <span>bHNI (&gt;₹10L)</span>
          </div>
          <p className="text-xl font-bold text-[var(--text-primary)]">
            {formatSubscriptionMultiple(sub?.b_hni_x ?? sub?.nii_bighni_x ?? sub?.nii_x)}
          </p>
          <span className="text-[10px] text-[var(--text-secondary)]">Big NII</span>
        </div>

        {/* Small HNI (2L-10L) */}
        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] font-medium">
            <Users className="w-3.5 h-3.5 text-indigo-400" />
            <span>sHNI (₹2L-10L)</span>
          </div>
          <p className="text-xl font-bold text-[var(--text-primary)]">
            {formatSubscriptionMultiple(sub?.s_hni_x ?? sub?.nii_smallhni_x)}
          </p>
          <span className="text-[10px] text-[var(--text-secondary)]">Small NII</span>
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
            Quota: {ipo.retail_quota_pct ? `${ipo.retail_quota_pct}%` : "TBA"}
          </span>
        </div>

        {/* Employee / Shareholder */}
        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-1">
          <span className="text-xs text-[var(--text-muted)] font-medium">
            {sub?.shareholder_x !== null && sub?.shareholder_x !== undefined
              ? "Shareholders"
              : "Employee"}
          </span>
          <p className="text-xl font-bold text-[var(--text-primary)]">
            {formatSubscriptionMultiple(sub?.shareholder_x ?? sub?.employee_x)}
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
            <button
              onClick={() => setShowDetailedShares(!showDetailedShares)}
              className="text-xs text-[var(--brand-primary)] hover:underline flex items-center gap-1 cursor-pointer"
            >
              {showDetailedShares ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" /> Hide Shares Breakdown
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" /> View Shares Breakdown
                </>
              )}
            </button>
          </CardHeader>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--bg-surface-elevated)]/40 border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">Bidding Period</th>
                  <th className="py-2.5 px-4 text-right font-semibold">QIB (x)</th>
                  <th className="py-2.5 px-4 text-right font-semibold">bHNI (x)</th>
                  <th className="py-2.5 px-4 text-right font-semibold">sHNI (x)</th>
                  <th className="py-2.5 px-4 text-right font-semibold">Retail (x)</th>
                  <th className="py-2.5 px-4 text-right font-semibold">Employee / SH (x)</th>
                  <th className="py-2.5 px-4 text-right font-bold text-[var(--brand-primary)]">Total (x)</th>
                  <th className="py-2.5 px-4 text-right font-semibold">Status</th>
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
                    <td className="py-2.5 px-4 text-right">
                      {formatSubscriptionMultiple(snap.b_hni_x ?? snap.nii_bighni_x ?? snap.nii_x)}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      {formatSubscriptionMultiple(snap.s_hni_x ?? snap.nii_smallhni_x)}
                    </td>
                    <td className="py-2.5 px-4 text-right">{formatSubscriptionMultiple(snap.retail_x)}</td>
                    <td className="py-2.5 px-4 text-right">
                      {formatSubscriptionMultiple(snap.shareholder_x ?? snap.employee_x)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-bold text-[var(--brand-primary)]">
                      {formatSubscriptionMultiple(snap.overall_x)}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      {snap.validation_status === "verified" ? (
                        <span className="text-[10px] text-emerald-400 font-medium">Verified</span>
                      ) : (
                        <span className="text-[10px] text-amber-400 font-medium">Pending</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Detailed Shares and Application Counts Modal/Drawer View */}
          {showDetailedShares && Object.keys(categoryDetails).length > 0 && (
            <div className="p-4 bg-[var(--bg-surface-elevated)]/40 border-t border-[var(--border-subtle)] space-y-3">
              <h5 className="text-xs font-semibold text-[var(--text-primary)]">
                Category Detailed Bids Breakdown (Latest Observation)
              </h5>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-[var(--text-secondary)] border-b border-[var(--border-subtle)]">
                    <tr>
                      <th className="py-1.5 px-3">Category</th>
                      <th className="py-1.5 px-3 text-right">Shares Offered</th>
                      <th className="py-1.5 px-3 text-right">Shares Bid For</th>
                      <th className="py-1.5 px-3 text-right">Total Bids Count</th>
                      <th className="py-1.5 px-3 text-right">Subscription</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]/40 text-[var(--text-primary)]">
                    {Object.entries(categoryDetails).map(([key, details]) => (
                      <tr key={key}>
                        <td className="py-1.5 px-3 font-medium uppercase">{key}</td>
                        <td className="py-1.5 px-3 text-right font-mono">
                          {details.shares_offered?.toLocaleString() || "—"}
                        </td>
                        <td className="py-1.5 px-3 text-right font-mono">
                          {details.shares_bid?.toLocaleString() || "—"}
                        </td>
                        <td className="py-1.5 px-3 text-right font-mono">
                          {details.bids_count?.toLocaleString() || "—"}
                        </td>
                        <td className="py-1.5 px-3 text-right font-bold text-[var(--brand-primary)]">
                          {formatSubscriptionMultiple(details.subscription_x)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
