"use client";

import React, { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { ShieldCheck, Plus, Edit2 } from "lucide-react";
import { createApplicantAction, updateApplicantAction } from "@/features/application/actions/applicantActions";
import { ApplicantSummary } from "@/features/application/types/application.types";

interface ApplicantFormModalProps {
  initialApplicant?: ApplicantSummary | null;
  triggerButton?: React.ReactNode;
}

export function ApplicantFormModal({
  initialApplicant,
  triggerButton,
}: ApplicantFormModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = Boolean(initialApplicant);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);

    try {
      let res;
      if (isEditing && initialApplicant) {
        res = await updateApplicantAction(initialApplicant.id, formData);
      } else {
        res = await createApplicantAction(formData);
      }

      if (res.success) {
        setIsOpen(false);
      } else {
        setError(res.error || "Failed to save applicant.");
      }
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {triggerButton ? (
        <span onClick={() => setIsOpen(true)}>{triggerButton}</span>
      ) : isEditing ? (
        <Button
          size="sm"
          variant="outline"
          leftIcon={<Edit2 className="w-3.5 h-3.5" />}
          onClick={() => setIsOpen(true)}
        >
          Edit
        </Button>
      ) : (
        <Button
          size="sm"
          variant="primary"
          leftIcon={<Plus className="w-3.5 h-3.5" />}
          onClick={() => setIsOpen(true)}
        >
          Add Applicant Profile
        </Button>
      )}

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={isEditing ? "Edit Applicant Profile" : "Add Family & Friend Applicant"}
        description="Register a Demat profile to submit bids across multiple Retail and HNI application quotas."
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 text-xs rounded-lg bg-[var(--status-danger-bg)] text-[var(--status-danger)] border border-[var(--status-danger)]/20">
              {error}
            </div>
          )}

          <div className="p-3 rounded-lg bg-[var(--bg-surface-elevated)]/50 border border-[var(--border-subtle)] flex items-start gap-2.5 text-xs text-[var(--text-secondary)]">
            <ShieldCheck className="w-4 h-4 text-[var(--status-success)] shrink-0 mt-0.5" />
            <p>
              <strong>Masked Credential Storage:</strong> Only masked references (e.g. <code>ABCDE****F</code>) are persisted. We never request or store UPI PINs, net-banking passwords, or trading credentials.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[var(--text-secondary)]">
                Relationship <span className="text-red-500">*</span>
              </label>
              <Select
                name="relationship"
                defaultValue={initialApplicant?.relationship || "self"}
                required
              >
                <option value="self">Myself (Primary Account)</option>
                <option value="father">Father</option>
                <option value="mother">Mother</option>
                <option value="spouse">Spouse</option>
                <option value="son">Son</option>
                <option value="daughter">Daughter</option>
                <option value="brother">Brother</option>
                <option value="sister">Sister</option>
                <option value="friend">Friend / Relative</option>
                <option value="other">Other</option>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-[var(--text-secondary)]">
                Display Name / Tag <span className="text-red-500">*</span>
              </label>
              <Input
                name="display_name"
                placeholder="e.g. Father Account (HDFC Demat)"
                defaultValue={initialApplicant?.displayName || ""}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[var(--text-secondary)]">
                Permanent Account Number (PAN) <span className="text-red-500">*</span>
              </label>
              <Input
                name="pan"
                placeholder="e.g. ABCDE1234F"
                defaultValue={initialApplicant?.panMasked || ""}
                required
                className="uppercase"
              />
              <p className="text-[11px] text-[var(--text-muted)]">
                Automatically masked to <code>ABCDE****F</code> upon saving.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-[var(--text-secondary)]">
                Default Bidding Quota
              </label>
              <Select
                name="default_category"
                defaultValue={initialApplicant?.defaultCategory || "retail"}
              >
                <option value="retail">Retail Individual (up to ₹2L)</option>
                <option value="s_hni">sHNI (₹2L - ₹10L)</option>
                <option value="b_hni">bHNI (Above ₹10L)</option>
                <option value="employee">Employee Quota</option>
                <option value="shareholder">Shareholder Quota</option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[var(--text-secondary)]">
                Demat DP ID / Depository (Optional)
              </label>
              <Input
                name="demat_dp_id"
                placeholder="e.g. IN300123 or 12081600"
                defaultValue=""
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-[var(--text-secondary)]">
                Demat Client Beneficiary ID (Optional)
              </label>
              <Input
                name="demat_account_no"
                placeholder="e.g. 12345678"
                defaultValue=""
              />
              <p className="text-[11px] text-[var(--text-muted)]">
                Masked to <code>****5678</code>.
              </p>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-[var(--text-secondary)]">
              Primary UPI ID for Mandate Requests (Optional)
            </label>
            <Input
              name="upi_id"
              placeholder="e.g. rahul@okaxis, father@icici"
              defaultValue=""
            />
            <p className="text-[11px] text-[var(--text-muted)]">
              Masked to <code>ra***@okaxis</code>. Never share UPI PINs.
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-[var(--text-secondary)]">
              Personal Notes (Optional)
            </label>
            <Textarea
              name="notes"
              placeholder="e.g. Demat linked with HDFC Bank account ending in 4012"
              rows={2}
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--border-subtle)]">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? "Saving..." : isEditing ? "Update Profile" : "Register Applicant"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
