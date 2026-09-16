"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  ShieldCheck,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  History,
  AlertCircle,
  FileCheck2,
} from "lucide-react";
import { UserAssistedVerificationModal } from "./UserAssistedVerificationModal";

interface AttemptRecord {
  id: string;
  attempt_number: number;
  verification_mode: string;
  attempt_status: string;
  verification_result: string;
  lookup_identifier_masked: string;
  evidence_classification: string;
  created_at: string;
  error_message?: string | null;
}

interface ProjectionRecord {
  evidence_classification: string;
  shares_applied: number;
  shares_allotted: number;
  lots_allotted: number;
  allotment_price?: number | null;
  reported_refund_amount: number;
  has_conflict: boolean;
  conflict_details?: string | null;
  last_verified_at?: string | null;
}

interface AllotmentVerificationCardProps {
  applicationId: string;
  companyName: string;
  registrarName?: string | null;
  panMasked: string;
  applicationNumber: string;
  sharesApplied: number;
  issuePrice?: number;
  onRefresh?: () => void;
}

export function AllotmentVerificationCard({
  applicationId,
  companyName,
  registrarName = "Registrar",
  panMasked,
  applicationNumber,
  sharesApplied,
  issuePrice = 100,
  onRefresh,
}: AllotmentVerificationCardProps) {
  const [loading, setLoading] = useState(false);
  const [projection, setProjection] = useState<ProjectionRecord | null>(null);
  const [attempts, setAttempts] = useState<AttemptRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [portalUrl, setPortalUrl] = useState<string>(
    "https://linkintime.co.in/initial_offer/public-issues.html"
  );
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/applications/${applicationId}/allotment-verify`);
      if (res.ok) {
        const data = await res.json();
        if (data.projection) setProjection(data.projection);
        if (data.attempts) setAttempts(data.attempts);
      }
    } catch {
      // Background poll failure silent
    }
  }, [applicationId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleVerify = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/applications/${applicationId}/allotment-verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceRefresh: true }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          setError("A verification process is already underway. Please wait.");
        } else {
          setError(data.error || "Verification check failed.");
        }
        return;
      }

      if (data.challengeRequired || data.status === "challenge_required") {
        if (data.challengePayload?.portalUrl) {
          setPortalUrl(data.challengePayload.portalUrl);
        }
        setIsModalOpen(true);
      } else if (data.projection) {
        setProjection(data.projection);
        fetchStatus();
        if (onRefresh) onRefresh();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const classification = projection?.evidence_classification || "UNVERIFIED";

  const getBadge = () => {
    switch (classification) {
      case "REGISTRAR_CONFIRMED":
        return <Badge variant="success">Registrar Confirmed</Badge>;
      case "USER_PROVIDED":
        return <Badge variant="info">User Assisted Verified</Badge>;
      case "CONFLICTED":
        return <Badge variant="danger">Discrepancy / Conflicted</Badge>;
      default:
        return <Badge variant="warning">Unverified</Badge>;
    }
  };

  return (
    <Card className="border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      <CardHeader className="py-3 px-5 bg-[var(--bg-surface-elevated)]/30 border-b border-[var(--border-subtle)] flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[var(--brand-primary)]" />
          <CardTitle className="text-sm">Registrar Allotment Gateway (Stage 4)</CardTitle>
        </div>
        {getBadge()}
      </CardHeader>

      <CardContent className="p-5 space-y-4 text-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-[var(--bg-surface-elevated)]/40 border border-[var(--border-subtle)]">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[var(--text-primary)]">{registrarName || "Official Registrar"}</span>
              <span className="text-[var(--text-muted)]">•</span>
              <span className="text-[11px] text-[var(--text-muted)]">Lookup PAN: {panMasked}</span>
            </div>
            <p className="text-[11px] text-[var(--text-secondary)]">
              {projection?.last_verified_at
                ? `Last verified on ${new Date(projection.last_verified_at).toLocaleString("en-IN")}`
                : "No verified registrar allotment record linked yet."}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsModalOpen(true)}
              className="text-xs"
            >
              <ExternalLink className="w-3.5 h-3.5 mr-1" />
              <span>Assisted Check</span>
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleVerify}
              disabled={loading}
              className="text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
              <span>{loading ? "Verifying..." : "Verify Allotment"}</span>
            </Button>
          </div>
        </div>

        {error && (
          <div className="p-2.5 rounded-lg bg-[var(--status-danger-bg)] border border-[var(--status-danger)]/30 text-[var(--status-danger)] flex items-center gap-2 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Audit Verification Attempts Expander */}
        {attempts.length > 0 && (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center justify-between w-full py-1.5 text-left text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors select-none"
            >
              <div className="flex items-center gap-1.5">
                <History className="w-3.5 h-3.5" />
                <span>Verification Audit Ledger ({attempts.length} attempts recorded)</span>
              </div>
              {showHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showHistory && (
              <div className="mt-2 space-y-2 max-h-48 overflow-y-auto pr-1">
                {attempts.map((att) => (
                  <div
                    key={att.id}
                    className="p-2.5 rounded-lg bg-[var(--bg-surface-elevated)]/20 border border-[var(--border-subtle)] text-[11px] flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[var(--text-primary)]">
                          Attempt #{att.attempt_number}
                        </span>
                        <span className="text-[var(--text-muted)]">({att.verification_mode})</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-[var(--bg-surface-hover)] text-[var(--text-secondary)]">
                          {att.attempt_status}
                        </span>
                      </div>
                      <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                        {new Date(att.created_at).toLocaleString("en-IN")} • Masked ID: {att.lookup_identifier_masked}
                      </p>
                    </div>

                    <div className="text-right">
                      <span
                        className={`font-semibold capitalize ${
                          att.verification_result === "allotted"
                            ? "text-[var(--status-success)]"
                            : att.verification_result === "partially_allotted"
                            ? "text-[var(--status-info)]"
                            : "text-[var(--text-muted)]"
                        }`}
                      >
                        {att.verification_result.replace("_", " ")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>

      <UserAssistedVerificationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        applicationId={applicationId}
        companyName={companyName}
        registrarName={registrarName || "Official Registrar"}
        portalUrl={portalUrl}
        panMasked={panMasked}
        applicationNumber={applicationNumber}
        sharesApplied={sharesApplied}
        issuePrice={issuePrice}
        onSuccess={() => {
          fetchStatus();
          if (onRefresh) onRefresh();
        }}
      />
    </Card>
  );
}
