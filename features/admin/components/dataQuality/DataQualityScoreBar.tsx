import React from "react";
import { cn } from "@/lib/utils";

interface DataQualityScoreBarProps {
  score: number;
  className?: string;
  showText?: boolean;
}

export function DataQualityScoreBar({
  score,
  className,
  showText = true,
}: DataQualityScoreBarProps) {
  const normalized = Math.min(100, Math.max(0, score));

  const colorClass =
    normalized >= 80
      ? "bg-emerald-500"
      : normalized >= 50
      ? "bg-yellow-500"
      : "bg-red-500";

  const textColor =
    normalized >= 80
      ? "text-emerald-400"
      : normalized >= 50
      ? "text-yellow-400"
      : "text-red-400";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex-1 h-2 rounded-full bg-[var(--bg-surface-elevated)] overflow-hidden border border-[var(--border-subtle)]">
        <div
          className={cn("h-full transition-all duration-500 rounded-full", colorClass)}
          style={{ width: `${normalized}%` }}
        />
      </div>
      {showText && (
        <span className={cn("text-xs font-mono font-bold min-w-[36px] text-right", textColor)}>
          {normalized}%
        </span>
      )}
    </div>
  );
}
