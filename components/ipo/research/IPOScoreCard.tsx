"use client";

import React from "react";
import { IPOScoreRow, IPOScoreBreakdown } from "@/features/ipo/types/ipo.types";
import { IPO_SCORE_DISCLAIMER } from "@/features/ipo/services/ipoScoreEngine";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Sparkles, Info, AlertCircle, CheckCircle2, XCircle } from "lucide-react";

interface IPOScoreCardProps {
  score: IPOScoreRow | null;
  computedBreakdown: IPOScoreBreakdown;
}

export function IPOScoreCard({ score, computedBreakdown }: IPOScoreCardProps) {
  const overall = score ? score.overall_score : computedBreakdown.overall;
  const isInsufficient = score
    ? score.is_insufficient_data
    : computedBreakdown.status === "INSUFFICIENT_DATA" || computedBreakdown.isInsufficientData;
  const version = score ? score.score_version : computedBreakdown.version;
  const eligibility = computedBreakdown.eligibility;

  const getScoreColor = (val: number) => {
    if (val >= 75) return "text-[var(--status-success)]";
    if (val >= 55) return "text-[var(--brand-primary)]";
    if (val >= 40) return "text-[var(--status-warning)]";
    return "text-[var(--status-danger)]";
  };

  const getBadgeVariant = (val: number): "success" | "default" | "warning" | "danger" => {
    if (val >= 75) return "success";
    if (val >= 55) return "default";
    if (val >= 40) return "warning";
    return "danger";
  };

  const categories = [
    {
      name: "Financial Health & Margins",
      score: score?.financial_health_score ?? computedBreakdown.financialHealth.score,
      max: score?.financial_health_max ?? computedBreakdown.financialHealth.max,
      notes: computedBreakdown.financialHealth.notes,
    },
    {
      name: "Valuation Attractiveness",
      score: score?.valuation_score ?? computedBreakdown.valuation.score,
      max: score?.valuation_max ?? computedBreakdown.valuation.max,
      notes: computedBreakdown.valuation.notes,
    },
    {
      name: "Issue Structure & Promoters",
      score: score?.issue_structure_score ?? computedBreakdown.issueStructure.score,
      max: score?.issue_structure_max ?? computedBreakdown.issueStructure.max,
      notes: computedBreakdown.issueStructure.notes,
    },
    {
      name: "Market Sentiment & GMP",
      score: score?.market_sentiment_score ?? computedBreakdown.marketSentiment.score,
      max: score?.market_sentiment_max ?? computedBreakdown.marketSentiment.max,
      notes: computedBreakdown.marketSentiment.notes,
    },
    {
      name: "Subscription Demand",
      score: score?.subscription_demand_score ?? computedBreakdown.subscriptionDemand.score,
      max: score?.subscription_demand_max ?? computedBreakdown.subscriptionDemand.max,
      notes: computedBreakdown.subscriptionDemand.notes,
    },
    {
      name: "Industry & Risk Profile",
      score: score?.industry_risk_score ?? computedBreakdown.industryRisk.score,
      max: score?.industry_risk_max ?? computedBreakdown.industryRisk.max,
      notes: computedBreakdown.industryRisk.notes,
    },
  ];

  return (
    <Card className="border-[var(--border-subtle)] overflow-hidden bg-[var(--bg-surface)]">
      <CardHeader className="py-4 px-6 bg-[var(--bg-surface-elevated)]/30 border-b border-[var(--border-subtle)] flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[var(--brand-primary)]" />
          <CardTitle className="text-base">Explainable IPO Score</CardTitle>
          <Badge variant="secondary" size="sm">
            Model {version}
          </Badge>
        </div>
        {isInsufficient && (
          <Badge variant="warning" size="sm">
            Score Pending Disclosures
          </Badge>
        )}
      </CardHeader>

      <CardContent className="p-6 space-y-6">
        {isInsufficient || overall === null ? (
          /* Honest Empty/Insufficient State */
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-5 rounded-2xl bg-[var(--bg-surface-elevated)]/60 border border-[var(--border-subtle)]">
              <div className="w-12 h-12 rounded-xl bg-[var(--status-warning)]/10 text-[var(--status-warning)] flex items-center justify-center shrink-0">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  Quantitative Score Pending Prospectus Disclosures
                </h3>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Institutional quantitative scoring is strictly suppressed until audited/restated financial statements (minimum 2 fiscal periods) and price band valuation disclosures are officially available from SEBI/Exchange filings.
                </p>
              </div>
            </div>

            {/* Eligibility Checklist */}
            {eligibility && (
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                  Scoring Prerequisite Eligibility Audit
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {/* Fundamentals */}
                  <div className="p-3.5 rounded-xl bg-[var(--bg-surface-elevated)]/40 border border-[var(--border-subtle)] space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[var(--text-primary)]">Multi-Year Fundamentals</span>
                      {eligibility.categories.fundamentals.eligible ? (
                        <span className="inline-flex items-center gap-1 text-[var(--status-success)] font-medium text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Satisfied
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[var(--status-warning)] font-medium text-[11px]">
                          <XCircle className="w-3.5 h-3.5" /> Incomplete
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {eligibility.categories.fundamentals.notes[0] || "Restated P&L, balance sheet, and margin records."}
                    </p>
                  </div>

                  {/* Valuation */}
                  <div className="p-3.5 rounded-xl bg-[var(--bg-surface-elevated)]/40 border border-[var(--border-subtle)] space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[var(--text-primary)]">Valuation & Peer Multiples</span>
                      {eligibility.categories.valuation.eligible ? (
                        <span className="inline-flex items-center gap-1 text-[var(--status-success)] font-medium text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Satisfied
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[var(--status-warning)] font-medium text-[11px]">
                          <XCircle className="w-3.5 h-3.5" /> Pending Price Band
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {eligibility.categories.valuation.notes[0] || "P/E, P/B, and listed peer comparison metrics."}
                    </p>
                  </div>

                  {/* Demand */}
                  <div className="p-3.5 rounded-xl bg-[var(--bg-surface-elevated)]/40 border border-[var(--border-subtle)] space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[var(--text-primary)]">Exchange Bidding Demand</span>
                      {eligibility.categories.demand.eligible ? (
                        <span className="inline-flex items-center gap-1 text-[var(--status-success)] font-medium text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Live Demand
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[var(--text-muted)] font-medium text-[11px]">
                          <Info className="w-3.5 h-3.5" /> Pre-Bidding
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {eligibility.categories.demand.notes[0] || "QIB, NII, and Retail subscription multiples."}
                    </p>
                  </div>

                  {/* Sentiment */}
                  <div className="p-3.5 rounded-xl bg-[var(--bg-surface-elevated)]/40 border border-[var(--border-subtle)] space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[var(--text-primary)]">Unofficial Market Sentiment</span>
                      {eligibility.categories.sentiment.eligible ? (
                        <span className="inline-flex items-center gap-1 text-[var(--brand-primary)] font-medium text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Available (Unofficial)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[var(--text-muted)] font-medium text-[11px]">
                          <Info className="w-3.5 h-3.5" /> No Quote
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {eligibility.categories.sentiment.notes[0] || "Grey market premium tracker observations."}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Valid Score Hero */
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-[var(--bg-surface-elevated)]/60 border border-[var(--border-subtle)] text-center">
              <span className="text-xs text-[var(--text-muted)] font-medium">Overall Composite Score</span>
              <div className="flex items-baseline gap-1 my-2">
                <span className={`text-5xl font-extrabold ${getScoreColor(overall)}`}>
                  {overall}
                </span>
                <span className="text-lg font-medium text-[var(--text-muted)]">/ 100</span>
              </div>
              <Badge variant={getBadgeVariant(overall)} size="sm">
                {overall >= 75 ? "Strong Potential" : overall >= 55 ? "Moderate Appeal" : "Caution / Neutral"}
              </Badge>
            </div>

            <div className="md:col-span-2 space-y-3.5">
              <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                6-Dimensional Category Breakdown
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {categories.map((cat) => {
                  const hasVal = cat.score !== null;
                  const pct = hasVal ? Math.min(100, (cat.score! / cat.max) * 100) : 0;
                  return (
                    <div
                      key={cat.name}
                      className="p-3 rounded-lg bg-[var(--bg-surface-elevated)]/40 border border-[var(--border-subtle)] space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-[var(--text-primary)] truncate max-w-[170px]">{cat.name}</span>
                        <span className="font-bold text-[var(--brand-primary)]">
                          {hasVal ? `${cat.score} / ${cat.max}` : "Pending"}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-[var(--bg-surface-elevated)] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[var(--brand-primary)] rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      {cat.notes && cat.notes.length > 0 && (
                        <p className="text-[10px] text-[var(--text-muted)] truncate">{cat.notes[0]}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Methodology Disclaimers */}
        <div className="p-3.5 rounded-xl bg-[var(--bg-surface-elevated)]/50 border border-[var(--border-subtle)] flex items-start gap-2.5 text-xs text-[var(--text-secondary)]">
          <Info className="w-4 h-4 text-[var(--brand-primary)] shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong>Analytical Disclaimer: </strong>
            {IPO_SCORE_DISCLAIMER}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
