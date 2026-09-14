"use client";

import React from "react";
import { IPOGMPEntryRow, IPORow } from "@/features/ipo/types/ipo.types";
import { formatINR, formatPercentage, formatDate } from "@/lib/utils";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { TrendingUp, TrendingDown, AlertCircle, Clock, ShieldAlert, Lock } from "lucide-react";
import { GMP_DISCLAIMER_V1 } from "@/features/external-integrations/gmp/gmpCompliance";

interface IPOGMPCardProps {
  ipo: IPORow;
  latestGmp: IPOGMPEntryRow | null;
  history: IPOGMPEntryRow[];
}

export function IPOGMPCard({ ipo, latestGmp, history }: IPOGMPCardProps) {
  if (!latestGmp) {
    return (
      <Card className="p-6 border-[var(--border-subtle)]">
        <div className="flex flex-col items-center justify-center py-6 text-center text-[var(--text-muted)] space-y-2">
          <TrendingUp className="w-8 h-8 text-[var(--text-muted)]" />
          <h4 className="text-sm font-semibold text-[var(--text-secondary)]">Grey Market Premium (GMP) Unavailable</h4>
          <p className="text-xs max-w-md">
            No active unofficial grey market premium has been recorded for {ipo.company_name} yet. GMP usually emerges 3–5 days prior to issue opening.
          </p>
          <div className="pt-3 text-[11px] text-[var(--text-muted)] flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-[var(--status-warning)] shrink-0" />
            <span>Unofficial metric — does not guarantee listing price or performance.</span>
          </div>
        </div>
      </Card>
    );
  }

  const isPositive = (latestGmp.gmp_value || 0) > 0;
  const isNeutral = (latestGmp.gmp_value || 0) === 0;
  const freshness = latestGmp.freshness_state || "stale";
  const sourceCount = latestGmp.source_count ?? 1;
  const isFrozen = !!latestGmp.is_post_listing_frozen;

  const freshnessBadgeVariant =
    freshness === "fresh"
      ? "success"
      : freshness === "aging"
      ? "warning"
      : freshness === "stale"
      ? "secondary"
      : "outline";

  return (
    <div className="space-y-6">
      {/* Post-Listing Freeze Banner */}
      {isFrozen && (
        <div className="p-3.5 rounded-xl bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] flex items-center gap-2.5 text-xs text-[var(--text-secondary)]">
          <Lock className="w-4 h-4 text-[var(--brand-primary)] shrink-0" />
          <span>
            <strong>Post-Listing Freeze:</strong> This instrument has listed. The Grey Market Premium lifecycle is locked at its final pre-listing baseline.
          </span>
        </div>
      )}

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Latest GMP with Trend & Consensus Badge */}
        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--text-muted)] font-medium">Consensus GMP</span>
            <div className="flex items-center gap-1.5">
              <Badge variant={latestGmp.confidence_level === "verified" ? "success" : "secondary"} size="sm">
                {sourceCount > 1 ? `${sourceCount} Sources` : "1 Source"}
              </Badge>
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold text-[var(--text-primary)]">
              {formatINR(latestGmp.gmp_value)}
            </p>
            {latestGmp.day_change_value !== undefined && latestGmp.day_change_value !== null && latestGmp.day_change_value !== 0 && (
              <span
                className={`inline-flex items-center text-xs font-semibold ${
                  latestGmp.day_change_value > 0 ? "text-[var(--status-success)]" : "text-[var(--status-danger)]"
                }`}
              >
                {latestGmp.day_change_value > 0 ? (
                  <TrendingUp className="w-3 h-3 mr-0.5" />
                ) : (
                  <TrendingDown className="w-3 h-3 mr-0.5" />
                )}
                {formatINR(Math.abs(latestGmp.day_change_value))}
              </span>
            )}
          </div>
          <span className="text-[11px] text-[var(--text-secondary)]">Per equity share (Unofficial)</span>
        </div>

        {/* Estimated Listing Gain */}
        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-1">
          <span className="text-xs text-[var(--text-muted)] font-medium">Estimated Listing Gain</span>
          <p
            className={`text-2xl font-bold ${
              isPositive ? "text-[var(--status-success)]" : isNeutral ? "text-[var(--text-primary)]" : "text-[var(--status-danger)]"
            }`}
          >
            {ipo.price_band_high ? formatPercentage(latestGmp.gmp_percentage, { showSign: true }) : "TBA"}
          </p>
          <span className="text-[11px] text-[var(--text-secondary)]">
            {ipo.price_band_high ? `Over cutoff ₹${ipo.price_band_high}` : "Issue price pending"}
          </span>
        </div>

        {/* Estimated Listing Price */}
        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-1">
          <span className="text-xs text-[var(--text-muted)] font-medium">Estimated Listing Price</span>
          <p className="text-2xl font-bold text-[var(--brand-primary)]">
            {latestGmp.estimated_listing_price ? formatINR(latestGmp.estimated_listing_price) : "TBA"}
          </p>
          <span className="text-[11px] text-[var(--text-secondary)]">
            {ipo.price_band_high
              ? `Cutoff (₹${ipo.price_band_high}) + GMP (₹${latestGmp.gmp_value})`
              : "Awaiting price band"}
          </span>
        </div>

        {/* Observation Freshness & Policy */}
        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-xs text-[var(--text-muted)] font-medium">
              <Clock className="w-3.5 h-3.5" />
              <span>Freshness</span>
            </div>
            <Badge variant={freshnessBadgeVariant} size="sm">
              {freshness.toUpperCase()}
            </Badge>
          </div>
          <p className="text-sm font-semibold text-[var(--text-primary)] pt-1">
            {formatDate(latestGmp.observed_at, { includeTime: true })}
          </p>
          <span className="text-[11px] text-[var(--text-secondary)] truncate block">
            Spread: {latestGmp.source_spread_pct !== null && latestGmp.source_spread_pct !== undefined ? `${latestGmp.source_spread_pct}%` : "N/A"} • {latestGmp.policy_version || "GMP_POLICY_V1"}
          </span>
        </div>
      </div>

      {/* Auxiliary OTC Metrics: Kostak & Subject to Sauda */}
      {(latestGmp.kostak_rate !== null || latestGmp.subject_to_sauda_rate !== null) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/40 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--text-muted)] font-medium">Kostak Rate</span>
              <Badge variant="outline" size="sm">Per Application</Badge>
            </div>
            <p className="text-lg font-bold text-[var(--text-primary)]">
              {latestGmp.kostak_rate ? formatINR(latestGmp.kostak_rate) : "No Active Trades"}
            </p>
            <span className="text-[11px] text-[var(--text-secondary)]">
              Fixed profit earned by selling application prior to allotment (independent from GMP)
            </span>
          </div>

          <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/40 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--text-muted)] font-medium">Subject to Sauda</span>
              <Badge variant="outline" size="sm">Per Allotment</Badge>
            </div>
            <p className="text-lg font-bold text-[var(--text-primary)]">
              {latestGmp.subject_to_sauda_rate ? formatINR(latestGmp.subject_to_sauda_rate) : "No Active Trades"}
            </p>
            <span className="text-[11px] text-[var(--text-secondary)]">
              Conditional settlement valid only upon confirmed share allotment
            </span>
          </div>
        </div>
      )}

      {/* Historical Trend Table */}
      {history.length > 1 && (
        <Card className="border-[var(--border-subtle)] overflow-hidden">
          <CardHeader className="py-3 px-5 bg-[var(--bg-surface-elevated)]/30 border-b border-[var(--border-subtle)]">
            <CardTitle className="text-sm">Historical GMP Trend Progression</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--bg-surface-elevated)]/40 border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
                <tr>
                  <th className="py-2 px-4 font-semibold">Observation Date</th>
                  <th className="py-2 px-4 text-right font-semibold">GMP (₹)</th>
                  <th className="py-2 px-4 text-right font-semibold">Est. Listing Price</th>
                  <th className="py-2 px-4 text-right font-semibold">Est. Gain (%)</th>
                  <th className="py-2 px-4 text-center font-semibold">Sources</th>
                  <th className="py-2 px-4 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]/60 text-[var(--text-primary)]">
                {history.map((entry) => (
                  <tr key={entry.id} className="hover:bg-[var(--bg-surface-elevated)]/20 transition-colors">
                    <td className="py-2 px-4 text-[var(--text-secondary)]">
                      {formatDate(entry.observed_at, { includeTime: true })}
                    </td>
                    <td className="py-2 px-4 text-right font-semibold">{formatINR(entry.gmp_value)}</td>
                    <td className="py-2 px-4 text-right">{entry.estimated_listing_price ? formatINR(entry.estimated_listing_price) : "TBA"}</td>
                    <td
                      className={`py-2 px-4 text-right font-medium ${
                        (entry.gmp_percentage || 0) >= 0 ? "text-[var(--status-success)]" : "text-[var(--status-danger)]"
                      }`}
                    >
                      {entry.gmp_percentage !== null && entry.gmp_percentage !== undefined
                        ? formatPercentage(entry.gmp_percentage, { showSign: true })
                        : "TBA"}
                    </td>
                    <td className="py-2 px-4 text-center text-[var(--text-secondary)]">
                      {entry.source_count ?? 1}
                    </td>
                    <td className="py-2 px-4">
                      <Badge variant={entry.confidence_level === "verified" ? "success" : "secondary"} size="sm">
                        {entry.confidence_level || "unverified"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Mandatory SEBI Regulatory Disclaimer */}
      <div className="p-3.5 rounded-xl bg-[var(--bg-surface-elevated)]/60 border border-[var(--border-subtle)] flex items-start gap-2.5 text-xs text-[var(--text-secondary)]">
        <ShieldAlert className="w-4 h-4 text-[var(--status-warning)] shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong>Mandatory Compliance Disclaimer:</strong> {GMP_DISCLAIMER_V1}
        </p>
      </div>
    </div>
  );
}
