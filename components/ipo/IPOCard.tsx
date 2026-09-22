import React from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { IPOStatusBadge } from "./IPOStatusBadge";
import { IPORow } from "@/features/ipo/types/ipo.types";
import { formatINR, formatCrores, formatDate } from "@/lib/utils";
import { calculateDaysRemaining } from "@/features/ipo/services/ipoLifecycle";
import { Building2, Calendar, ArrowRight } from "lucide-react";

interface IPOCardProps {
  ipo: IPORow;
  className?: string;
}

export function IPOCard({ ipo, className }: IPOCardProps) {
  const daysRemaining = calculateDaysRemaining(ipo.close_date);

  const categoryLabels: Record<string, string> = {
    mainboard: "Mainboard",
    sme_bse: "BSE SME",
    sme_nse: "NSE SME",
  };

  const formattedPriceBand =
    ipo.price_band_low && ipo.price_band_high
      ? ipo.price_band_low === ipo.price_band_high
        ? `₹${ipo.price_band_high}`
        : `₹${ipo.price_band_low} – ₹${ipo.price_band_high}`
      : "TBA";

  return (
    <Card className={`flex flex-col justify-between hover:border-[var(--border-strong)] transition-all group ${className || ""}`}>
      <div>
        {/* Card Header: Category & Status */}
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-[var(--border-subtle)]">
          <Badge variant="outline" size="sm" className="font-mono uppercase text-[10px]">
            {categoryLabels[ipo.category] || ipo.category}
          </Badge>
          <IPOStatusBadge status={ipo.status} />
        </div>

        {/* Company Identity */}
        <div className="flex items-start gap-3 pt-3.5 pb-4">
          <div className="w-10 h-10 rounded-xl bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--brand-primary)] shrink-0 group-hover:scale-105 transition-transform font-bold text-sm">
            {ipo.company_logo ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={ipo.company_logo} alt={ipo.company_name} className="w-full h-full object-cover rounded-xl" />
            ) : (
              <Building2 className="w-5 h-5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <Link
              href={`/ipos/${ipo.slug}`}
              className="font-bold text-sm text-[var(--text-primary)] hover:text-[var(--brand-primary)] transition-colors line-clamp-1"
            >
              {ipo.company_name}
            </Link>
            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[var(--text-muted)]">
              {ipo.symbol && <span className="font-mono uppercase font-semibold text-[var(--text-secondary)]">{ipo.symbol}</span>}
              {ipo.exchange && <span>• {ipo.exchange}</span>}
            </div>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-[var(--bg-surface-elevated)]/50 text-xs border border-[var(--border-subtle)]/50">
          <div>
            <span className="text-[10px] text-[var(--text-muted)] block uppercase font-medium">Price Band</span>
            <span className="font-semibold text-[var(--text-primary)]">{formattedPriceBand}</span>
          </div>

          <div>
            <span className="text-[10px] text-[var(--text-muted)] block uppercase font-medium">Issue Size</span>
            <span className="font-semibold text-[var(--text-primary)]">{formatCrores(ipo.issue_size_cr)}</span>
          </div>

          <div>
            <span className="text-[10px] text-[var(--text-muted)] block uppercase font-medium">Lot Size</span>
            <span className="font-semibold text-[var(--text-primary)]">
              {ipo.lot_size ? `${ipo.lot_size} Shares` : "TBA"}
            </span>
          </div>

          <div>
            <span className="text-[10px] text-[var(--text-muted)] block uppercase font-medium">Min Investment</span>
            <span className="font-semibold text-[var(--status-success)]">
              {ipo.min_investment ? formatINR(ipo.min_investment) : "TBA"}
            </span>
          </div>
        </div>
      </div>

      {/* Footer: Timeline date & CTA */}
      <div className="pt-4 mt-4 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
          <Calendar className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          {ipo.status === "open" && daysRemaining !== null ? (
            <span className="font-semibold text-[var(--status-danger)]">
              {daysRemaining === 0 ? "Closes today!" : `Closes in ${daysRemaining} day${daysRemaining > 1 ? "s" : ""}`}
            </span>
          ) : ipo.status === "upcoming" ? (
            <span>Opens {formatDate(ipo.open_date)}</span>
          ) : ipo.status === "listed" ? (
            <span>Listed {formatDate(ipo.listing_date)}</span>
          ) : (
            <span>Closed {formatDate(ipo.close_date)}</span>
          )}
        </div>

        <Link href={`/ipos/${ipo.slug}`}>
          <Button size="sm" variant="ghost" className="text-xs group-hover:text-[var(--brand-primary)] p-0 h-auto">
            <span>Details</span>
            <ArrowRight className="w-3.5 h-3.5 ml-1 transition-transform group-hover:translate-x-0.5" />
          </Button>
        </Link>
      </div>
    </Card>
  );
}
