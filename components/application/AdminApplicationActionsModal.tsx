"use client";

import React, { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  staffUpdateMandateAction,
  staffRecordAllotmentAction,
  staffProcessRefundAction,
} from "@/features/application/actions/applicationActions";
import { ApplicationListItem } from "@/features/application/types/application.types";
import { Settings2, Smartphone, PieChart, RefreshCw } from "lucide-react";

interface AdminApplicationActionsModalProps {
  application: ApplicationListItem;
}

export function AdminApplicationActionsModal({
  application,
}: AdminApplicationActionsModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<"mandate" | "allotment" | "refund">("mandate");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleMandateSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const formData = new FormData(e.currentTarget);
    const status = formData.get("mandate_status") as never;
    const provider = (formData.get("provider") as string) || "BHIM_UPI";
    const ref = (formData.get("provider_reference") as string) || null;
    const blockedAmount = parseFloat(formData.get("blocked_amount") as string) || application.application_amount;

    const res = await staffUpdateMandateAction({
      application_id: application.id,
      mandate_status: status,
      provider,
      provider_reference: ref,
      blocked_amount: blockedAmount,
    });

    setLoading(false);
    if (res.success) {
      setSuccess("Mandate status updated successfully.");
      setTimeout(() => setIsOpen(false), 800);
    } else {
      setError(res.error || "Failed to update mandate.");
    }
  };

  const handleAllotmentSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const formData = new FormData(e.currentTarget);
    const status = formData.get("allotment_status") as never;
    const sharesAllotted = parseInt(formData.get("shares_allotted") as string) || 0;
    const allotmentPrice = parseFloat(formData.get("allotment_price") as string) || application.bid_price;
    const basisRef = (formData.get("basis_of_allotment_ref") as string) || null;

    const res = await staffRecordAllotmentAction({
      application_id: application.id,
      allotment_status: status,
      shares_allotted: sharesAllotted,
      allotment_price: allotmentPrice,
      basis_of_allotment_ref: basisRef,
    });

    setLoading(false);
    if (res.success) {
      setSuccess("Allotment outcome recorded successfully.");
      setTimeout(() => setIsOpen(false), 800);
    } else {
      setError(res.error || "Failed to record allotment.");
    }
  };

  const handleProcessRefund = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    const res = await staffProcessRefundAction(application.id);
    setLoading(false);
    if (res.success) {
      setSuccess("Refund processed and funds unblocked.");
      setTimeout(() => setIsOpen(false), 800);
    } else {
      setError(res.error || "Failed to process refund.");
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        leftIcon={<Settings2 className="w-3 h-3" />}
        onClick={() => setIsOpen(true)}
      >
        Manage
      </Button>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={`Manage Application: ${application.application_number}`}
        description={`Target IPO: ${application.ipo?.company_name} | Applicant: ${application.applicant?.display_name}`}
        size="lg"
      >
        <div className="space-y-4">
          {error && (
            <div className="p-3 text-xs rounded-lg bg-[var(--status-danger-bg)] text-[var(--status-danger)]">
              {error}
            </div>
          )}
          {success && (
            <div className="p-3 text-xs rounded-lg bg-[var(--status-success-bg)] text-[var(--status-success)]">
              {success}
            </div>
          )}

          {/* Action Tabs */}
          <div className="flex border-b border-[var(--border-subtle)] text-xs font-semibold">
            <button
              onClick={() => setTab("mandate")}
              className={`pb-2 px-3 flex items-center gap-1.5 border-b-2 transition-colors ${
                tab === "mandate"
                  ? "border-[var(--brand-primary)] text-[var(--brand-primary)]"
                  : "border-transparent text-[var(--text-muted)]"
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" /> Mandate Tracking
            </button>
            <button
              onClick={() => setTab("allotment")}
              className={`pb-2 px-3 flex items-center gap-1.5 border-b-2 transition-colors ${
                tab === "allotment"
                  ? "border-[var(--brand-primary)] text-[var(--brand-primary)]"
                  : "border-transparent text-[var(--text-muted)]"
              }`}
            >
              <PieChart className="w-3.5 h-3.5" /> Allotment Record
            </button>
            <button
              onClick={() => setTab("refund")}
              className={`pb-2 px-3 flex items-center gap-1.5 border-b-2 transition-colors ${
                tab === "refund"
                  ? "border-[var(--brand-primary)] text-[var(--brand-primary)]"
                  : "border-transparent text-[var(--text-muted)]"
              }`}
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refund / Unblock
            </button>
          </div>

          {/* TAB 1: Mandate Tracking */}
          {tab === "mandate" && (
            <form onSubmit={handleMandateSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-[var(--text-secondary)]">Mandate Status</label>
                  <Select name="mandate_status" defaultValue={application.mandate_status || "approved"}>
                    <option value="created">Created (Pending Request)</option>
                    <option value="pending">Pending Authorization</option>
                    <option value="approved">Approved by Investor</option>
                    <option value="blocked">Funds Lien Blocked</option>
                    <option value="rejected">Rejected by Investor</option>
                    <option value="unblocked">Unblocked by Bank</option>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-[var(--text-secondary)]">Provider Reference</label>
                  <Input name="provider_reference" placeholder="e.g. UMRN-202609-88123" defaultValue="" />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-[var(--text-secondary)]">Lien Blocked Amount (₹)</label>
                <Input
                  name="blocked_amount"
                  type="number"
                  defaultValue={application.blocked_amount || application.application_amount}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="submit" variant="primary" disabled={loading}>
                  {loading ? "Updating..." : "Update Mandate Status"}
                </Button>
              </div>
            </form>
          )}

          {/* TAB 2: Allotment Record */}
          {tab === "allotment" && (
            <form onSubmit={handleAllotmentSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-[var(--text-secondary)]">Registrar Outcome</label>
                  <Select name="allotment_status" defaultValue="allotted">
                    <option value="allotted">Allotted (Full Allocation)</option>
                    <option value="partially_allotted">Partially Allotted</option>
                    <option value="not_allotted">Not Allotted (Zero)</option>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-[var(--text-secondary)]">Shares Allotted</label>
                  <Input
                    name="shares_allotted"
                    type="number"
                    defaultValue={application.total_quantity}
                    min={0}
                  />
                  <span className="text-[10px] text-[var(--text-muted)]">
                    Applied: {application.total_quantity} shares ({application.total_lots} lots)
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-[var(--text-secondary)]">Final Allotment Price (₹)</label>
                  <Input
                    name="allotment_price"
                    type="number"
                    step="0.05"
                    defaultValue={application.bid_price}
                    required
                  />
                  <span className="text-[10px] text-[var(--text-muted)]">
                    Registrar discovered cutoff price
                  </span>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-[var(--text-secondary)]">Basis of Allotment Ref</label>
                  <Input
                    name="basis_of_allotment_ref"
                    placeholder="e.g. BOA-KFIN-20260910"
                    defaultValue=""
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="submit" variant="primary" disabled={loading}>
                  {loading ? "Recording..." : "Record Allotment Outcome"}
                </Button>
              </div>
            </form>
          )}

          {/* TAB 3: Refund & Unblock */}
          {tab === "refund" && (
            <div className="space-y-4 text-xs">
              <p className="text-[var(--text-secondary)]">
                Trigger refund processing for unallotted application balances. This will advance the application status through <code>refund_completed</code> &rarr; <code>funds_unblocked</code> &rarr; <code>completed</code>.
              </p>

              <div className="p-3.5 rounded-lg bg-[var(--bg-surface-elevated)]/40 border border-[var(--border-subtle)] space-y-1">
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Application Amount:</span>
                  <span className="font-bold">₹{application.application_amount.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Refund / Unblock Expected:</span>
                  <span className="font-bold text-[var(--brand-primary)]">
                    ₹{(application.refund_amount || application.application_amount).toLocaleString("en-IN")}
                  </span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="primary"
                  disabled={loading}
                  onClick={handleProcessRefund}
                >
                  {loading ? "Processing..." : "Mark Refund Completed & Unblock Funds"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
