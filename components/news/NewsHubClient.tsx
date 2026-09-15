"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Newspaper,
  ShieldCheck,
  AlertTriangle,
  Clock,
  ExternalLink,
  Search,
  Building2,
  Layers,
  Info,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";
import { NEWS_REGULATORY_DISCLAIMER } from "@/features/external-integrations/news/newsCompliance";

export interface NewsHubItem {
  id: string;
  ipo_id: string | null;
  headline: string;
  summary: string | null;
  source: string | null;
  source_url: string | null;
  sentiment: "positive" | "negative" | "neutral" | "cautious";
  published_at: string | null;
  category: string;
  authoritativeness: "official_regulatory" | "third_party_media";
  verification_status: "verified" | "unverified" | "quarantined_unmatched";
  is_price_sensitive: boolean;
  structured_event_type: string | null;
  story_cluster_id: string | null;
  publisher_id: string;
  ipos?: {
    company_name: string;
    symbol: string | null;
    slug: string;
  } | null;
}

interface NewsHubClientProps {
  initialNews: NewsHubItem[];
}

export function NewsHubClient({ initialNews }: NewsHubClientProps) {
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [onlyPriceSensitive, setOnlyPriceSensitive] = useState<boolean>(false);
  const [onlyOfficial, setOnlyOfficial] = useState<boolean>(false);

  // Filtered stories
  const filteredItems = useMemo(() => {
    return initialNews.filter((item) => {
      // Category filter
      if (activeCategory !== "all") {
        if (activeCategory === "official_regulatory" && item.authoritativeness !== "official_regulatory") {
          return false;
        }
        if (activeCategory !== "official_regulatory" && item.category !== activeCategory) {
          return false;
        }
      }

      // Flag filters
      if (onlyPriceSensitive && !item.is_price_sensitive) return false;
      if (onlyOfficial && item.authoritativeness !== "official_regulatory") return false;

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const headlineMatch = item.headline.toLowerCase().includes(q);
        const summaryMatch = (item.summary || "").toLowerCase().includes(q);
        const companyMatch = item.ipos?.company_name.toLowerCase().includes(q);
        const symbolMatch = item.ipos?.symbol?.toLowerCase().includes(q);
        const publisherMatch = (item.publisher_id || item.source || "").toLowerCase().includes(q);

        if (!headlineMatch && !summaryMatch && !companyMatch && !symbolMatch && !publisherMatch) {
          return false;
        }
      }

      return true;
    });
  }, [initialNews, activeCategory, searchQuery, onlyPriceSensitive, onlyOfficial]);

  // Statistics
  const totalCount = initialNews.length;
  const officialCount = initialNews.filter((n) => n.authoritativeness === "official_regulatory").length;
  const priceSensitiveCount = initialNews.filter((n) => n.is_price_sensitive).length;
  const uniqueClusters = new Set(initialNews.map((n) => n.story_cluster_id).filter(Boolean)).size;

  const categories = [
    { id: "all", label: "All Coverage" },
    { id: "official_regulatory", label: "Official Circulars" },
    { id: "price_band_revision", label: "Price Band Changes" },
    { id: "issue_extension", label: "Issue Extensions" },
    { id: "regulatory_announcement", label: "Regulatory Filings" },
    { id: "governance_litigation", label: "Governance" },
    { id: "market_commentary", label: "Market Sentiment" },
  ];

  return (
    <div className="space-y-6">
      {/* SEBI Compliance Disclaimer Banner */}
      <div className="rounded-xl border border-sky-800/40 bg-sky-950/20 p-4 text-xs text-sky-200/90 flex items-start gap-3 shadow-sm">
        <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-semibold text-sky-300">Statutory Disclosure & Intellectual Property Notice</span>
          <p className="leading-relaxed text-[11px] text-sky-200/80">{NEWS_REGULATORY_DISCLAIMER}</p>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-sm">
          <span className="text-xs text-[var(--text-muted)] font-medium">Indexed Items</span>
          <div className="text-2xl font-bold text-[var(--text-primary)] mt-1">{totalCount}</div>
          <span className="text-[11px] text-[var(--text-muted)]">SEBI, BSE, NSE & Media</span>
        </div>

        <div className="rounded-xl border border-emerald-800/30 bg-emerald-950/10 p-4 shadow-sm">
          <span className="text-xs text-emerald-400/90 font-medium">Statutory Circulars</span>
          <div className="text-2xl font-bold text-emerald-400 mt-1">{officialCount}</div>
          <span className="text-[11px] text-emerald-400/70">Verified Regulatory</span>
        </div>

        <div className="rounded-xl border border-amber-800/30 bg-amber-950/10 p-4 shadow-sm">
          <span className="text-xs text-amber-400/90 font-medium">Price Sensitive</span>
          <div className="text-2xl font-bold text-amber-400 mt-1">{priceSensitiveCount}</div>
          <span className="text-[11px] text-amber-400/70">Critical Announcements</span>
        </div>

        <div className="rounded-xl border border-indigo-800/30 bg-indigo-950/10 p-4 shadow-sm">
          <span className="text-xs text-indigo-400/90 font-medium">Story Clusters</span>
          <div className="text-2xl font-bold text-indigo-400 mt-1">{uniqueClusters}</div>
          <span className="text-[11px] text-indigo-400/70">Syndication Groups</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        {/* Category tabs */}
        <div className="flex flex-wrap items-center gap-1.5">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                activeCategory === cat.id
                  ? "bg-[var(--brand-primary)] text-white shadow-sm"
                  : "bg-[var(--bg-surface-elevated)]/60 text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Search Input & Quick Toggles */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search news or IPO..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--brand-primary)] w-48 sm:w-60 transition-colors"
            />
          </div>

          <button
            onClick={() => setOnlyOfficial(!onlyOfficial)}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors flex items-center gap-1.5 ${
              onlyOfficial
                ? "bg-emerald-950/60 border-emerald-600/80 text-emerald-300"
                : "bg-[var(--bg-surface-elevated)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Official Only
          </button>

          <button
            onClick={() => setOnlyPriceSensitive(!onlyPriceSensitive)}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors flex items-center gap-1.5 ${
              onlyPriceSensitive
                ? "bg-amber-950/60 border-amber-600/80 text-amber-300"
                : "bg-[var(--bg-surface-elevated)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Price Sensitive
          </button>
        </div>
      </div>

      {/* News Item Feed */}
      {filteredItems.length === 0 ? (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-12 text-center space-y-3">
          <Newspaper className="w-10 h-10 text-[var(--text-muted)] mx-auto opacity-50" />
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">No circulars or news matching your criteria</h4>
          <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto">
            Try adjusting your search query or category filters. All official SEBI, BSE, and NSE notifications are synchronized in real time.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredItems.map((item) => {
            const isOfficial = item.authoritativeness === "official_regulatory";
            const hasIpo = !!item.ipos;

            return (
              <div
                key={item.id}
                className={`p-5 rounded-xl border transition-all duration-150 space-y-3 ${
                  isOfficial
                    ? "bg-emerald-950/10 border-emerald-800/30 hover:border-emerald-700/60"
                    : "bg-[var(--bg-surface)] border-[var(--border-subtle)] hover:border-[var(--border-subtle)]/80"
                }`}
              >
                {/* Header Tags & Metadata */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {isOfficial ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/50 px-2.5 py-0.5 rounded-full border border-emerald-800/60">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Official Regulatory Notice
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-300 bg-slate-800/50 px-2.5 py-0.5 rounded-full border border-slate-700/60">
                        Market Coverage
                      </span>
                    )}

                    {item.is_price_sensitive && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-950/50 px-2.5 py-0.5 rounded-full border border-amber-800/60">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Price Sensitive
                      </span>
                    )}

                    {item.category && item.category !== "general_news" && (
                      <span className="text-[10px] font-medium text-[var(--text-muted)] bg-[var(--bg-surface-elevated)] px-2 py-0.5 rounded border border-[var(--border-subtle)] uppercase tracking-wider">
                        {item.category.replace(/_/g, " ")}
                      </span>
                    )}

                    {item.story_cluster_id && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-indigo-400 bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-800/40">
                        <Layers className="w-3 h-3" />
                        Clustered Story
                      </span>
                    )}
                  </div>

                  {item.published_at && (
                    <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                      <Clock className="w-3.5 h-3.5" />
                      {formatDate(item.published_at)}
                    </span>
                  )}
                </div>

                {/* Headline & Link */}
                <div>
                  <a
                    href={item.source_url || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-base font-semibold text-[var(--text-primary)] hover:text-[var(--brand-primary)] transition-colors inline-flex items-start gap-1.5 leading-snug group"
                  >
                    <span>{item.headline}</span>
                    <ExternalLink className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--brand-primary)] shrink-0 mt-1 transition-colors" />
                  </a>
                </div>

                {/* Excerpt */}
                {item.summary && (
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-3">
                    {item.summary}
                  </p>
                )}

                {/* Footer Attribution & Related IPO */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--border-subtle)]/50 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--text-muted)] text-[11px]">Publisher:</span>
                    <span className="font-semibold text-[var(--text-secondary)]">
                      {item.publisher_id || item.source || "Official Exchange Feed"}
                    </span>
                    {item.verification_status === "verified" && (
                      <Badge variant="success" size="sm" className="text-[10px]">
                        Verified
                      </Badge>
                    )}
                  </div>

                  {hasIpo && (
                    <Link
                      href={`/ipos/${item.ipos!.slug}`}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--brand-primary)] hover:underline bg-[var(--bg-surface-elevated)] px-2.5 py-1 rounded-md border border-[var(--border-subtle)] hover:border-[var(--brand-primary)]/40 transition-colors"
                    >
                      <Building2 className="w-3.5 h-3.5" />
                      <span>{item.ipos!.company_name}</span>
                      {item.ipos!.symbol && (
                        <span className="text-[var(--text-muted)] font-normal">({item.ipos!.symbol})</span>
                      )}
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
