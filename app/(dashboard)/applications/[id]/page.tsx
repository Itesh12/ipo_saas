import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatINR, formatDate } from "@/lib/utils";
import { requireAuth } from "@/lib/security/auth-guards";
import { getApplicationDetailBundle } from "@/features/application/services/applicationService";
import { ApplicationTimeline } from "@/components/application/ApplicationTimeline";
import { MandateStatusCard } from "@/components/application/MandateStatusCard";
import { AllotmentCard } from "@/components/application/AllotmentCard";
import { AllotmentVerificationCard } from "@/components/allotment/AllotmentVerificationCard";
import { ApplicationEventsTable } from "@/components/application/ApplicationEventsTable";
import { cancelApplicationAction } from "@/features/application/actions/applicationActions";
import { ArrowLeft, Building2, User, Layers, Ban } from "lucide-react";

export const dynamic = "force-dynamic";

interface ApplicationDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ApplicationDetailPage({ params }: ApplicationDetailPageProps) {
  const { id } = await params;
  const user = await requireAuth();
  const userId = user.id;
  const isStaff = ["admin", "super_admin", "editor", "analyst"].includes(user.role);

  const bundle = await getApplicationDetailBundle(id, userId, isStaff);

  if (!bundle) {
    notFound();
  }

  const { application, applicant, ipo, bids, mandate, allotment, events } = bundle;

  // Cancellation is permitted from early stages before bidding closes
  const isCancellable = ["draft", "applied", "mandate_pending", "mandate_approved"].includes(
    application.status
  );

  const handleCancel = async () => {
    "use server";
    await cancelApplicationAction(id, "Cancelled by user");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/applications">
          <Button size="sm" variant="ghost" leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}>
            Back to Applications
          </Button>
        </Link>

        {isCancellable && (
          <form action={handleCancel}>
            <Button
              type="submit"
              size="sm"
              variant="danger"
              leftIcon={<Ban className="w-3.5 h-3.5" />}
            >
              Withdraw Application
            </Button>
          </form>
        )}
      </div>

      <PageHeader
        title={application.application_number}
        description={`Application submitted on ${formatDate(application.applied_at)} for ${ipo.company_name} (${application.investor_category.toUpperCase()} Quota).`}
      />

      {/* Visual Application Lifecycle Timeline */}
      <ApplicationTimeline status={application.status} appliedAt={application.applied_at} />

      {/* 4 Core Context Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* IPO Details Card */}
        <Card className="border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          <CardHeader className="py-3 px-5 bg-[var(--bg-surface-elevated)]/30 border-b border-[var(--border-subtle)] flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[var(--brand-primary)]" />
              <CardTitle className="text-sm">IPO Details</CardTitle>
            </div>
            <Link href={`/ipos/${ipo.slug}`} className="text-xs font-semibold text-[var(--brand-primary)] hover:underline">
              Research Terminal
            </Link>
          </CardHeader>
          <CardContent className="p-5 space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
              <span className="text-[var(--text-muted)]">Company Name</span>
              <span className="font-semibold text-[var(--text-primary)]">{ipo.company_name}</span>
            </div>
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
              <span className="text-[var(--text-muted)]">Price Band</span>
              <span className="font-semibold text-[var(--text-primary)]">
                ₹{ipo.price_band_low} - ₹{ipo.price_band_high}
              </span>
            </div>
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
              <span className="text-[var(--text-muted)]">Minimum Lot Size</span>
              <span className="font-semibold text-[var(--text-primary)]">{ipo.lot_size} shares</span>
            </div>
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
              <span className="text-[var(--text-muted)]">Issue Close Date</span>
              <span className="font-semibold text-[var(--text-primary)]">{formatDate(ipo.close_date)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-muted)]">Basis of Allotment</span>
              <span className="font-semibold text-[var(--text-primary)]">{formatDate(ipo.allotment_date)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Applicant Profile Card */}
        <Card className="border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          <CardHeader className="py-3 px-5 bg-[var(--bg-surface-elevated)]/30 border-b border-[var(--border-subtle)] flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-[var(--brand-primary)]" />
              <CardTitle className="text-sm">Applicant & Demat Profile</CardTitle>
            </div>
            <Badge variant="secondary" className="capitalize">
              {applicant.relationship}
            </Badge>
          </CardHeader>
          <CardContent className="p-5 space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
              <span className="text-[var(--text-muted)]">Applicant Name</span>
              <span className="font-semibold text-[var(--text-primary)]">{applicant.display_name}</span>
            </div>
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
              <span className="text-[var(--text-muted)]">Masked PAN</span>
              <span className="font-mono font-bold text-[var(--text-primary)]">{applicant.pan_masked}</span>
            </div>
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
              <span className="text-[var(--text-muted)]">Demat Account Reference</span>
              <span className="font-mono text-[var(--text-primary)]">
                {applicant.demat_account_no_masked || "—"}
              </span>
            </div>
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
              <span className="text-[var(--text-muted)]">Investor Quota</span>
              <span className="font-semibold uppercase text-[var(--text-primary)]">
                {application.investor_category}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-muted)]">Registered UPI Handle</span>
              <span className="font-mono text-[var(--text-primary)]">{mandate?.upi_id_masked || applicant.upi_id_masked || "—"}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bids Breakdown Table */}
      <Card className="border-[var(--border-subtle)] overflow-hidden">
        <CardHeader className="py-3 px-5 bg-[var(--bg-surface-elevated)]/30 border-b border-[var(--border-subtle)] flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[var(--brand-primary)]" />
            <CardTitle className="text-sm">Submitted Book-Building Bids</CardTitle>
          </div>
          <span className="text-xs text-[var(--text-muted)]">
            Margin Money Determined by Highest Bid Value
          </span>
        </CardHeader>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--bg-surface-elevated)]/40 border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
              <tr>
                <th className="py-2.5 px-4 font-semibold">Bid #</th>
                <th className="py-2.5 px-4 text-right font-semibold">Lots</th>
                <th className="py-2.5 px-4 text-right font-semibold">Quantity</th>
                <th className="py-2.5 px-4 text-right font-semibold">Bid Price (₹)</th>
                <th className="py-2.5 px-4 text-center font-semibold">Cut-off</th>
                <th className="py-2.5 px-4 text-right font-bold text-[var(--brand-primary)]">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]/60 text-[var(--text-primary)]">
              {bids.map((b) => (
                <tr key={b.id} className="hover:bg-[var(--bg-surface-elevated)]/20 transition-colors">
                  <td className="py-2.5 px-4 font-semibold">Bid #{b.bid_number}</td>
                  <td className="py-2.5 px-4 text-right">{b.lot_count}</td>
                  <td className="py-2.5 px-4 text-right">{b.quantity} shares</td>
                  <td className="py-2.5 px-4 text-right font-mono">₹{b.price}</td>
                  <td className="py-2.5 px-4 text-center">
                    {b.is_cutoff ? (
                      <Badge variant="success" size="sm">
                        Cut-off
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-right font-bold text-[var(--brand-primary)]">
                    {formatINR(b.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-[var(--bg-surface-elevated)]/30 border-t border-[var(--border-subtle)] font-bold">
              <tr>
                <td colSpan={5} className="py-3 px-4 text-right text-[var(--text-primary)]">
                  Total Application Amount (Lien Blocked):
                </td>
                <td className="py-3 px-4 text-right text-sm text-[var(--brand-primary)]">
                  {formatINR(application.application_amount)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* UPI Mandate Card */}
      <MandateStatusCard mandate={mandate} applicationAmount={application.application_amount} />

      {/* Registrar Allotment Verification Gateway (Stage 4) */}
      <AllotmentVerificationCard
        applicationId={application.id}
        companyName={ipo.company_name}
        registrarName={ipo.registrar_name}
        panMasked={applicant.pan_masked || "****"}
        applicationNumber={application.application_number}
        sharesApplied={application.total_quantity}
        issuePrice={ipo.price_band_high || 100}
      />

      {/* Registrar Allotment Card */}
      <AllotmentCard
        allotment={allotment}
        totalQuantity={application.total_quantity}
        totalLots={application.total_lots}
        applicationAmount={application.application_amount}
      />

      {/* Immutable Event Audit Log */}
      <ApplicationEventsTable events={events} />
    </div>
  );
}
