import React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?:
    | "default"
    | "secondary"
    | "success"
    | "warning"
    | "danger"
    | "info"
    | "outline";
  size?: "sm" | "md";
}

export function Badge({
  className,
  variant = "default",
  size = "sm",
  children,
  ...props
}: BadgeProps) {
  const variantStyles = {
    default:
      "bg-[var(--brand-primary)] text-white border-transparent",
    secondary:
      "bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)]",
    success:
      "bg-[var(--status-success-bg)] text-[var(--status-success)] border-[var(--status-success)]/20",
    warning:
      "bg-[var(--status-warning-bg)] text-[var(--status-warning)] border-[var(--status-warning)]/20",
    danger:
      "bg-[var(--status-danger-bg)] text-[var(--status-danger)] border-[var(--status-danger)]/20",
    info:
      "bg-[var(--status-info-bg)] text-[var(--status-info)] border-[var(--status-info)]/20",
    outline:
      "border border-[var(--border-strong)] text-[var(--text-primary)] bg-transparent",
  };

  const sizeStyles = {
    sm: "px-2 py-0.5 text-[11px] font-medium",
    md: "px-2.5 py-1 text-xs font-semibold",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border transition-colors select-none",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
