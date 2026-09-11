"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ThemeSwitcher } from "@/components/theme/ThemeSwitcher";
import { Breadcrumbs } from "./Breadcrumbs";
import { MobileNav } from "./MobileNav";
import { NotificationBell } from "@/features/notifications/components/NotificationBell";
import { Search, Menu, User, Shield } from "lucide-react";

interface DashboardHeaderProps {
  isAdmin?: boolean;
  userRole?: string | null;
}

export function DashboardHeader({ isAdmin = false, userRole = null }: DashboardHeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const canAccessAdmin = userRole === "admin" || userRole === "super_admin";

  return (
    <>
      <header className="sticky top-0 z-20 h-16 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/80 backdrop-blur-md px-4 sm:px-6 lg:px-8 flex items-center justify-between transition-theme">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)]"
            aria-label="Open mobile navigation"
          >
            <Menu className="w-4 h-4" />
          </button>

          <div className="hidden sm:block">
            <Breadcrumbs />
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Quick Search trigger */}
          <button
            type="button"
            className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-xs text-[var(--text-muted)] hover:border-[var(--border-strong)] transition-colors cursor-pointer"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Search IPOs, companies...</span>
            <kbd className="text-[10px] bg-[var(--bg-surface)] px-1.5 py-0.5 rounded border border-[var(--border-subtle)] font-mono">
              ⌘K
            </kbd>
          </button>

          {/* Quick Access to Admin / User switch - strictly gated to admin and super_admin */}
          {canAccessAdmin && (
            isAdmin ? (
              <Link
                href="/dashboard"
                className="text-xs px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] font-medium flex items-center gap-1.5"
              >
                <User className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Investor Mode</span>
              </Link>
            ) : (
              <Link
                href="/admin/dashboard"
                className="text-xs px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] font-medium flex items-center gap-1.5"
              >
                <Shield className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
                <span className="hidden sm:inline">Admin Mode</span>
              </Link>
            )
          )}

          {/* Notifications button */}
          <NotificationBell />

          {/* Theme switcher */}
          <ThemeSwitcher variant="dropdown" />
        </div>
      </header>

      <MobileNav
        isOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        isAdmin={isAdmin}
      />
    </>
  );
}
