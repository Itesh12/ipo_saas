"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "./BrandLogo";
import { USER_DASHBOARD_NAV } from "@/config/navigation";
import {
  LayoutDashboard,
  Star,
  FileCheck2,
  Users2,
  PieChart,
  Wallet,
  LineChart,
  FileSpreadsheet,
  Bell,
  Settings,
  Flame,
  TrendingUp,
  BarChart3,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard,
  Star,
  FileCheck2,
  Users2,
  PieChart,
  Wallet,
  LineChart,
  FileSpreadsheet,
  Bell,
  Settings,
  Flame,
  TrendingUp,
  BarChart3,
  SlidersHorizontal,
};

export function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex w-64 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] h-screen sticky top-0 transition-theme select-none z-30">
      {/* Brand Header */}
      <div className="h-16 flex items-center px-6 border-b border-[var(--border-subtle)]">
        <BrandLogo href="/dashboard" subtitle="Investor App" />
      </div>

      {/* Navigation Sections */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {USER_DASHBOARD_NAV.map((section, idx) => (
          <div key={idx} className="space-y-1.5">
            {section.sectionTitle && (
              <h5 className="px-3 text-[10px] font-bold tracking-wider uppercase text-[var(--text-muted)]">
                {section.sectionTitle}
              </h5>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = ICON_MAP[item.iconName] || LayoutDashboard;
                const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));

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

                    {item.badge && (
                      <span
                        className={cn(
                          "text-[9px] px-1.5 py-0.2 rounded-full font-bold",
                          isActive
                            ? "bg-white/20 text-white"
                            : "bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)]"
                        )}
                      >
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        {/* Public Discovery Shortcuts */}
        <div className="space-y-1.5 pt-4 border-t border-[var(--border-subtle)]">
          <h5 className="px-3 text-[10px] font-bold tracking-wider uppercase text-[var(--text-muted)]">
            Explore Market
          </h5>
          <div className="space-y-0.5">
            <Link
              href="/ipos"
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"
            >
              <Flame className="w-4 h-4 text-[var(--brand-primary)]" />
              <span>Current IPOs</span>
            </Link>
            <Link
              href="/ipo-gmp"
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"
            >
              <TrendingUp className="w-4 h-4 text-[var(--status-success)]" />
              <span>Live GMP</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Footer / Account Profile Pill */}
      <div className="p-4 border-t border-[var(--border-subtle)]">
        <Link
          href="/settings"
          className="flex items-center gap-3 p-2 rounded-xl hover:bg-[var(--bg-surface-hover)] transition-colors group"
        >
          <div className="w-8 h-8 rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] flex items-center justify-center font-bold text-xs text-[var(--text-primary)]">
            U
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
              Investor Account
            </div>
            <div className="text-[10px] text-[var(--text-muted)] truncate">
              Free Tier
            </div>
          </div>
        </Link>
      </div>
    </aside>
  );
}
