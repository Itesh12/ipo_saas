import React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface IPOPaginationProps {
  currentPage: number;
  pageSize: number;
  totalCount: number;
  query?: Record<string, string>;
}

export function IPOPagination({
  currentPage,
  pageSize,
  totalCount,
  query = {},
}: IPOPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // If there's only 1 page and no items or all items fit, don't show pagination controls
  if (totalPages <= 1) {
    return null;
  }

  const startItem = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(totalCount, currentPage * pageSize);

  const buildPageUrl = (page: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v && v !== "all" && k !== "page") {
        p.set(k, v);
      }
    }
    if (pageSize !== 20) p.set("pageSize", String(pageSize));
    if (page > 1) p.set("page", String(page));
    const q = p.toString();
    return q ? `/ipos?${q}` : "/ipos";
  };

  // Generate sliding window of pages with ellipses
  const getPageNumbers = (): (number | "ellipsis")[] => {
    const pages: (number | "ellipsis")[] = [];

    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
      return pages;
    }

    pages.push(1);

    if (currentPage > 3) {
      pages.push("ellipsis");
    }

    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (currentPage < totalPages - 2) {
      pages.push("ellipsis");
    }

    pages.push(totalPages);
    return pages;
  };

  const pageNumbers = getPageNumbers();
  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
      {/* Range Summary */}
      <div className="text-center sm:text-left">
        Showing <strong className="text-[var(--text-primary)] font-semibold">{startItem}–{endItem}</strong> of{" "}
        <strong className="text-[var(--text-primary)] font-semibold">{totalCount}</strong> published IPOs
        <span className="text-[var(--text-muted)] ml-1.5">(Page {currentPage} of {totalPages})</span>
      </div>

      {/* Navigation Buttons */}
      <nav aria-label="IPO Directory Pagination" className="flex flex-wrap items-center justify-center gap-1.5">
        {/* Previous Button */}
        {hasPrev ? (
          <Link
            href={buildPageUrl(currentPage - 1)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] transition-colors"
            aria-label="Previous Page"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Prev</span>
          </Link>
        ) : (
          <span
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--border-subtle)]/50 bg-[var(--bg-surface-elevated)]/40 text-[var(--text-muted)] cursor-not-allowed opacity-60"
            aria-disabled="true"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Prev</span>
          </span>
        )}

        {/* Numeric Page Buttons */}
        <div className="flex items-center gap-1">
          {pageNumbers.map((p, idx) => {
            if (p === "ellipsis") {
              return (
                <span
                  key={`ellipsis-${idx}`}
                  className="px-2 py-1 text-[var(--text-muted)] select-none"
                >
                  …
                </span>
              );
            }

            const isCurrent = p === currentPage;

            return isCurrent ? (
              <span
                key={p}
                className="w-8 h-8 rounded-lg bg-[var(--brand-primary)] text-white font-semibold flex items-center justify-center shadow-xs"
                aria-current="page"
              >
                {p}
              </span>
            ) : (
              <Link
                key={p}
                href={buildPageUrl(p)}
                className="w-8 h-8 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] transition-colors flex items-center justify-center font-medium"
              >
                {p}
              </Link>
            );
          })}
        </div>

        {/* Next Button */}
        {hasNext ? (
          <Link
            href={buildPageUrl(currentPage + 1)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] transition-colors"
            aria-label="Next Page"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        ) : (
          <span
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--border-subtle)]/50 bg-[var(--bg-surface-elevated)]/40 text-[var(--text-muted)] cursor-not-allowed opacity-60"
            aria-disabled="true"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </span>
        )}
      </nav>
    </div>
  );
}
