import React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { OpportunityRankingWidget } from "@/components/analytics/OpportunityRankingWidget";
import { formatINR } from "@/lib/utils";
import { requireAuth } from "@/lib/security/auth-guards";
import { getUserApplications } from "@/features/application/services/applicationService";
import { getUserWatchlist } from "@/features/application/services/watchlistService";
import { getApplicationStatusMeta } from "@/features/application/services/applicationLifecycle";
import { InvestorRankingService } from "@/features/analytics/services/investorRankingService";
import {
  Wallet,
  FileCheck2,
  Clock,
  PieChart,
  Plus,
  ArrowRight,
  Star,
  Flame,
  Sparkles,
  BarChart3,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireAuth();
  const userId = user.id;

  const [applications, watchlist, rankedOpportunities] = await Promise.all([
    getUserApplications(userId),
    getUserWatchlist(userId),
    InvestorRankingService.getRankedOpportunities(3),
  ]);

  const activeApps = applications.filter((a) => !["cancelled", "completed"].includes(a.status));
  const activeAmount = activeApps.reduce((sum, a) => sum + (a.application_amount || 0), 0);
  const pendingMandates = applications.filter((a) => ["applied", "mandate_pending"].includes(a.status)).length;
  const pendingAllotments = applications.filter((a) =>
    ["funds_blocked", "bidding_closed", "allotment_pending"].includes(a.status)
  ).length;

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <PageHeader
        title="Investor Dashboard"
        description="Monitor your tracked IPO applications, applicant profiles, and market intelligence."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/ipo-screener">
              <Button size="sm" variant="outline" leftIcon={<Sparkles className="w-3.5 h-3.5 text-amber-500" />}>
                Screener
              </Button>
            </Link>
            <Link href="/analytics">
              <Button size="sm" variant="outline" leftIcon={<BarChart3 className="w-3.5 h-3.5 text-indigo-500" />}>
                Analytics
              </Button>
            </Link>
            <Link href="/applicants">
              <Button size="sm" variant="secondary" leftIcon={<Plus className="w-3.5 h-3.5" />}>
                Add Applicant
              </Button>
            </Link>
            <Link href="/ipos">
              <Button size="sm" variant="primary" leftIcon={<Flame className="w-3.5 h-3.5" />}>
                Explore IPOs
              </Button>
            </Link>
          </div>
        }
      />

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Active IPO Applications"
          value={activeApps.length.toString()}
          icon={FileCheck2}
          subtext={`${applications.length} lifetime applications`}
        />
        <StatCard
          title="Amount in Active Applications"
          value={formatINR(activeAmount)}
          icon={Wallet}
          subtext="Lien-blocked or pending mandate"
        />
        <StatCard
          title="Mandates Pending"
          value={pendingMandates.toString()}
          icon={Clock}
          subtext="Requires authorization on UPI app"
        />
        <StatCard
          title="Allotments Pending"
          value={pendingAllotments.toString()}
          icon={PieChart}
          subtext="Awaiting registrar basis of allotment"
        />
      </div>

      {/* Explainable Opportunity Rankings Widget */}
      <OpportunityRankingWidget opportunities={rankedOpportunities} />

      {/* Two Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Active Applications */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-[var(--border-subtle)] bg-[var(--bg-surface)]">
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div>
                <CardTitle className="text-sm">Recent IPO Applications</CardTitle>
                <CardDescription className="text-xs">
                  Applications across yourself and registered family members.
                </CardDescription>
              </div>
              <Link href="/applications">
                <Button size="sm" variant="ghost" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
                  View All ({applications.length})
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {applications.length === 0 ? (
                <EmptyState
                  icon={FileCheck2}
                  title="No active applications found"
                  description="When you record IPO applications for yourself or family members, their mandate status and allotment results will be tracked here."
                  actionLabel="Apply for an IPO"
                  actionHref="/applications/new"
                  className="py-8"
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[var(--bg-surface-elevated)]/30 border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
                      <tr>
                        <th className="py-2.5 px-4 font-semibold">IPO Company</th>
                        <th className="py-2.5 px-4 font-semibold">Applicant</th>
                        <th className="py-2.5 px-4 text-right font-semibold">Amount</th>
                        <th className="py-2.5 px-4 text-center font-semibold">Status</th>
                        <th className="py-2.5 px-4 text-right font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]/60 text-[var(--text-primary)]">
                      {applications.slice(0, 5).map((app) => {
                        const statusMeta = getApplicationStatusMeta(app.status);
                        return (
                          <tr key={app.id} className="hover:bg-[var(--bg-surface-elevated)]/20 transition-colors">
                            <td className="py-2.5 px-4 font-semibold">
                              {app.ipo?.company_name}
                              <span className="block text-[10px] font-mono text-[var(--text-muted)]">
                                {app.application_number}
                              </span>
                            </td>
                            <td className="py-2.5 px-4">
                              {app.applicant?.display_name}
                              <span className="block text-[10px] text-[var(--text-muted)]">
                                ({app.investor_category.toUpperCase()})
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-right font-bold text-[var(--text-primary)]">
                              {formatINR(app.application_amount)}
                            </td>
                            <td className="py-2.5 px-4 text-center">
                              <Badge variant={statusMeta.variant} size="sm">
                                {statusMeta.label}
                              </Badge>
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <Link href={`/applications/${app.id}`}>
                                <Button size="sm" variant="ghost">
                                  View
                                </Button>
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Col: Watchlist */}
        <div className="space-y-6">
          <Card className="border-[var(--border-subtle)] bg-[var(--bg-surface)]">
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div>
                <CardTitle className="text-sm">Tracked Watchlist</CardTitle>
                <CardDescription className="text-xs">Monitored IPOs & unofficial GMP.</CardDescription>
              </div>
              <Link href="/watchlist">
                <Button size="sm" variant="ghost" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
                  Manage ({watchlist.length})
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {watchlist.length === 0 ? (
                <EmptyState
                  icon={Star}
                  title="Watchlist is empty"
                  description="Star IPOs to track unofficial GMP trends and bidding cutoffs."
                  actionLabel="Browse IPOs"
                  actionHref="/ipos"
                  className="py-6"
                />
              ) : (
                <div className="divide-y divide-[var(--border-subtle)]/60 text-xs">
                  {watchlist.slice(0, 4).map(({ ipo, latest_gmp }) => (
                    <div key={ipo.id} className="py-2.5 flex items-center justify-between gap-2">
                      <div>
                        <Link href={`/ipos/${ipo.slug}`} className="font-semibold hover:text-[var(--brand-primary)]">
                          {ipo.company_name}
                        </Link>
                        <span className="block text-[10px] text-[var(--text-muted)]">
                          Band: ₹{ipo.price_band_low} - ₹{ipo.price_band_high}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[10px] text-[var(--text-muted)] block">GMP (Unofficial)</span>
                        <span className="font-bold text-xs text-[var(--status-success)]">
                          {latest_gmp ? formatINR(latest_gmp.gmp_amount) : "TBA"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
