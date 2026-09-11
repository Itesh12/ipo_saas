import React from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { getAllApplicantsAdmin } from "@/features/application/services/applicantService";
import { requireRole } from "@/lib/security/auth-guards";
import { Users2, ShieldCheck, CheckCircle2, XCircle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminApplicantsPage() {
  await requireRole("admin");

  const applicants = await getAllApplicantsAdmin();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Global Applicant Registry"
        description="Inspect registered Demat applicant profiles across platform users with masked PII."
      />

      <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-start gap-2.5 text-xs text-[var(--text-secondary)]">
        <ShieldCheck className="w-4 h-4 text-[var(--status-success)] shrink-0 mt-0.5" />
        <p>
          <strong>Privacy & PII Assurance:</strong> Financial identity references (PAN, Demat account numbers, UPI handles) are strictly masked in the registry. Never store or request raw banking credentials.
        </p>
      </div>

      <Card className="border-[var(--border-subtle)] overflow-hidden">
        <CardHeader className="py-3 px-5 bg-[var(--bg-surface-elevated)]/30 border-b border-[var(--border-subtle)] flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Users2 className="w-4 h-4 text-[var(--brand-primary)]" />
            <CardTitle className="text-sm">Registered Profiles Directory</CardTitle>
          </div>
          <span className="text-xs text-[var(--text-muted)]">{applicants.length} Applicants</span>
        </CardHeader>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--bg-surface-elevated)]/40 border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
              <tr>
                <th className="py-2.5 px-4 font-semibold">Applicant Name</th>
                <th className="py-2.5 px-4 font-semibold">Relationship</th>
                <th className="py-2.5 px-4 font-semibold">Masked PAN</th>
                <th className="py-2.5 px-4 font-semibold">Demat Reference</th>
                <th className="py-2.5 px-4 font-semibold">User Account</th>
                <th className="py-2.5 px-4 text-center font-semibold">Applications</th>
                <th className="py-2.5 px-4 text-center font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]/60 text-[var(--text-primary)]">
              {applicants.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-xs text-[var(--text-muted)]">
                    No applicants registered across the platform yet.
                  </td>
                </tr>
              ) : (
                applicants.map((app) => (
                  <tr key={app.id} className="hover:bg-[var(--bg-surface-elevated)]/20 transition-colors">
                    <td className="py-3 px-4 font-semibold">{app.display_name}</td>
                    <td className="py-3 px-4">
                      <Badge variant="secondary" size="sm" className="capitalize">
                        {app.relationship}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-[var(--text-primary)]">
                      {app.pan_masked}
                    </td>
                    <td className="py-3 px-4 text-[var(--text-secondary)]">
                      {app.demat_account_no_masked || "—"}
                    </td>
                    <td className="py-3 px-4 text-[var(--text-muted)] truncate max-w-[180px]">
                      {app.user_email || app.user_name || "User"}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[var(--bg-surface-elevated)] font-semibold text-[11px]">
                        {app.application_count || 0}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {app.is_active ? (
                        <span className="inline-flex items-center gap-1 text-[var(--status-success)] text-[11px] font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[var(--text-muted)] text-[11px]">
                          <XCircle className="w-3.5 h-3.5" /> Inactive
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
