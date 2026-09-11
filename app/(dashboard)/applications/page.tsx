import React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatINR, formatDate } from "@/lib/utils";
import { requireAuth } from "@/lib/security/auth-guards";
import { getUserApplications } from "@/features/application/services/applicationService";
import { getApplicationStatusMeta, ApplicationStatus } from "@/features/application/services/applicationLifecycle";
import { FileCheck2, Plus, Clock, ArrowRight, Wallet, PieChart } from "lucide-react";

export const dynamic = "force-dynamic";

interface ApplicationsPageProps {
  searchParams: Promise<{
    status?: string;
    q?: string;
  }>;
}

export default async function ApplicationsPage({ searchParams }: ApplicationsPageProps) {
  const params = await searchParams;
  const user = await requireAuth();
  const userId = user.id;

  const applications = await getUserApplications(userId, {
    status: params.status as ApplicationStatus,
    searchQuery: params.q,
  });

  // Compute summary stats
  const totalCount = applications.length;
  const activeApplications = applications.filter((a) => !["cancelled", "completed"].includes(a.status));
  const activeAmountTracked = activeApplications.reduce((sum, a) => sum + (a.application_amount || 0), 0);
  const pendingMandates = applications.filter((a) => ["applied", "mandate_pending"].includes(a.status)).length;
  const pendingAllotments = applications.filter((a) =>
    ["funds_blocked", "bidding_closed", "allotment_pending"].includes(a.status)
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="IPO Applications"
        description="Track your submitted IPO bids, UPI mandate authorizations, registrar allotment outcomes, and fund unblocking."
        actions={
          <Link href="/applications/new">
            <Button size="sm" variant="primary" leftIcon={<Plus className="w-3.5 h-3.5" />}>
              New Application
            </Button>
          </Link>
        }
      />

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Active Applications"
          value={activeApplications.length.toString()}
          icon={FileCheck2}
          subtext={`${totalCount} lifetime submitted`}
        />
        <StatCard
          title="Amount in Active Applications"
          value={formatINR(activeAmountTracked)}
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

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <Link href="/applications">
          <Button size="sm" variant={!params.status ? "primary" : "outline"}>
            All ({totalCount})
          </Button>
        </Link>
        <Link href="/applications?status=applied">
          <Button size="sm" variant={params.status === "applied" ? "primary" : "outline"}>
            Applied
          </Button>
        </Link>
        <Link href="/applications?status=mandate_pending">
          <Button size="sm" variant={params.status === "mandate_pending" ? "primary" : "outline"}>
            Mandate Pending
          </Button>
        </Link>
        <Link href="/applications?status=funds_blocked">
          <Button size="sm" variant={params.status === "funds_blocked" ? "primary" : "outline"}>
            Funds Blocked
          </Button>
        </Link>
        <Link href="/applications?status=allotted">
          <Button size="sm" variant={params.status === "allotted" ? "primary" : "outline"}>
            Allotted
          </Button>
        </Link>
        <Link href="/applications?status=completed">
          <Button size="sm" variant={params.status === "completed" ? "primary" : "outline"}>
            Completed
          </Button>
        </Link>
      </div>

      {applications.length === 0 ? (
        <EmptyState
          icon={FileCheck2}
          title="No applications found"
          description="When you apply for an IPO under Retail or HNI quotas, your application tracking and mandate events will appear here."
          actionLabel="Apply for an IPO"
          actionHref="/applications/new"
        />
      ) : (
        <Card className="border-[var(--border-subtle)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--bg-surface-elevated)]/40 border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">Application #</th>
                  <th className="py-2.5 px-4 font-semibold">Target IPO</th>
                  <th className="py-2.5 px-4 font-semibold">Applicant</th>
                  <th className="py-2.5 px-4 font-semibold">Quota</th>
                  <th className="py-2.5 px-4 text-right font-semibold">Lots (Qty)</th>
                  <th className="py-2.5 px-4 text-right font-semibold">Amount</th>
                  <th className="py-2.5 px-4 text-center font-semibold">Status</th>
                  <th className="py-2.5 px-4 font-semibold">Applied Date</th>
                  <th className="py-2.5 px-4 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]/60 text-[var(--text-primary)]">
                {applications.map((app) => {
                  const statusMeta = getApplicationStatusMeta(app.status);

                  return (
                    <tr key={app.id} className="hover:bg-[var(--bg-surface-elevated)]/20 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium text-[var(--brand-primary)]">
                        <Link href={`/applications/${app.id}`} className="hover:underline">
                          {app.application_number}
                        </Link>
                      </td>
                      <td className="py-3 px-4 font-semibold">
                        {app.ipo?.company_name || "IPO"}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-medium text-[var(--text-primary)]">
                          {app.applicant?.display_name}
                        </span>
                        <span className="block text-[10px] font-mono text-[var(--text-muted)]">
                          {app.applicant?.pan_masked}
                        </span>
                      </td>
                      <td className="py-3 px-4 uppercase text-[var(--text-secondary)] font-medium">
                        {app.investor_category}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {app.total_lots} Lots
                        <span className="block text-[10px] text-[var(--text-muted)]">
                          ({app.total_quantity} sh)
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-[var(--text-primary)]">
                        {formatINR(app.application_amount)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge variant={statusMeta.variant} size="sm">
                          {statusMeta.label}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-[var(--text-muted)]">
                        {formatDate(app.applied_at)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Link href={`/applications/${app.id}`}>
                          <Button size="sm" variant="ghost" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
                            Details
                          </Button>
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
