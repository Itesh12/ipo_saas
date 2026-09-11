import React from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatINR, formatDate } from "@/lib/utils";
import { getApplicationsAdmin } from "@/features/application/services/applicationService";
import { getApplicationStatusMeta } from "@/features/application/services/applicationLifecycle";
import { AdminApplicationActionsModal } from "@/components/application/AdminApplicationActionsModal";
import { FileText, ShieldAlert } from "lucide-react";

export const dynamic = "force-dynamic";

interface AdminApplicationsPageProps {
  searchParams: Promise<{
    status?: string;
    ipoId?: string;
  }>;
}

export default async function AdminApplicationsPage({ searchParams }: AdminApplicationsPageProps) {
  const params = await searchParams;
  const applications = await getApplicationsAdmin({
    status: params.status,
    ipoId: params.ipoId,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Global Applications Management"
        description="Monitor platform-wide IPO bids, record registrar allotment outcomes, and update UPI mandate tracking."
      />

      <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-start gap-2.5 text-xs text-[var(--text-secondary)]">
        <ShieldAlert className="w-4 h-4 text-[var(--brand-primary)] shrink-0 mt-0.5" />
        <p>
          <strong>Operational Control:</strong> Authorized staff can advance UPI mandate progression (e.g. mark approved or lien blocked), record registrar share allocations with the final allotment price, and queue surplus unblocking.
        </p>
      </div>

      <Card className="border-[var(--border-subtle)] overflow-hidden">
        <CardHeader className="py-3 px-5 bg-[var(--bg-surface-elevated)]/30 border-b border-[var(--border-subtle)] flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[var(--brand-primary)]" />
            <CardTitle className="text-sm">Platform Applications Directory</CardTitle>
          </div>
          <span className="text-xs text-[var(--text-muted)]">{applications.length} Applications</span>
        </CardHeader>

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
                <th className="py-2.5 px-4 font-semibold">Applied At</th>
                <th className="py-2.5 px-4 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]/60 text-[var(--text-primary)]">
              {applications.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-xs text-[var(--text-muted)]">
                    No applications recorded yet.
                  </td>
                </tr>
              ) : (
                applications.map((app) => {
                  const statusMeta = getApplicationStatusMeta(app.status);

                  return (
                    <tr key={app.id} className="hover:bg-[var(--bg-surface-elevated)]/20 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium text-[var(--brand-primary)]">
                        {app.application_number}
                      </td>
                      <td className="py-3 px-4 font-semibold">
                        {app.ipo?.company_name}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-medium text-[var(--text-primary)]">{app.applicant?.display_name}</span>
                        <span className="block text-[10px] font-mono text-[var(--text-muted)]">{app.applicant?.pan_masked}</span>
                      </td>
                      <td className="py-3 px-4 uppercase text-[var(--text-secondary)] font-medium">
                        {app.investor_category}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {app.total_lots} Lots ({app.total_quantity} sh)
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
                        <AdminApplicationActionsModal application={app} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
