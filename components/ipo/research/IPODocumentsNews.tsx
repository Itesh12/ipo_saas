"use client";

import React from "react";
import { IPODocumentRow, IPONewsRow } from "@/features/ipo/types/ipo.types";
import { formatDate } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { FileText, Newspaper, ExternalLink, FileCheck, Clock, ShieldCheck, AlertCircle, Download } from "lucide-react";

interface IPODocumentsNewsProps {
  documents: IPODocumentRow[];
  news: IPONewsRow[];
}

function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function IPODocumentsNews({ documents, news }: IPODocumentsNewsProps) {
  const getDocBadge = (type: string) => {
    switch (type) {
      case "drhp":
        return <Badge variant="warning" size="sm">DRHP Filing</Badge>;
      case "rhp":
        return <Badge variant="default" size="sm">RHP Prospectus</Badge>;
      case "prospectus":
        return <Badge variant="default" size="sm">Final Prospectus</Badge>;
      case "abridged_prospectus":
        return <Badge variant="secondary" size="sm">Abridged Prospectus</Badge>;
      case "addendum":
        return <Badge variant="secondary" size="sm">Addendum</Badge>;
      case "corrigendum":
        return <Badge variant="warning" size="sm">Corrigendum</Badge>;
      case "anchor_allocation":
        return <Badge variant="success" size="sm">Anchor Allocation</Badge>;
      case "basis_of_allotment":
        return <Badge variant="success" size="sm">Basis of Allotment</Badge>;
      case "presentation":
        return <Badge variant="success" size="sm">Investor Deck</Badge>;
      default:
        return <Badge variant="secondary" size="sm">{type.toUpperCase().replace(/_/g, ' ')}</Badge>;
    }
  };

  const getSentimentBadge = (sent: string) => {
    switch (sent) {
      case "positive":
        return <Badge variant="success" size="sm">Positive</Badge>;
      case "negative":
        return <Badge variant="danger" size="sm">Negative</Badge>;
      case "cautious":
        return <Badge variant="warning" size="sm">Cautious</Badge>;
      default:
        return <Badge variant="secondary" size="sm">Neutral</Badge>;
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Regulatory Filings & Documents */}
      <Card className="border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <CardHeader className="py-3.5 px-5 bg-[var(--bg-surface-elevated)]/30 border-b border-[var(--border-subtle)] flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[var(--brand-primary)]" />
            <CardTitle className="text-sm">Official Filings & Prospectus</CardTitle>
          </div>
          <span className="text-xs text-[var(--text-muted)]">SEBI / BSE / NSE / Registrars</span>
        </CardHeader>

        <CardContent className="p-5 space-y-3">
          {documents.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] py-4 text-center">
              Official filings (DRHP, RHP, Investor Presentation) will be indexed upon release.
            </p>
          ) : (
            documents.map((doc) => {
              const meta = (doc.metadata || {}) as Record<string, unknown>;
              const brlms: string[] = Array.isArray(meta.brlms) ? (meta.brlms as string[]) : [];
              const isVerified = doc.validation_status === 'verified';
              const sizeStr = formatBytes(doc.file_size_bytes);

              return (
                <div
                  key={doc.id}
                  className="p-3.5 rounded-lg bg-[var(--bg-surface-elevated)]/40 border border-[var(--border-subtle)] flex flex-col gap-2 hover:border-[var(--brand-primary)]/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      {isVerified ? (
                        <FileCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <h5 className="text-xs font-semibold text-[var(--text-primary)] leading-snug">
                          {doc.title}
                        </h5>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)] mt-1">
                          <span className="font-medium text-[var(--text-secondary)]">
                            {doc.source || "Official Regulatory Filing"}
                          </span>
                          {doc.published_at && <span>• {formatDate(doc.published_at)}</span>}
                          {sizeStr && <span>• {sizeStr}</span>}
                          {isVerified ? (
                            <span className="inline-flex items-center gap-1 text-emerald-400 text-[10px] font-medium bg-emerald-950/30 px-1.5 py-0.5 rounded border border-emerald-800/40">
                              <ShieldCheck className="w-3 h-3" />
                              Validated PDF
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-amber-400 text-[10px] font-medium bg-amber-950/30 px-1.5 py-0.5 rounded border border-amber-800/40">
                              Pending Validation
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {getDocBadge(doc.document_type)}
                      <a
                        href={`/api/documents/${doc.id}/download`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-md hover:bg-[var(--bg-surface-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                        title="Download / View Official PDF"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>

                  {brlms.length > 0 && (
                    <div className="text-[11px] text-[var(--text-muted)] pt-1 border-t border-[var(--border-subtle)]/50 flex flex-wrap gap-1.5 items-center">
                      <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Lead Managers:</span>
                      {brlms.map((b, i) => (
                        <span key={i} className="text-xs text-[var(--text-secondary)] bg-[var(--bg-surface)] px-1.5 py-0.5 rounded border border-[var(--border-subtle)]">
                          {b}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Attributed News Feed & Regulatory Circulars */}
      <Card className="border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <CardHeader className="py-3.5 px-5 bg-[var(--bg-surface-elevated)]/30 border-b border-[var(--border-subtle)] flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Newspaper className="w-4 h-4 text-[var(--brand-primary)]" />
            <CardTitle className="text-sm">Exchange Notices & Media Intelligence</CardTitle>
          </div>
          <span className="text-xs text-[var(--text-muted)]">Verified Provenance</span>
        </CardHeader>

        <CardContent className="p-5 space-y-3.5">
          {news.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] py-4 text-center">
              No recent official announcements or news coverage indexed for this issue.
            </p>
          ) : (
            news.map((item) => {
              const isOfficial = item.authoritativeness === "official_regulatory";
              const isPriceSensitive = !!item.is_price_sensitive;
              const isVerified = item.verification_status === "verified";

              return (
                <div
                  key={item.id}
                  className={`p-3.5 rounded-lg border transition-colors space-y-2 ${
                    isOfficial
                      ? "bg-emerald-950/10 border-emerald-800/30 hover:border-emerald-700/50"
                      : "bg-[var(--bg-surface-elevated)]/40 border-[var(--border-subtle)] hover:border-[var(--border-subtle)]/80"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    {isOfficial ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-800/60">
                        <ShieldCheck className="w-3 h-3" />
                        Official Regulatory Notice
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-400 bg-slate-800/40 px-2 py-0.5 rounded border border-slate-700/50">
                        Market Coverage
                      </span>
                    )}

                    {isPriceSensitive && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-400 bg-amber-950/50 px-2 py-0.5 rounded border border-amber-800/60">
                        <AlertCircle className="w-3 h-3" />
                        Price Sensitive
                      </span>
                    )}

                    {item.category && item.category !== "general_news" && (
                      <span className="text-[10px] font-medium text-[var(--text-muted)] bg-[var(--bg-surface)] px-2 py-0.5 rounded border border-[var(--border-subtle)] uppercase tracking-wider">
                        {item.category.replace(/_/g, " ")}
                      </span>
                    )}

                    {getSentimentBadge(item.sentiment)}
                  </div>

                  <div>
                    <a
                      href={item.source_url || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-[var(--text-primary)] hover:text-[var(--brand-primary)] transition-colors inline-flex items-center gap-1 leading-snug"
                    >
                      <span>{item.headline}</span>
                      <ExternalLink className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
                    </a>
                  </div>

                  {item.summary && (
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-3">
                      {item.summary}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-[var(--text-muted)] pt-1 border-t border-[var(--border-subtle)]/40">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[var(--text-secondary)]">
                        {item.publisher_id || item.source || "Official Source"}
                      </span>
                      {isVerified && (
                        <span className="text-emerald-400 font-medium">• Entity Resolved</span>
                      )}
                    </div>
                    {item.published_at && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(item.published_at)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}

          <div className="pt-2 border-t border-[var(--border-subtle)]/60 text-[10px] text-[var(--text-muted)] leading-relaxed italic">
            Third-party media excerpts are capped to statutory quotes under fair dealing. Official regulatory circulars are sourced from SEBI, BSE, and NSE repositories.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
