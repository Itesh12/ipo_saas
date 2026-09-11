"use client";

import React, { useState, useEffect, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Search, SlidersHorizontal, RotateCcw } from "lucide-react";

interface IPOFilterBarProps {
  initialCategory?: string;
  initialStatus?: string;
}

export function IPOFilterBar({ initialCategory, initialStatus }: IPOFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const urlQ = searchParams.get("q") || "";
  const urlCategory = searchParams.get("category") || initialCategory || "all";
  const urlStatus = searchParams.get("status") || initialStatus || "all";
  const urlSort = searchParams.get("sort") || "open_date";

  const [search, setSearch] = useState(urlQ);

  // Debounced search text push
  useEffect(() => {
    const handler = setTimeout(() => {
      if (search !== urlQ) {
        const params = new URLSearchParams(searchParams.toString());
        if (search.trim()) {
          params.set("q", search.trim());
        } else {
          params.delete("q");
        }
        startTransition(() => {
          router.push(`${pathname}?${params.toString()}`, { scroll: false });
        });
      }
    }, 250);

    return () => clearTimeout(handler);
  }, [search, urlQ, pathname, router, searchParams]);

  const updateParam = (key: string, val: string, defaultVal: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (val !== defaultVal) {
      params.set(key, val);
    } else {
      params.delete(key);
    }
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  const handleReset = () => {
    setSearch("");
    startTransition(() => {
      router.push(pathname, { scroll: false });
    });
  };

  const hasActiveFilters = Boolean(
    search || urlCategory !== "all" || urlStatus !== "all" || urlSort !== "open_date"
  );

  return (
    <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]/60 text-xs text-[var(--text-secondary)]">
        <div className="flex items-center gap-1.5 font-medium">
          <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
          <span>Filter & Search IPOs</span>
          {isPending && <span className="text-[10px] text-[var(--brand-primary)] animate-pulse">Filtering...</span>}
        </div>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleReset}
            className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center gap-1 cursor-pointer transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset filters</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Input
          placeholder="Search by company or symbol..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftElement={<Search className="w-4 h-4" />}
        />

        <Select
          value={urlCategory}
          onChange={(e) => updateParam("category", e.target.value, "all")}
        >
          <option value="all">All Classifications</option>
          <option value="mainboard">Mainboard</option>
          <option value="sme_nse">NSE SME (Emerge)</option>
          <option value="sme_bse">BSE SME</option>
        </Select>

        <Select
          value={urlStatus}
          onChange={(e) => updateParam("status", e.target.value, "all")}
        >
          <option value="all">All Lifecycles</option>
          <option value="open">Bidding Open</option>
          <option value="upcoming">Upcoming</option>
          <option value="closed">Closed / Allotment Pending</option>
          <option value="listed">Listed</option>
        </Select>

        <Select
          value={urlSort}
          onChange={(e) => updateParam("sort", e.target.value, "open_date")}
        >
          <option value="open_date">Sort by: Open Date</option>
          <option value="close_date">Sort by: Close Date</option>
          <option value="listing_date">Sort by: Listing Date</option>
          <option value="issue_size_cr">Sort by: Issue Size</option>
          <option value="company_name">Sort by: Company Name</option>
        </Select>
      </div>
    </div>
  );
}
