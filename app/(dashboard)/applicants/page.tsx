import React from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Users2, ShieldCheck, CheckCircle2, XCircle } from "lucide-react";
import { requireAuth } from "@/lib/security/auth-guards";
import { getApplicantsForUser } from "@/features/application/services/applicantService";
import { ApplicantFormModal } from "@/components/application/ApplicantFormModal";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ApplicantsPage() {
  const user = await requireAuth();
  const userId = user.id;

  const applicants = await getApplicantsForUser(userId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Family & Friends Applicants"
        description="Manage Demat accounts and applicant profiles for family members to apply across multiple retail and HNI quotas."
        actions={<ApplicantFormModal />}
      />

      {/* Security Assurance Banner */}
      <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-start gap-3 text-xs text-[var(--text-secondary)] shadow-xs">
        <ShieldCheck className="w-4 h-4 text-[var(--status-success)] shrink-0 mt-0.5" />
        <p>
          <strong>Zero Sensitive Credential Storage:</strong> In compliance with SEBI and privacy guidelines, Permanent Account Numbers (PAN), Demat beneficiary IDs, and UPI handles are strictly masked (e.g. <code>ABCDE****F</code>). We never store or request banking passwords, trading credentials, or UPI PINs.
        </p>
      </div>

      {applicants.length === 0 ? (
        <EmptyState
          icon={Users2}
          title="No applicant profiles yet"
          description="Add Demat account profiles for yourself and family members to bid across independent quotas."
          actionLabel="Add First Applicant"
          actionComponent={<ApplicantFormModal />}
        />
      ) : (
        <Card className="border-[var(--border-subtle)] overflow-hidden">
          <CardHeader className="py-3 px-5 bg-[var(--bg-surface-elevated)]/30 border-b border-[var(--border-subtle)] flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Users2 className="w-4 h-4 text-[var(--brand-primary)]" />
              <CardTitle className="text-sm">Registered Applicant Profiles</CardTitle>
            </div>
            <span className="text-xs text-[var(--text-muted)]">{applicants.length} Profiles</span>
          </CardHeader>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--bg-surface-elevated)]/40 border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">Applicant Name</th>
                  <th className="py-2.5 px-4 font-semibold">Relationship</th>
                  <th className="py-2.5 px-4 font-semibold">Masked PAN</th>
                  <th className="py-2.5 px-4 font-semibold">Demat Reference</th>
                  <th className="py-2.5 px-4 font-semibold">Default Quota</th>
                  <th className="py-2.5 px-4 text-center font-semibold">Applications</th>
                  <th className="py-2.5 px-4 text-center font-semibold">Status</th>
                  <th className="py-2.5 px-4 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]/60 text-[var(--text-primary)]">
                {applicants.map((app) => (
                  <tr key={app.id} className="hover:bg-[var(--bg-surface-elevated)]/20 transition-colors">
                    <td className="py-3 px-4 font-semibold">
                      {app.displayName}
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant="secondary" size="sm" className="capitalize">
                        {app.relationship}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 font-mono font-medium">
                      {app.panMasked}
                    </td>
                    <td className="py-3 px-4 text-[var(--text-secondary)] truncate max-w-[140px]">
                      {app.dematMasked}
                    </td>
                    <td className="py-3 px-4 uppercase text-[var(--text-secondary)] font-medium">
                      {app.defaultCategory}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[var(--bg-surface-elevated)] font-semibold text-[11px]">
                        {app.applicationCount} Bids
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {app.isActive ? (
                        <span className="inline-flex items-center gap-1 text-[var(--status-success)] text-[11px] font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[var(--text-muted)] text-[11px]">
                          <XCircle className="w-3.5 h-3.5" /> Inactive
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right space-x-2">
                      <ApplicantFormModal initialApplicant={app} />
                      <Link
                        href={`/applications/new?applicantId=${app.id}`}
                        className="text-xs font-semibold text-[var(--brand-primary)] hover:underline inline-block ml-2"
                      >
                        Apply
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
