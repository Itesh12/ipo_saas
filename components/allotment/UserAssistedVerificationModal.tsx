"use client";

import React, { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ExternalLink, ShieldCheck, AlertTriangle } from "lucide-react";

interface UserAssistedVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  applicationId: string;
  companyName: string;
  registrarName: string;
  portalUrl: string;
  panMasked: string;
  applicationNumber: string;
  sharesApplied: number;
  issuePrice?: number;
  onSuccess: () => void;
}

export function UserAssistedVerificationModal({
  isOpen,
  onClose,
  applicationId,
  companyName,
  registrarName,
  portalUrl,
  panMasked,
  applicationNumber,
  sharesApplied,
  issuePrice = 100,
  onSuccess,
}: UserAssistedVerificationModalProps) {
  const [resultType, setResultType] = useState<"allotted" | "partially_allotted" | "not_allotted">("allotted");
  const [sharesAllotted, setSharesAllotted] = useState<number>(sharesApplied);
  const [registrarRef, setRegistrarRef] = useState<string>("");
  const [confirmed, setConfirmed] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleStatusChange = (val: "allotted" | "partially_allotted" | "not_allotted") => {
    setResultType(val);
    if (val === "allotted") {
      setSharesAllotted(sharesApplied);
    } else if (val === "not_allotted") {
      setSharesAllotted(0);
    } else {
      setSharesAllotted(Math.max(1, Math.floor(sharesApplied / 2)));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (sharesAllotted > sharesApplied) {
      setError(`Shares allotted (${sharesAllotted}) cannot exceed shares applied (${sharesApplied}).`);
      return;
    }

    if (resultType === "allotted" && sharesAllotted !== sharesApplied) {
      setError(`Full allotment requires shares allotted to equal applied shares (${sharesApplied}).`);
      return;
    }

    if (resultType === "not_allotted" && sharesAllotted !== 0) {
      setError("Non-allotment requires shares allotted to be 0.");
      return;
    }

    if (!confirmed) {
      setError("Please confirm you verified this outcome on the official portal.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/applications/${applicationId}/allotment-verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "user_assisted",
          resultType,
          sharesAllotted,
          allotmentPrice: issuePrice,
          registrarReference: registrarRef.trim() || undefined,
          observedAt: new Date().toISOString(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to record verified allotment outcome.");
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Verify Allotment at Official Registrar"
      description={`Official allotment verification for ${companyName}`}
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {/* Security / Zero-Credential Assurance */}
        <div className="p-3.5 rounded-xl bg-[var(--brand-primary)]/10 border border-[var(--brand-primary)]/30 text-[var(--text-secondary)] space-y-1.5">
          <div className="flex items-center gap-2 text-[var(--brand-primary)] font-semibold text-xs">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>Zero-Credential Security Architecture</span>
          </div>
          <p className="text-[11px] leading-relaxed">
            Never share or enter your UPI PIN, net banking credentials, or OTPs. Official registrar portals only require your PAN or Application Number to view allotment records.
          </p>
        </div>

        {/* Official Portal Direction */}
        <div className="p-4 rounded-xl bg-[var(--bg-surface-elevated)]/40 border border-[var(--border-subtle)] space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[11px] text-[var(--text-muted)] font-medium">Assigned Registrar</span>
              <p className="text-sm font-bold text-[var(--text-primary)]">{registrarName}</p>
            </div>
            <a
              href={portalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[var(--brand-primary)] text-white hover:opacity-90 transition-opacity shadow-xs"
            >
              <span>Open Portal</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--border-subtle)]/60 text-[11px]">
            <div>
              <span className="text-[var(--text-muted)]">Identifier (PAN):</span>
              <span className="ml-1.5 font-mono font-bold text-[var(--text-primary)]">{panMasked}</span>
            </div>
            <div>
              <span className="text-[var(--text-muted)]">Application No:</span>
              <span className="ml-1.5 font-mono font-bold text-[var(--text-primary)]">{applicationNumber || "N/A"}</span>
            </div>
          </div>
        </div>

        {/* Verification Form Inputs */}
        <div className="space-y-3 pt-1">
          <div className="space-y-1">
            <label className="block font-semibold text-[var(--text-primary)]">
              Observed Allotment Result
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleStatusChange("allotted")}
                className={`py-2 px-3 text-xs font-semibold rounded-lg border text-center transition-colors ${
                  resultType === "allotted"
                    ? "bg-[var(--status-success-bg)] border-[var(--status-success)] text-[var(--status-success)]"
                    : "bg-[var(--bg-surface-elevated)]/40 border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]"
                }`}
              >
                Allotted (Full)
              </button>
              <button
                type="button"
                onClick={() => handleStatusChange("partially_allotted")}
                className={`py-2 px-3 text-xs font-semibold rounded-lg border text-center transition-colors ${
                  resultType === "partially_allotted"
                    ? "bg-[var(--status-info-bg)] border-[var(--status-info)] text-[var(--status-info)]"
                    : "bg-[var(--bg-surface-elevated)]/40 border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]"
                }`}
              >
                Partially Allotted
              </button>
              <button
                type="button"
                onClick={() => handleStatusChange("not_allotted")}
                className={`py-2 px-3 text-xs font-semibold rounded-lg border text-center transition-colors ${
                  resultType === "not_allotted"
                    ? "bg-[var(--status-danger-bg)] border-[var(--status-danger)] text-[var(--status-danger)]"
                    : "bg-[var(--bg-surface-elevated)]/40 border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]"
                }`}
              >
                Not Allotted
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-[var(--text-primary)] mb-1">
                Shares Allotted
              </label>
              <Input
                type="number"
                min={0}
                max={sharesApplied}
                value={sharesAllotted}
                disabled={resultType === "not_allotted" || resultType === "allotted"}
                onChange={(e) => setSharesAllotted(parseInt(e.target.value, 10) || 0)}
              />
              <span className="text-[10px] text-[var(--text-muted)] mt-0.5 block">
                Total applied: {sharesApplied} shares
              </span>
            </div>

            <div>
              <label className="block font-semibold text-[var(--text-primary)] mb-1">
                Registrar Ref / Slip No (Optional)
              </label>
              <Input
                type="text"
                placeholder="e.g. LI-2026-9812"
                value={registrarRef}
                onChange={(e) => setRegistrarRef(e.target.value)}
              />
            </div>
          </div>

          <div className="pt-2">
            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 rounded border-[var(--border-subtle)] text-[var(--brand-primary)] focus:ring-[var(--brand-primary)]"
              />
              <span className="text-[11px] text-[var(--text-secondary)]">
                I verify that I inspected the official {registrarName} portal and this outcome matches the official record for application {applicationNumber || panMasked}.
              </span>
            </label>
          </div>
        </div>

        {error && (
          <div className="p-2.5 rounded-lg bg-[var(--status-danger-bg)] border border-[var(--status-danger)]/30 text-[var(--status-danger)] flex items-center gap-2 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={loading || !confirmed}>
            {loading ? "Recording..." : "Save Verified Result"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
