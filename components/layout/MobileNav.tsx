"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X, LogOut } from "lucide-react";
import { BrandLogo } from "./BrandLogo";
import { USER_DASHBOARD_NAV, ADMIN_NAV, NavItem } from "@/config/navigation";
import { ThemeSwitcher } from "@/components/theme/ThemeSwitcher";
import { cn } from "@/lib/utils";

interface MobileNavProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin?: boolean;
}

export function MobileNav({ isOpen, onClose, isAdmin = false }: MobileNavProps) {
  const pathname = usePathname();
  const navSections = isAdmin ? ADMIN_NAV : USER_DASHBOARD_NAV;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 left-0 w-72 bg-[var(--bg-surface)] border-r border-[var(--border-subtle)] p-5 flex flex-col shadow-2xl z-10 animate-in slide-in-from-left duration-200">
        <div className="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)]">
          <BrandLogo subtitle={isAdmin ? "Operations" : "Investor App"} />
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"
            aria-label="Close navigation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Links */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {navSections.map((section, idx) => (
            <div key={idx} className="space-y-1">
              {section.sectionTitle && (
                <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  {section.sectionTitle}
                </div>
              )}
              {section.items.map((item: NavItem) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      "flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors",
                      isActive
                        ? "bg-[var(--brand-primary)] text-white font-semibold"
                        : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]"
                    )}
                  >
                    <span>{item.title}</span>
                    {item.badge && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded-full font-bold bg-white/20 text-white">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer actions */}
        <div className="pt-4 border-t border-[var(--border-subtle)] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--text-muted)]">Theme</span>
            <ThemeSwitcher variant="dropdown" />
          </div>
          <Link
            href="/login"
            onClick={onClose}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-[var(--status-danger)] hover:bg-[var(--status-danger-bg)] transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
