import React from "react";
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { Card } from "./Card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  change?: number; // e.g. +12.4% or -3.2%
  changeLabel?: string;
  icon?: LucideIcon;
  subtext?: string;
  className?: string;
}

export function StatCard({
  title,
  value,
  change,
  changeLabel = "vs last month",
  icon: Icon,
  subtext,
  className,
}: StatCardProps) {
  const isPositive = change !== undefined && change >= 0;

  return (
    <Card className={cn("relative overflow-hidden transition-all hover:border-[var(--border-strong)]", className)}>
      <div className="flex items-center justify-between pb-2">
        <span className="text-xs font-medium text-[var(--text-secondary)]">
          {title}
        </span>
        {Icon && (
          <div className="w-8 h-8 rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--brand-primary)]">
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>

      <div className="flex items-baseline gap-2 mt-1">
        <div className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)]">
          {value}
        </div>
      </div>

      {(change !== undefined || subtext) && (
        <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-[var(--border-subtle)]/60 text-xs">
          {change !== undefined && (
            <div
              className={cn(
                "inline-flex items-center gap-1 font-semibold px-1.5 py-0.5 rounded",
                isPositive
                  ? "text-[var(--status-success)] bg-[var(--status-success-bg)]"
                  : "text-[var(--status-danger)] bg-[var(--status-danger-bg)]"
              )}
            >
              {isPositive ? (
                <TrendingUp className="w-3 h-3" />
              ) : (
                <TrendingDown className="w-3 h-3" />
              )}
              <span>{Math.abs(change)}%</span>
            </div>
          )}
          <span className="text-[var(--text-muted)] text-[11px] truncate">
            {subtext || changeLabel}
          </span>
        </div>
      )}
    </Card>
  );
}
