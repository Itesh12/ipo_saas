import React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { getLiveGMPTrackerList } from "@/features/ipo/services/ipoResearchService";
import { formatINR, formatPercentage, formatDate } from "@/lib/utils";
import { TrendingUp, TrendingDown, ArrowRight, ShieldAlert, Clock, Lock } from "lucide-react";
import { GMP_DISCLAIMER_V1 } from "@/features/external-integrations/gmp/gmpCompliance";

export const dynamic = "force-dynamic";

export default async function IpoGmpPage() {
  const ipos = await getLiveGMPTrackerList();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <PageHeader
        title="Live IPO Grey Market Premium (GMP) Intelligence"
        description="Multi-source reconciled Grey Market Premium observations, Kostak & Sauda metrics, and price discovery trends across Indian IPOs."
      />

      {/* Mandatory Regulatory Warning */}
      <div className="p-4 rounded-xl bg-[var(--bg-surface-elevated)]/70 border border-[var(--border-subtle)] flex items-start gap-3 text-xs text-[var(--text-secondary)]">
        <ShieldAlert className="w-4 h-4 text-[var(--status-warning)] shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong>SEBI Compliance Disclaimer:</strong> {GMP_DISCLAIMER_V1}
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
                  <th className="py-3 px-4 text-right font-semibold">Consensus GMP (₹)</th>
                  <th className="py-3 px-4 text-right font-semibold">Est. Listing Price</th>
                  <th className="py-3 px-4 text-right font-semibold">Est. Gain (%)</th>
                  <th className="py-3 px-4 font-semibold">Kostak / Sauda</th>
                  <th className="py-3 px-4 font-semibold">Consensus & Freshness</th>
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

                  const freshness = latestGmp?.freshness_state || "stale";
                  const isFrozen = !!latestGmp?.is_post_listing_frozen;

                  return (
                    <tr key={ipo.id} className="hover:bg-[var(--bg-surface-elevated)]/20 transition-colors">
                      <td className="py-3 px-4 font-medium">
                        <div className="flex items-center gap-1.5">
                          <Link
                            href={`/ipos/${ipo.slug}`}
                            className="font-semibold text-[var(--text-primary)] hover:text-[var(--brand-primary)] transition-colors"
                          >
                            {ipo.company_name}
                          </Link>
                          {isFrozen && (
                            <span title="Post-Listing Frozen">
                              <Lock className="w-3 h-3 text-[var(--text-muted)]" />
                            </span>
                          )}
                        </div>
                        {ipo.symbol && (
                          <span className="text-[11px] text-[var(--text-muted)] ml-1.5">({ipo.symbol})</span>
                        )}
                        <span className="block text-[10px] text-[var(--text-secondary)] uppercase">
                          {ipo.category} • Closes: {formatDate(ipo.close_date)}
                        </span>
                      </td>

                      <td className="py-3 px-4 font-medium">{priceStr}</td>

                      <td className="py-3 px-4 text-right font-bold text-[var(--text-primary)]">
                        {latestGmp ? (
                          <div className="flex flex-col items-end">
                            <span>{formatINR(latestGmp.gmp_value)}</span>
                            {latestGmp.day_change_value !== undefined && latestGmp.day_change_value !== null && latestGmp.day_change_value !== 0 && (
                              <span
                                className={`inline-flex items-center text-[10px] font-semibold ${
                                  latestGmp.day_change_value > 0 ? "text-[var(--status-success)]" : "text-[var(--status-danger)]"
                                }`}
                              >
                                {latestGmp.day_change_value > 0 ? (
                                  <TrendingUp className="w-2.5 h-2.5 mr-0.5" />
                                ) : (
                                  <TrendingDown className="w-2.5 h-2.5 mr-0.5" />
                                )}
                                {formatINR(Math.abs(latestGmp.day_change_value))}
                              </span>
                            )}
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>

                      <td className="py-3 px-4 text-right font-semibold text-[var(--brand-primary)]">
                        {latestGmp && latestGmp.estimated_listing_price ? formatINR(latestGmp.estimated_listing_price) : "TBA"}
                      </td>

                      <td className="py-3 px-4 text-right">
                        {latestGmp && latestGmp.gmp_percentage !== null && latestGmp.gmp_percentage !== undefined ? (
                          <Badge
                            variant={
                              latestGmp.gmp_percentage > 0
                                ? "success"
                                : latestGmp.gmp_percentage === 0
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

                      <td className="py-3 px-4 text-[11px] text-[var(--text-secondary)]">
                        {latestGmp?.kostak_rate || latestGmp?.subject_to_sauda_rate ? (
                          <div className="space-y-0.5">
                            {latestGmp.kostak_rate && (
                              <div>
                                <span className="text-[var(--text-muted)]">Kostak:</span> ₹{latestGmp.kostak_rate}
                              </div>
                            )}
                            {latestGmp.subject_to_sauda_rate && (
                              <div>
                                <span className="text-[var(--text-muted)]">Sauda:</span> ₹{latestGmp.subject_to_sauda_rate}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-[11px] text-[var(--text-muted)]">
                        {latestGmp ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <Badge
                                variant={latestGmp.confidence_level === "verified" ? "success" : "secondary"}
                                size="sm"
                              >
                                {latestGmp.source_count ? `${latestGmp.source_count} Srcs` : "1 Src"}
                              </Badge>
                              <Badge
                                variant={
                                  freshness === "fresh"
                                    ? "success"
                                    : freshness === "aging"
                                    ? "warning"
                                    : freshness === "stale"
                                    ? "secondary"
                                    : "outline"
                                }
                                size="sm"
                              >
                                {freshness.toUpperCase()}
                              </Badge>
                            </div>
                            <span className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)]">
                              <Clock className="w-2.5 h-2.5" />
                              {formatDate(latestGmp.observed_at)}
                            </span>
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
