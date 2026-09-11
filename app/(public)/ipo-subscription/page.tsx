import React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { getLiveSubscriptionTrackerList } from "@/features/ipo/services/ipoResearchService";
import { formatSubscriptionMultiple } from "@/features/ipo/services/subscriptionEngine";
import { formatCrores, formatDate } from "@/lib/utils";
import { BarChart3, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function IpoSubscriptionPage() {
  const ipos = await getLiveSubscriptionTrackerList();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <PageHeader
        title="Live IPO Subscription Demand Tracker"
        description="Real-time cumulative bidding multiples across Institutional (QIB), Non-Institutional (NII/HNI), Retail Individual (RII), and Employee quotas."
      />

      {ipos.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="No Active Bidding Windows"
          description="There are currently no active IPOs accepting bidding applications."
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
                  <th className="py-3 px-4 font-semibold">Issue Size</th>
                  <th className="py-3 px-4 text-right font-semibold">QIB (x)</th>
                  <th className="py-3 px-4 text-right font-semibold">NII (x)</th>
                  <th className="py-3 px-4 text-right font-semibold">Retail (x)</th>
                  <th className="py-3 px-4 text-right font-bold text-[var(--brand-primary)]">Overall (x)</th>
                  <th className="py-3 px-4 font-semibold">Day Status</th>
                  <th className="py-3 px-4 text-right font-semibold">Research</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]/60 text-[var(--text-primary)]">
                {ipos.map((ipo) => {
                  const snapshots = (ipo.ipo_subscription_snapshots || []) as unknown as {
                    day_number: number;
                    qib_x: number | null;
                    nii_x: number | null;
                    retail_x: number | null;
                    overall_x: number;
                  }[];
                  const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;

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
                          {ipo.category} • Bidding Closes: {formatDate(ipo.close_date)}
                        </span>
                      </td>

                      <td className="py-3 px-4">{formatCrores(ipo.issue_size_cr)}</td>

                      <td className="py-3 px-4 text-right font-medium">
                        {latest ? formatSubscriptionMultiple(latest.qib_x) : "—"}
                      </td>

                      <td className="py-3 px-4 text-right font-medium">
                        {latest ? formatSubscriptionMultiple(latest.nii_x) : "—"}
                      </td>

                      <td className="py-3 px-4 text-right font-medium">
                        {latest ? formatSubscriptionMultiple(latest.retail_x) : "—"}
                      </td>

                      <td className="py-3 px-4 text-right font-bold text-sm text-[var(--brand-primary)]">
                        {latest ? formatSubscriptionMultiple(latest.overall_x) : "—"}
                      </td>

                      <td className="py-3 px-4 text-[11px] text-[var(--text-secondary)]">
                        {latest ? (
                          <Badge variant="default" size="sm">
                            Day {latest.day_number}
                          </Badge>
                        ) : (
                          <span className="text-[var(--text-muted)]">Not Started</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <Link
                          href={`/ipos/${ipo.slug}#subscription`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--brand-primary)] hover:underline"
                        >
                          <span>Day-wise</span>
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
