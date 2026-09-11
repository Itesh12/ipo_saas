"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";

export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
      <Link
        href="/dashboard"
        className="hover:text-[var(--text-primary)] transition-colors flex items-center gap-1"
        aria-label="Dashboard"
      >
        <Home className="w-3.5 h-3.5" />
      </Link>

      {segments.map((segment, index) => {
        const href = `/${segments.slice(0, index + 1).join("/")}`;
        const isLast = index === segments.length - 1;
        const formattedTitle = segment
          .replace(/-/g, " ")
          .replace(/\b\w/g, (l) => l.toUpperCase());

        return (
          <React.Fragment key={href}>
            <ChevronRight className="w-3 h-3 text-[var(--border-strong)]" />
            {isLast ? (
              <span className="font-semibold text-[var(--text-primary)]" aria-current="page">
                {formattedTitle}
              </span>
            ) : (
              <Link
                href={href}
                className="hover:text-[var(--text-primary)] transition-colors"
              >
                {formattedTitle}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
