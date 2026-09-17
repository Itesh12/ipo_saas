import React, { Suspense } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { IPOCard } from "@/components/ipo/IPOCard";
import { IPOFilterBar } from "@/components/ipo/IPOFilterBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { getPublishedIPOs, getIPOUniverseCounts } from "@/features/ipo/services/ipoService";
import { IPOCategory, IPOStatus } from "@/features/ipo/types/ipo.types";
import { Layers, Flame, Calendar, CheckCircle, FileText } from "lucide-react";
import { IPOPagination } from "@/components/ipo/IPOPagination";
import { cn } from "@/lib/utils";

interface PageProps {
  searchParams: Promise<{
    tab?: string;
    category?: string;
    status?: string;
    segment?: string;
    year?: string;
    q?: string;
    sort?: string;
    page?: string;
    pageSize?: string;
  }>;
}

export default async function IposPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const activeTab = params.tab || "all";
  const category = (params.category as IPOCategory) || "all";
  const statusFilter = (params.status as IPOStatus) || "all";
  const activeSegment = params.segment || "all";
  const activeYear = params.year || "all";
  const searchQuery = params.q || "";
  const sortBy = (params.sort as "open_date" | "close_date" | "listing_date" | "issue_size" | "company_name") || "open_date";
  
  // Sanitize pagination parameters
  const rawPage = parseInt(params.page || "1", 10);
  const currentPage = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const rawPageSize = parseInt(params.pageSize || "20", 10);
  const pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0 ? Math.min(100, rawPageSize) : 20;

  // Determine effective status filter combined with tab
  let effectiveStatus: IPOStatus | "all" | "current" | "upcoming" | "announced" | "past" = statusFilter;
  if (activeTab === "current") effectiveStatus = "current";
  else if (activeTab === "upcoming") effectiveStatus = "upcoming";
  else if (activeTab === "announced") effectiveStatus = "announced";
  else if (activeTab === "past") effectiveStatus = "past";

  const [{ ipos, totalCount }, counts] = await Promise.all([
    getPublishedIPOs({
      category,
      status: effectiveStatus,
      market_segment: activeSegment !== "all" ? (activeSegment as "MAINBOARD" | "NSE_SME" | "BSE_SME") : undefined,
      year: activeYear !== "all" ? activeYear : undefined,
      searchQuery,
      sortBy,
      page: currentPage,
      pageSize,
    }),
    getIPOUniverseCounts(),
  ]);

  const buildUrl = (updates: Record<string, string>, preservePage: boolean = false) => {
    const p = new URLSearchParams();
    if (activeTab !== "all") p.set("tab", activeTab);
    if (activeSegment !== "all") p.set("segment", activeSegment);
    if (activeYear !== "all") p.set("year", activeYear);
    if (searchQuery) p.set("q", searchQuery);
    if (sortBy !== "open_date") p.set("sort", sortBy);
    if (pageSize !== 20) p.set("pageSize", String(pageSize));
    if (preservePage && currentPage > 1) p.set("page", String(currentPage));

    for (const [k, v] of Object.entries(updates)) {
      if (v === "all" || (k === "page" && v === "1")) p.delete(k);
      else p.set(k, v);
    }
    const q = p.toString();
    return q ? `/ipos?${q}` : "/ipos";
  };

  const buildPageUrl = (newPage: number) => {
    return buildUrl({ page: String(newPage) });
  };

  const tabItems = [
    { id: "all", label: `All IPOs (${counts.all})`, icon: Layers, href: buildUrl({ tab: "all" }) },
    { id: "current", label: `Current (${counts.current})`, icon: Flame, href: buildUrl({ tab: "current" }) },
    { id: "upcoming", label: `Upcoming (${counts.upcoming})`, icon: Calendar, href: buildUrl({ tab: "upcoming" }) },
    { id: "announced", label: `Announced (${counts.announced})`, icon: FileText, href: buildUrl({ tab: "announced" }) },
    { id: "past", label: `Past (${counts.past})`, icon: CheckCircle, href: buildUrl({ tab: "past" }) },
  ];

  const segmentItems = [
    { id: "all", label: `All Segments (${counts.all})` },
    { id: "MAINBOARD", label: `Mainboard (${counts.mainboard})` },
    { id: "NSE_SME", label: `NSE SME (${counts.nse_sme})` },
    { id: "BSE_SME", label: `BSE SME (${counts.bse_sme})` },
  ];

  const yearItems = [
    { id: "all", label: "All Years" },
    { id: "2026", label: `2026 (${counts.byYear[2026] || 0})` },
    { id: "2025", label: `2025 (${counts.byYear[2025] || 0})` },
    { id: "2024", label: `2024 (${counts.byYear[2024] || 0})` },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Indian IPO Directory"
        description="Discover and research active, upcoming, and listed Mainboard and SME initial public offerings in the Indian equity markets."
      />

      {/* Primary Lifecycle Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] w-fit">
        {tabItems.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5",
                isActive
                  ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs font-semibold border border-[var(--border-subtle)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              )}
            >
              <Icon className={cn("w-3.5 h-3.5", isActive ? "text-[var(--brand-primary)]" : "")} />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Stage 3A.6: Market Segment & Year Filter Pill Bars */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs">
        {/* Segment Filter */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[var(--text-muted)] font-medium mr-1">Segment:</span>
          {segmentItems.map((seg) => {
            const isActive = activeSegment === seg.id;
            return (
              <Link
                key={seg.id}
                href={buildUrl({ segment: seg.id })}
                className={cn(
                  "px-2.5 py-1 rounded-md transition-colors",
                  isActive
                    ? "bg-[var(--brand-primary)] text-white font-semibold"
                    : "bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]/70"
                )}
              >
                {seg.label}
              </Link>
            );
          })}
        </div>

        {/* Year Filter */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[var(--text-muted)] font-medium mr-1">Year:</span>
          {yearItems.map((yr) => {
            const isActive = activeYear === yr.id;
            return (
              <Link
                key={yr.id}
                href={buildUrl({ year: yr.id })}
                className={cn(
                  "px-2.5 py-1 rounded-md transition-colors",
                  isActive
                    ? "bg-[var(--text-primary)] text-[var(--bg-surface)] font-semibold"
                    : "bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]/70"
                )}
              >
                {yr.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Suspense fallback={<div className="h-20 bg-[var(--bg-surface)] rounded-xl animate-pulse" />}>
        <IPOFilterBar />
      </Suspense>

      {/* Result Count and Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span>
            Showing <strong className="text-[var(--text-primary)] font-semibold">{totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1}–{Math.min(totalCount, currentPage * pageSize)}</strong> of <strong className="text-[var(--text-primary)] font-semibold">{totalCount}</strong> published IPOs
            {totalCount > pageSize && (
              <span className="ml-1 text-[var(--text-muted)]">
                (Page {currentPage} of {Math.ceil(totalCount / pageSize)})
              </span>
            )}
          </span>
        </div>

        {ipos.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="No IPOs match your criteria"
            description="Try adjusting your filters or search keywords to find available Mainboard and SME IPOs."
            actionLabel="View All IPOs"
            actionHref="/ipos"
          />
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {ipos.map((ipo) => (
                <IPOCard key={ipo.id} ipo={ipo} />
              ))}
            </div>

            {/* Pagination Controls */}
            <IPOPagination
              currentPage={currentPage}
              pageSize={pageSize}
              totalCount={totalCount}
              query={{
                tab: activeTab,
                segment: activeSegment,
                year: activeYear,
                q: searchQuery,
                sort: sortBy,
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
