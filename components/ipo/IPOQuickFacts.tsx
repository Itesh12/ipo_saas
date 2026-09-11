import React from "react";
import { IPORow } from "@/features/ipo/types/ipo.types";
import { formatINR, formatCrores } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Coins, Layers, Users, Building } from "lucide-react";

interface IPOQuickFactsProps {
  ipo: IPORow;
}

export function IPOQuickFacts({ ipo }: IPOQuickFactsProps) {
  const formattedPriceBand =
    ipo.price_band_low && ipo.price_band_high
      ? ipo.price_band_low === ipo.price_band_high
        ? `₹${ipo.price_band_high} per share`
        : `₹${ipo.price_band_low} – ₹${ipo.price_band_high} per share`
      : "TBA";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <Coins className="w-4 h-4 text-[var(--brand-primary)]" />
            <CardTitle>Core Issue Details</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <div className="space-y-1">
              <span className="text-[11px] uppercase font-semibold text-[var(--text-muted)]">
                Price Band
              </span>
              <p className="text-sm font-bold text-[var(--text-primary)]">
                {formattedPriceBand}
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-[11px] uppercase font-semibold text-[var(--text-muted)]">
                Lot Size
              </span>
              <p className="text-sm font-bold text-[var(--text-primary)]">
                {ipo.lot_size} Shares
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-[11px] uppercase font-semibold text-[var(--text-muted)]">
                Minimum Investment
              </span>
              <p className="text-sm font-bold text-[var(--status-success)]">
                {formatINR(ipo.min_investment)}
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-[11px] uppercase font-semibold text-[var(--text-muted)]">
                Face Value
              </span>
              <p className="text-sm font-bold text-[var(--text-primary)]">
                {formatINR(ipo.face_value)} per share
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Issue Structure Breakdown */}
      <Card>
        <CardHeader className="pb-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[var(--brand-primary)]" />
            <CardTitle>Issue Size & Structure</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-3.5 rounded-xl bg-[var(--bg-surface-elevated)]/60 border border-[var(--border-subtle)] space-y-1">
              <span className="text-[11px] uppercase font-semibold text-[var(--text-muted)]">
                Total Issue Size
              </span>
              <p className="text-base font-bold text-[var(--text-primary)]">
                {formatCrores(ipo.issue_size_cr)}
              </p>
              {ipo.shares_offered && (
                <p className="text-[11px] text-[var(--text-muted)]">
                  {ipo.shares_offered.toLocaleString("en-IN")} Shares
                </p>
              )}
            </div>

            <div className="p-3.5 rounded-xl bg-[var(--bg-surface-elevated)]/60 border border-[var(--border-subtle)] space-y-1">
              <span className="text-[11px] uppercase font-semibold text-[var(--text-muted)]">
                Fresh Issue
              </span>
              <p className="text-base font-bold text-[var(--brand-primary)]">
                {formatCrores(ipo.fresh_issue_cr)}
              </p>
              <p className="text-[11px] text-[var(--text-muted)]">Capital goes to company</p>
            </div>

            <div className="p-3.5 rounded-xl bg-[var(--bg-surface-elevated)]/60 border border-[var(--border-subtle)] space-y-1">
              <span className="text-[11px] uppercase font-semibold text-[var(--text-muted)]">
                Offer for Sale (OFS)
              </span>
              <p className="text-base font-bold text-[var(--text-secondary)]">
                {formatCrores(ipo.ofs_cr)}
              </p>
              <p className="text-[11px] text-[var(--text-muted)]">Promoter / investor sale</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quotas & Registrar */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[var(--brand-primary)]" />
              <CardTitle>Investor Reservation Quotas</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--text-secondary)]">Retail Individual Investors (RII)</span>
              <span className="font-bold text-[var(--text-primary)]">{ipo.retail_quota_pct ?? 35}%</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-[var(--bg-surface-elevated)] overflow-hidden">
              <div
                className="h-full bg-[var(--status-success)] rounded-full"
                style={{ width: `${ipo.retail_quota_pct ?? 35}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-[var(--text-secondary)]">Qualified Institutional Buyers (QIB)</span>
              <span className="font-bold text-[var(--text-primary)]">{ipo.qib_quota_pct ?? 50}%</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-[var(--bg-surface-elevated)] overflow-hidden">
              <div
                className="h-full bg-[var(--brand-primary)] rounded-full"
                style={{ width: `${ipo.qib_quota_pct ?? 50}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-[var(--text-secondary)]">Non-Institutional / HNI</span>
              <span className="font-bold text-[var(--text-primary)]">{ipo.hni_quota_pct ?? 15}%</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-[var(--bg-surface-elevated)] overflow-hidden">
              <div
                className="h-full bg-[var(--status-warning)] rounded-full"
                style={{ width: `${ipo.hni_quota_pct ?? 15}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-2">
              <Building className="w-4 h-4 text-[var(--brand-primary)]" />
              <CardTitle>Market Governance</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-3 text-xs">
            <div className="flex items-start justify-between">
              <span className="text-[var(--text-muted)]">Listing Exchanges</span>
              <span className="font-semibold text-[var(--text-primary)]">{ipo.exchange || "NSE, BSE"}</span>
            </div>
            <div className="flex items-start justify-between">
              <span className="text-[var(--text-muted)]">Registrar</span>
              <span className="font-semibold text-[var(--text-primary)]">{ipo.registrar_name || "TBA"}</span>
            </div>
            <div className="flex items-start justify-between">
              <span className="text-[var(--text-muted)]">Issue Type</span>
              <span className="font-semibold capitalize text-[var(--text-primary)]">
                {ipo.issue_type.replace(/_/g, " ")}
              </span>
            </div>
            {ipo.lead_managers && ipo.lead_managers.length > 0 && (
              <div className="pt-2 border-t border-[var(--border-subtle)]">
                <span className="text-[var(--text-muted)] block mb-1">Lead Book Running Managers</span>
                <div className="flex flex-wrap gap-1">
                  {ipo.lead_managers.map((mgr, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded text-[11px] bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)]"
                    >
                      {mgr}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
