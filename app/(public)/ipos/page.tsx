import React, { Suspense } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { IPOCard } from "@/components/ipo/IPOCard";
import { IPOFilterBar } from "@/components/ipo/IPOFilterBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { getPublishedIPOs } from "@/features/ipo/services/ipoService";
import { IPOCategory, IPOStatus } from "@/features/ipo/types/ipo.types";
import { Layers, Flame, Calendar, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageProps {
  searchParams: Promise<{
    tab?: string;
    category?: string;
    status?: string;
    q?: string;
    sort?: string;
  }>;
}

export default async function IposPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const activeTab = params.tab || "all";
  const category = (params.category as IPOCategory) || "all";
  const statusFilter = (params.status as IPOStatus) || "all";
  const searchQuery = params.q || "";
  const sortBy = (params.sort as "open_date" | "close_date" | "listing_date" | "issue_size" | "company_name") || "open_date";

  // Determine effective status filter combined with tab
  let effectiveStatus: IPOStatus | "all" | "current" | "upcoming" | "past" = statusFilter;
  if (activeTab === "current") effectiveStatus = "current";
  else if (activeTab === "upcoming") effectiveStatus = "upcoming";
  else if (activeTab === "past") effectiveStatus = "past";

  const { ipos, totalCount } = await getPublishedIPOs({
    category,
    status: effectiveStatus,
    searchQuery,
    sortBy,
  });

  const tabItems = [
    { id: "all", label: "All IPOs", icon: Layers, href: "/ipos" },
    { id: "current", label: "Current (Open)", icon: Flame, href: "/ipos?tab=current" },
    { id: "upcoming", label: "Upcoming", icon: Calendar, href: "/ipos?tab=upcoming" },
    { id: "past", label: "Past & Listed", icon: CheckCircle, href: "/ipos?tab=past" },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Indian IPO Directory"
        description="Discover and research active, upcoming, and listed Mainboard and SME initial public offerings in the Indian equity markets."
      />

      {/* Primary Tabs */}
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

      {/* Filter and Search Bar */}
      <Suspense fallback={<div className="h-20 bg-[var(--bg-surface)] rounded-xl animate-pulse" />}>
        <IPOFilterBar />
      </Suspense>

      {/* Result Count and Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span>
            Showing <strong>{ipos.length}</strong> of <strong>{totalCount}</strong> published IPOs
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {ipos.map((ipo) => (
              <IPOCard key={ipo.id} ipo={ipo} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
