"use client";

import React from "react";
import {
  IPOAllotmentFactRow,
  IPOAllotmentEstimateRow,
  IPORegistrarPortalStatusRow,
  IPOAllotmentEventRow,
  IPORow,
} from "@/features/ipo/types/ipo.types";
import { formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { RegistrarPortalProbeService } from "@/features/external-integrations/subscription/registrarPortalProbeService";
import {
  CheckCircle2,
  ExternalLink,
  FileCheck2,
  AlertTriangle,
  Info,
  Scale,
} from "lucide-react";

interface IPOAllotmentCardProps {
  ipo: IPORow;
  facts: IPOAllotmentFactRow | null;
  estimates: IPOAllotmentEstimateRow | null;
  portalStatus: IPORegistrarPortalStatusRow | null;
  events: IPOAllotmentEventRow[];
}

const LIFECYCLE_STEPS = [
  { key: "bidding_closed", label: "Bidding Closed" },
  { key: "awaiting_basis", label: "Awaiting Basis" },
  { key: "basis_finalized", label: "Basis Finalized" },
  { key: "allotment_out", label: "Allotment Out" },
  { key: "refunds_initiated", label: "Refunds / Unfreeze" },
  { key: "demat_credited", label: "Demat Credited" },
  { key: "listed", label: "Listed on Exchange" },
];

export function IPOAllotmentCard({
  ipo,
  facts,
  estimates,
  portalStatus,
  events,
}: IPOAllotmentCardProps) {
  // Determine current lifecycle state
  const currentEvent = events.length > 0 ? events[events.length - 1].lifecycle_state : null;
  const activeStep = currentEvent || (facts ? "basis_finalized" : ipo.status === "allotment_pending" ? "awaiting_basis" : "bidding_closed");

  const activeIndex = LIFECYCLE_STEPS.findIndex((s) => s.key === activeStep);

  const portalStateInfo = portalStatus
    ? RegistrarPortalProbeService.formatStateLabel(portalStatus.query_state)
    : { label: "Awaiting Registrar Portal", variant: "warning" as const };

  return (
    <div className="space-y-6">
      {/* 1. Allotment Lifecycle Stepper */}
      <Card className="p-5 border-[var(--border-subtle)] overflow-hidden">
        <div className="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-[var(--brand-primary)]" />
            <h4 className="text-sm font-semibold text-[var(--text-primary)]">
              Allotment & Settlement Lifecycle
            </h4>
          </div>
          <span className="text-xs text-[var(--text-muted)]">
            Registrar: <strong className="text-[var(--text-primary)]">{ipo.registrar_name || "TBA"}</strong>
          </span>
        </div>

        <div className="py-4 overflow-x-auto">
          <div className="flex items-center min-w-[650px] justify-between relative">
            {LIFECYCLE_STEPS.map((step, idx) => {
              const isDone = activeIndex >= idx;
              const isCurrent = activeIndex === idx;

              return (
                <div key={step.key} className="flex flex-col items-center relative z-10 flex-1">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      isDone
                        ? "bg-[var(--brand-primary)] text-white shadow-sm"
                        : "bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-muted)]"
                    }`}
                  >
                    {isDone ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                  </div>
                  <span
                    className={`text-[11px] mt-2 text-center font-medium ${
                      isCurrent
                        ? "text-[var(--brand-primary)] font-bold"
                        : isDone
                        ? "text-[var(--text-primary)]"
                        : "text-[var(--text-muted)]"
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* 2. Official Facts vs Estimated Allotment Odds */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left Column: Official Basis Facts (if available) OR Pre-Basis Estimates */}
        {facts ? (
          <Card className="p-5 border-emerald-500/30 bg-emerald-500/5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-emerald-400" />
                <h4 className="text-sm font-bold text-[var(--text-primary)]">
                  Official Basis of Allotment Facts
                </h4>
              </div>
              <Badge variant="success" size="sm">
                Official Document Verified
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-0.5">
                <span className="text-[10px] text-[var(--text-muted)]">Retail Lottery Ratio</span>
                <p className="text-base font-bold text-emerald-400">
                  1 in {facts.official_retail_lottery_ratio.toFixed(2)}
                </p>
                <span className="text-[10px] text-[var(--text-secondary)]">
                  {((1 / facts.official_retail_lottery_ratio) * 100).toFixed(2)}% probability
                </span>
              </div>

              <div className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-0.5">
                <span className="text-[10px] text-[var(--text-muted)]">Successful Retail Applicants</span>
                <p className="text-base font-bold text-[var(--text-primary)] font-mono">
                  {facts.official_retail_successful_applicants.toLocaleString()}
                </p>
                <span className="text-[10px] text-[var(--text-secondary)]">
                  out of {facts.official_retail_valid_applications.toLocaleString()} valid
                </span>
              </div>

              <div className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-0.5">
                <span className="text-[10px] text-[var(--text-muted)]">Total Valid Applications</span>
                <p className="text-base font-bold text-[var(--text-primary)] font-mono">
                  {facts.official_total_valid_applications.toLocaleString()}
                </p>
                <span className="text-[10px] text-[var(--text-secondary)]">
                  {facts.official_total_rejected_applications.toLocaleString()} rejected
                </span>
              </div>

              <div className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-0.5">
                <span className="text-[10px] text-[var(--text-muted)]">sHNI (&lt;10L) Lottery Ratio</span>
                <p className="text-base font-bold text-[var(--text-primary)]">
                  {facts.official_shni_lottery_ratio
                    ? `1 in ${facts.official_shni_lottery_ratio.toFixed(2)}`
                    : "—"}
                </p>
                <span className="text-[10px] text-[var(--text-secondary)]">Small NII allocation</span>
              </div>
            </div>

            {facts.basis_document_id && (
              <a
                href={`/api/documents/${facts.basis_document_id}/download`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-[var(--brand-primary)] font-semibold hover:underline"
              >
                <FileCheck2 className="w-3.5 h-3.5" /> Download Official Basis of Allotment Filing (PDF)
              </a>
            )}
          </Card>
        ) : (
          <Card className="p-5 border-amber-500/30 bg-amber-500/5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-amber-400" />
                <h4 className="text-sm font-bold text-[var(--text-primary)]">
                  Estimated Retail Allotment Odds
                </h4>
              </div>
              <Badge variant="warning" size="sm">
                Pre-Basis Estimate
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-0.5">
                <span className="text-[10px] text-[var(--text-muted)]">Estimated Retail Ratio</span>
                <p className="text-base font-bold text-amber-400">
                  {estimates ? `~1 in ${estimates.estimated_retail_lottery_ratio.toFixed(1)}` : "—"}
                </p>
                <span className="text-[10px] text-[var(--text-secondary)]">based on final bidding</span>
              </div>

              <div className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-0.5">
                <span className="text-[10px] text-[var(--text-muted)]">Estimated 1-Lot Probability</span>
                <p className="text-base font-bold text-[var(--text-primary)]">
                  {estimates ? `${estimates.estimated_retail_allotment_probability_pct.toFixed(1)}%` : "—"}
                </p>
                <span className="text-[10px] text-[var(--text-secondary)]">minimum lottery odds</span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                {estimates?.estimation_disclaimer ||
                  "Simplified mathematical indicator based on bidding multiples. Official allotment odds are finalized upon publication of the Basis of Allotment."}
              </span>
            </div>
          </Card>
        )}

        {/* Right Column: Observable Registrar Query Portal Status */}
        <Card className="p-5 border-[var(--border-subtle)] space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ExternalLink className="w-4 h-4 text-[var(--brand-primary)]" />
              <h4 className="text-sm font-bold text-[var(--text-primary)]">
                Registrar Allotment Query Portal
              </h4>
            </div>
            <Badge variant={portalStateInfo.variant} size="sm">
              {portalStateInfo.label}
            </Badge>
          </div>

          <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/30 space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-[var(--text-muted)]">Official Registrar:</span>
              <span className="font-semibold text-[var(--text-primary)]">{ipo.registrar_name || "TBA"}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[var(--text-muted)]">Company Detected in Query Selector:</span>
              <span className="font-semibold text-[var(--text-primary)]">
                {portalStatus?.company_detected_in_dropdown ? "Yes (Active)" : "Pending Announcement"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[var(--text-muted)]">Expected Allotment Date:</span>
              <span className="font-semibold text-[var(--text-primary)]">{formatDate(ipo.allotment_date)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[var(--text-muted)]">Expected Listing Date:</span>
              <span className="font-semibold text-[var(--text-primary)]">{formatDate(ipo.listing_date)}</span>
            </div>
          </div>

          {portalStatus?.portal_url ? (
            <a
              href={portalStatus.portal_url}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full inline-flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-[var(--brand-primary)] text-white text-xs font-semibold hover:opacity-90 transition-opacity"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Check Allotment on {portalStatus.registrar_name || "Registrar"}
            </a>
          ) : (
            <div className="text-center py-2 text-xs text-[var(--text-muted)]">
              Official registrar query link will be verified and displayed once published.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
