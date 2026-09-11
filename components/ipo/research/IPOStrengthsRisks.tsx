"use client";

import React from "react";
import { IPOStrengthRow, IPORiskRow } from "@/features/ipo/types/ipo.types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CheckCircle2, AlertTriangle, ShieldCheck, ShieldAlert } from "lucide-react";

interface IPOStrengthsRisksProps {
  strengths: IPOStrengthRow[];
  risks: IPORiskRow[];
}

export function IPOStrengthsRisks({ strengths, risks }: IPOStrengthsRisksProps) {
  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "high":
        return <Badge variant="danger" size="sm">High Severity</Badge>;
      case "medium":
        return <Badge variant="warning" size="sm">Medium</Badge>;
      case "low":
        return <Badge variant="secondary" size="sm">Low</Badge>;
      default:
        return <Badge variant="secondary" size="sm">{severity}</Badge>;
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Competitive Strengths */}
      <Card className="border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <CardHeader className="py-3.5 px-5 bg-[var(--status-success)]/10 border-b border-[var(--border-subtle)] flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[var(--status-success)]" />
            <CardTitle className="text-sm">Key Investment Strengths</CardTitle>
          </div>
          <span className="text-xs text-[var(--text-muted)]">{strengths.length} Highlights</span>
        </CardHeader>

        <CardContent className="p-5 space-y-4">
          {strengths.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] py-4 text-center">
              Strengths analysis pending detailed RHP prospectus review.
            </p>
          ) : (
            strengths.map((str) => (
              <div key={str.id} className="flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-[var(--status-success)] shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <h5 className="text-xs font-semibold text-[var(--text-primary)]">{str.title}</h5>
                  {str.description && (
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{str.description}</p>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Material Risk Factors */}
      <Card className="border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <CardHeader className="py-3.5 px-5 bg-[var(--status-danger)]/10 border-b border-[var(--border-subtle)] flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-[var(--status-danger)]" />
            <CardTitle className="text-sm">Material Risk Disclosures</CardTitle>
          </div>
          <span className="text-xs text-[var(--text-muted)]">Source: RHP Risk Factors</span>
        </CardHeader>

        <CardContent className="p-5 space-y-4">
          {risks.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] py-4 text-center">
              Risk factor categorization in progress.
            </p>
          ) : (
            risks.map((risk) => (
              <div
                key={risk.id}
                className="p-3 rounded-lg bg-[var(--bg-surface-elevated)]/40 border border-[var(--border-subtle)] space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-[var(--status-warning)] shrink-0" />
                    <h5 className="text-xs font-semibold text-[var(--text-primary)]">{risk.title}</h5>
                  </div>
                  {getSeverityBadge(risk.severity)}
                </div>
                {risk.description && (
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{risk.description}</p>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
