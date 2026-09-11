import React from "react";
import { WorkItemSeverity, WorkItemStatus } from "../../types/workQueue.types";
import { cn } from "@/lib/utils";

interface SeverityBadgeProps {
  severity: WorkItemSeverity;
  className?: string;
}

export function WorkItemSeverityBadge({ severity, className }: SeverityBadgeProps) {
  const config = {
    critical: {
      label: "Critical",
      className: "bg-red-500/10 text-red-500 border-red-500/20",
    },
    high: {
      label: "High",
      className: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    },
    medium: {
      label: "Medium",
      className: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    },
    low: {
      label: "Low",
      className: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    },
  }[severity] || {
    label: severity,
    className: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold tracking-wider uppercase border",
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}

interface StatusBadgeProps {
  status: WorkItemStatus;
  className?: string;
}

export function WorkItemStatusBadge({ status, className }: StatusBadgeProps) {
  const config = {
    open: {
      label: "Open",
      className: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    },
    investigating: {
      label: "Investigating",
      className: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    },
    resolved: {
      label: "Resolved",
      className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    },
    dismissed: {
      label: "Dismissed",
      className: "bg-gray-500/10 text-gray-400 border-gray-500/20",
    },
  }[status] || {
    label: status,
    className: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold tracking-wider uppercase border",
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}
