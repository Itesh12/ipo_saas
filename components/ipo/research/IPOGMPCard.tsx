"use client";

import React from "react";
import { IPOGMPEntryRow, IPORow } from "@/features/ipo/types/ipo.types";
import { formatINR, formatPercentage, formatDate } from "@/lib/utils";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { TrendingUp, AlertCircle, Clock, ShieldAlert } from "lucide-react";
import { GMP_DISCLAIMER_TEXT } from "@/features/ipo/services/gmpEngine";

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

  return (
    <div className="space-y-6">
      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--text-muted)] font-medium">Latest GMP</span>
            <Badge variant={isPositive ? "success" : isNeutral ? "secondary" : "danger"} size="sm">
              Unofficial
            </Badge>
          </div>
          <p className="text-2xl font-bold text-[var(--text-primary)]">
            {formatINR(latestGmp.gmp_value)}
          </p>
          <span className="text-[11px] text-[var(--text-secondary)]">Per equity share</span>
        </div>

        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-1">
          <span className="text-xs text-[var(--text-muted)] font-medium">Estimated Listing Gain</span>
          <p
            className={`text-2xl font-bold ${
              isPositive ? "text-[var(--status-success)]" : isNeutral ? "text-[var(--text-primary)]" : "text-[var(--status-danger)]"
            }`}
          >
            {formatPercentage(latestGmp.gmp_percentage, { showSign: true })}
          </p>
          <span className="text-[11px] text-[var(--text-secondary)]">Over upper price band</span>
        </div>

        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-1">
          <span className="text-xs text-[var(--text-muted)] font-medium">Estimated Listing Price</span>
          <p className="text-2xl font-bold text-[var(--brand-primary)]">
            {formatINR(latestGmp.estimated_listing_price)}
          </p>
          <span className="text-[11px] text-[var(--text-secondary)]">
            Cutoff (₹{ipo.price_band_high}) + GMP (₹{latestGmp.gmp_value})
          </span>
        </div>

        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-1">
          <div className="flex items-center gap-1 text-xs text-[var(--text-muted)] font-medium">
            <Clock className="w-3.5 h-3.5" />
            <span>Observation Freshness</span>
          </div>
          <p className="text-sm font-semibold text-[var(--text-primary)] pt-1">
            {formatDate(latestGmp.observed_at, { includeTime: true })}
          </p>
          <span className="text-[11px] text-[var(--text-secondary)] truncate block">
            Source: {latestGmp.source || "Market Intelligence"}
          </span>
        </div>
      </div>

      {/* Historical Trend Table / List */}
      {history.length > 1 && (
        <Card className="border-[var(--border-subtle)] overflow-hidden">
          <CardHeader className="py-3 px-5 bg-[var(--bg-surface-elevated)]/30 border-b border-[var(--border-subtle)]">
            <CardTitle className="text-sm">Historical GMP Trend Progression</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--bg-surface-elevated)]/40 border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
                <tr>
                  <th className="py-2 px-4 font-semibold">Date & Time</th>
                  <th className="py-2 px-4 text-right font-semibold">GMP (₹)</th>
                  <th className="py-2 px-4 text-right font-semibold">Est. Listing Price</th>
                  <th className="py-2 px-4 text-right font-semibold">Est. Gain (%)</th>
                  <th className="py-2 px-4 font-semibold">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]/60 text-[var(--text-primary)]">
                {history.map((entry) => (
                  <tr key={entry.id} className="hover:bg-[var(--bg-surface-elevated)]/20 transition-colors">
                    <td className="py-2 px-4 text-[var(--text-secondary)]">
                      {formatDate(entry.observed_at, { includeTime: true })}
                    </td>
                    <td className="py-2 px-4 text-right font-semibold">{formatINR(entry.gmp_value)}</td>
                    <td className="py-2 px-4 text-right">{formatINR(entry.estimated_listing_price)}</td>
                    <td
                      className={`py-2 px-4 text-right font-medium ${
                        (entry.gmp_percentage || 0) >= 0 ? "text-[var(--status-success)]" : "text-[var(--status-danger)]"
                      }`}
                    >
                      {formatPercentage(entry.gmp_percentage, { showSign: true })}
                    </td>
                    <td className="py-2 px-4 text-[var(--text-muted)] truncate max-w-[150px]">{entry.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Mandatory Regulatory Disclaimer */}
      <div className="p-3.5 rounded-xl bg-[var(--bg-surface-elevated)]/60 border border-[var(--border-subtle)] flex items-start gap-2.5 text-xs text-[var(--text-secondary)]">
        <ShieldAlert className="w-4 h-4 text-[var(--status-warning)] shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong>Important Disclaimer:</strong> {GMP_DISCLAIMER_TEXT}
        </p>
      </div>
    </div>
  );
}
