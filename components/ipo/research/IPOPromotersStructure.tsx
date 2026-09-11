"use client";

import React from "react";
import { IPOPromoterRow, IPORow } from "@/features/ipo/types/ipo.types";
import { formatCrores, formatPercentage } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Users, Layers } from "lucide-react";

interface IPOPromotersStructureProps {
  ipo: IPORow;
  promoters: IPOPromoterRow[];
}

export function IPOPromotersStructure({ ipo, promoters }: IPOPromotersStructureProps) {
  const freshCr = ipo.fresh_issue_cr || 0;
  const ofsCr = ipo.ofs_cr || 0;
  const totalIssueCr = ipo.issue_size_cr || freshCr + ofsCr;
  const freshPct = totalIssueCr > 0 ? (freshCr / totalIssueCr) * 100 : 0;
  const ofsPct = totalIssueCr > 0 ? (ofsCr / totalIssueCr) * 100 : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Issue Structure & Proceeds */}
      <Card className="border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <CardHeader className="py-3.5 px-5 bg-[var(--bg-surface-elevated)]/30 border-b border-[var(--border-subtle)] flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[var(--brand-primary)]" />
            <CardTitle className="text-sm">Issue Structure & Capital Allocation</CardTitle>
          </div>
          <Badge variant="secondary" size="sm">
            Total {formatCrores(totalIssueCr)}
          </Badge>
        </CardHeader>

        <CardContent className="p-5 space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-[var(--text-secondary)]">Fresh Issue (Growth Capital)</span>
              <span className="font-semibold text-[var(--brand-primary)]">
                {formatCrores(freshCr)} ({formatPercentage(freshPct)})
              </span>
            </div>
            <div className="w-full h-2 bg-[var(--bg-surface-elevated)] rounded-full overflow-hidden flex">
              <div className="bg-[var(--brand-primary)] h-full" style={{ width: `${freshPct}%` }} />
              <div className="bg-[var(--status-warning)] h-full" style={{ width: `${ofsPct}%` }} />
            </div>
            <div className="flex justify-between text-xs pt-1">
              <span className="text-[var(--text-secondary)]">Offer for Sale (Existing Shareholders)</span>
              <span className="font-semibold text-[var(--status-warning)]">
                {formatCrores(ofsCr)} ({formatPercentage(ofsPct)})
              </span>
            </div>
          </div>

          <div className="pt-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-2.5 rounded-lg bg-[var(--bg-surface-elevated)]/40 border border-[var(--border-subtle)]">
              <span className="text-[10px] text-[var(--text-muted)] font-medium">Face Value</span>
              <p className="text-xs font-bold text-[var(--text-primary)] mt-0.5">
                {ipo.face_value ? `₹${ipo.face_value} per share` : "₹10 per share"}
              </p>
            </div>
            <div className="p-2.5 rounded-lg bg-[var(--bg-surface-elevated)]/40 border border-[var(--border-subtle)]">
              <span className="text-[10px] text-[var(--text-muted)] font-medium">Shares Offered</span>
              <p className="text-xs font-bold text-[var(--text-primary)] mt-0.5">
                {ipo.shares_offered ? `${(ipo.shares_offered / 10000000).toFixed(2)} Cr Shares` : "TBA"}
              </p>
            </div>
            <div className="p-2.5 rounded-lg bg-[var(--bg-surface-elevated)]/40 border border-[var(--border-subtle)]">
              <span className="text-[10px] text-[var(--text-muted)] font-medium">Retail Quota</span>
              <p className="text-xs font-bold text-[var(--status-success)] mt-0.5">
                {ipo.retail_quota_pct ? `${ipo.retail_quota_pct}%` : "35%"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Promoters & Management */}
      <Card className="border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <CardHeader className="py-3.5 px-5 bg-[var(--bg-surface-elevated)]/30 border-b border-[var(--border-subtle)] flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[var(--brand-primary)]" />
            <CardTitle className="text-sm">Promoters & Shareholding</CardTitle>
          </div>
          <span className="text-xs text-[var(--text-muted)]">Post-IPO Holding</span>
        </CardHeader>

        <CardContent className="p-5 space-y-3">
          {promoters.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] py-4 text-center">
              Promoter holding details will be populated from the final Red Herring Prospectus (RHP).
            </p>
          ) : (
            promoters.map((p) => (
              <div
                key={p.id}
                className="p-3 rounded-lg bg-[var(--bg-surface-elevated)]/40 border border-[var(--border-subtle)] flex items-center justify-between gap-3"
              >
                <div>
                  <h5 className="text-xs font-semibold text-[var(--text-primary)]">{p.promoter_name}</h5>
                  {p.designation && <span className="text-[11px] text-[var(--text-secondary)]">{p.designation}</span>}
                </div>

                <div className="text-right">
                  <div className="text-xs font-semibold text-[var(--brand-primary)]">
                    {p.holding_post_pct ? `${p.holding_post_pct}% Post-IPO` : "—"}
                  </div>
                  {p.holding_pre_pct && (
                    <span className="text-[10px] text-[var(--text-muted)]">Pre-IPO: {p.holding_pre_pct}%</span>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
