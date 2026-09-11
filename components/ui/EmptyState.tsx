import React from "react";
import { LucideIcon, Inbox } from "lucide-react";
import { Button } from "./Button";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
  actionComponent?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  isComingSoon?: boolean;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  actionLabel,
  onAction,
  actionHref,
  actionComponent,
  children,
  className,
  isComingSoon = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center p-8 md:p-12 text-center rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)]/50 transition-all",
        className
      )}
    >
      <div className="w-12 h-12 rounded-2xl bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--brand-primary)] shadow-xs mb-4">
        <Icon className="w-6 h-6" />
      </div>

      <div className="flex items-center gap-2 mb-1.5">
        <h4 className="text-base font-semibold text-[var(--text-primary)]">
          {title}
        </h4>
        {isComingSoon && (
          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] border border-[var(--brand-primary)]/20">
            Phase Feature
          </span>
        )}
      </div>

      <p className="text-xs text-[var(--text-secondary)] max-w-sm mb-6 leading-relaxed">
        {description}
      </p>

      {actionComponent && <div className="mb-2">{actionComponent}</div>}
      {children && <div className="mb-2">{children}</div>}

      {actionLabel && !actionComponent && (
        <>
          {actionHref ? (
            <a href={actionHref}>
              <Button size="sm" variant="primary">
                {actionLabel}
              </Button>
            </a>
          ) : (
            <Button size="sm" variant="primary" onClick={onAction}>
              {actionLabel}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
