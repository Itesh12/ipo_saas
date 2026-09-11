import React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { getLiveGMPTrackerList } from "@/features/ipo/services/ipoResearchService";
import { formatINR, formatPercentage, formatDate } from "@/lib/utils";
import { TrendingUp, ArrowRight, ShieldAlert, Clock } from "lucide-react";
import { GMP_DISCLAIMER_TEXT } from "@/features/ipo/services/gmpEngine";

export const dynamic = "force-dynamic";

export default async function IpoGmpPage() {
  const ipos = await getLiveGMPTrackerList();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <PageHeader
        title="Live IPO Grey Market Premium (GMP) Tracker"
        description="Daily unofficial Grey Market Premium observations, estimated listing prices, and market sentiment trends across Mainboard and SME IPOs."
      />

      {/* Mandatory Regulatory Warning */}
      <div className="p-4 rounded-xl bg-[var(--bg-surface-elevated)]/70 border border-[var(--border-subtle)] flex items-start gap-3 text-xs text-[var(--text-secondary)]">
        <ShieldAlert className="w-4 h-4 text-[var(--status-warning)] shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong>SEBI Compliance Disclaimer:</strong> {GMP_DISCLAIMER_TEXT}
        </p>
      </div>

      {ipos.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="No Active GMP Records Found"
          description="There are currently no published IPOs with active unofficial grey market quotes."
          actionLabel="View All IPOs"
          actionHref="/ipos"
        />
      ) : (
        <Card className="overflow-hidden border-[var(--border-subtle)]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--bg-surface-elevated)]/40 border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
                <tr>
                  <th className="py-3 px-4 font-semibold">IPO Company</th>
                  <th className="py-3 px-4 font-semibold">Issue Price</th>
                  <th className="py-3 px-4 text-right font-semibold">Latest GMP (₹)</th>
                  <th className="py-3 px-4 text-right font-semibold">Est. Listing Price</th>
                  <th className="py-3 px-4 text-right font-semibold">Est. Gain (%)</th>
                  <th className="py-3 px-4 font-semibold">Freshness / Source</th>
                  <th className="py-3 px-4 text-right font-semibold">Research</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]/60 text-[var(--text-primary)]">
                {ipos.map((ipo) => {
                  const gmpList = ipo.ipo_gmp_entries || [];
                  const latestGmp = gmpList.length > 0 ? gmpList[0] : null;

                  const priceStr =
                    ipo.price_band_high
                      ? `₹${ipo.price_band_high}`
                      : ipo.price_band_low
                      ? `₹${ipo.price_band_low}`
                      : "TBA";

                  return (
                    <tr key={ipo.id} className="hover:bg-[var(--bg-surface-elevated)]/20 transition-colors">
                      <td className="py-3 px-4 font-medium">
                        <Link
                          href={`/ipos/${ipo.slug}`}
                          className="font-semibold text-[var(--text-primary)] hover:text-[var(--brand-primary)] transition-colors"
                        >
                          {ipo.company_name}
                        </Link>
                        {ipo.symbol && (
                          <span className="text-[11px] text-[var(--text-muted)] ml-1.5">({ipo.symbol})</span>
                        )}
                        <span className="block text-[10px] text-[var(--text-secondary)] uppercase">
                          {ipo.category} • Closes: {formatDate(ipo.close_date)}
                        </span>
                      </td>

                      <td className="py-3 px-4 font-medium">{priceStr}</td>

                      <td className="py-3 px-4 text-right font-bold text-[var(--text-primary)]">
                        {latestGmp ? formatINR(latestGmp.gmp_value) : "—"}
                      </td>

                      <td className="py-3 px-4 text-right font-semibold text-[var(--brand-primary)]">
                        {latestGmp ? formatINR(latestGmp.estimated_listing_price) : "—"}
                      </td>

                      <td className="py-3 px-4 text-right">
                        {latestGmp ? (
                          <Badge
                            variant={
                              (latestGmp.gmp_percentage || 0) > 0
                                ? "success"
                                : (latestGmp.gmp_percentage || 0) === 0
                                ? "secondary"
                                : "danger"
                            }
                            size="sm"
                          >
                            {formatPercentage(latestGmp.gmp_percentage, { showSign: true })}
                          </Badge>
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-[11px] text-[var(--text-muted)]">
                        {latestGmp ? (
                          <div>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-[var(--text-secondary)]" />
                              {formatDate(latestGmp.observed_at)}
                            </span>
                            <span className="truncate max-w-[130px] block">{latestGmp.source}</span>
                          </div>
                        ) : (
                          "Pending Quotes"
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <Link
                          href={`/ipos/${ipo.slug}#gmp`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--brand-primary)] hover:underline"
                        >
                          <span>Full Trend</span>
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
