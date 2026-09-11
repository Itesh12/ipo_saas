"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "./BrandLogo";
import { ADMIN_NAV } from "@/config/navigation";
import {
  ShieldAlert,
  Layers,
  TrendingUp,
  BarChart3,
  Users,
  FileText,
  Database,
  ScrollText,
  ArrowLeft,
  CheckSquare,
  ShieldCheck,
  Activity,
  Scale,
  Users2,
  Network,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ADMIN_ICON_MAP: Record<string, React.ElementType> = {
  ShieldAlert,
  Layers,
  TrendingUp,
  BarChart3,
  Users,
  FileText,
  Database,
  ScrollText,
  CheckSquare,
  ShieldCheck,
  Activity,
  Scale,
  Users2,
  Network,
};

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex w-64 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] h-screen sticky top-0 transition-theme select-none z-30">
      {/* Brand Header with Admin Pill */}
      <div className="h-16 flex items-center justify-between px-6 border-b border-[var(--border-subtle)]">
        <BrandLogo href="/admin/dashboard" subtitle="Operations" />
        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] border border-[var(--brand-primary)]/20">
          Admin
        </span>
      </div>

      {/* Navigation Sections */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {ADMIN_NAV.map((section, idx) => (
          <div key={idx} className="space-y-1.5">
            {section.sectionTitle && (
              <h5 className="px-3 text-[10px] font-bold tracking-wider uppercase text-[var(--text-muted)]">
                {section.sectionTitle}
              </h5>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = ADMIN_ICON_MAP[item.iconName] || ShieldAlert;
                const isActive = pathname === item.href || (item.href !== "/admin/dashboard" && pathname.startsWith(item.href));

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all group",
                      isActive
                        ? "bg-[var(--brand-primary)] text-white font-semibold shadow-xs"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon
                        className={cn(
                          "w-4 h-4 transition-colors",
                          isActive
                            ? "text-white"
                            : "text-[var(--text-muted)] group-hover:text-[var(--text-primary)]"
                        )}
                      />
                      <span>{item.title}</span>
                    </div>

                    {item.minRole && (
                      <span
                        className={cn(
                          "text-[9px] px-1.5 py-0.2 rounded font-mono uppercase font-semibold",
                          isActive
                            ? "bg-white/20 text-white"
                            : "bg-[var(--bg-surface-elevated)] text-[var(--text-muted)]"
                        )}
                      >
                        {item.minRole}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Footer Return Link */}
      <div className="p-4 border-t border-[var(--border-subtle)]">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Exit to Investor App</span>
        </Link>
      </div>
    </aside>
  );
}
