import React from "react";
import { cn } from "@/lib/utils";

interface AuditDiffViewerProps {
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  className?: string;
}

export function AuditDiffViewer({ oldValues, newValues, className }: AuditDiffViewerProps) {
  if (!oldValues && !newValues) {
    return <div className="text-xs text-[var(--text-muted)] italic">No state changes recorded.</div>;
  }

  const allKeys = Array.from(
    new Set([...Object.keys(oldValues || {}), ...Object.keys(newValues || {})])
  );

  return (
    <div className={cn("space-y-3 font-mono text-xs", className)}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Previous State */}
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] overflow-hidden">
          <div className="px-3 py-2 bg-red-500/10 border-b border-[var(--border-subtle)] font-sans font-semibold text-red-400 text-[11px] flex items-center justify-between">
            <span>PREVIOUS STATE</span>
            <span>OLD</span>
          </div>
          <div className="p-3 max-h-80 overflow-y-auto space-y-1">
            {oldValues ? (
              allKeys.map((key) => {
                const isChanged = JSON.stringify(oldValues[key]) !== JSON.stringify(newValues?.[key]);
                return (
                  <div
                    key={`old-${key}`}
                    className={cn(
                      "p-1.5 rounded transition-colors break-all",
                      isChanged && "bg-red-500/15 text-red-200"
                    )}
                  >
                    <span className="text-[var(--text-muted)]">{key}: </span>
                    <span>{JSON.stringify(oldValues[key], null, 2) ?? "undefined"}</span>
                  </div>
                );
              })
            ) : (
              <div className="text-[var(--text-muted)] italic text-[11px]">No previous record (Created)</div>
            )}
          </div>
        </div>

        {/* New State */}
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] overflow-hidden">
          <div className="px-3 py-2 bg-emerald-500/10 border-b border-[var(--border-subtle)] font-sans font-semibold text-emerald-400 text-[11px] flex items-center justify-between">
            <span>NEW STATE</span>
            <span>NEW</span>
          </div>
          <div className="p-3 max-h-80 overflow-y-auto space-y-1">
            {newValues ? (
              allKeys.map((key) => {
                const isChanged = JSON.stringify(oldValues?.[key]) !== JSON.stringify(newValues[key]);
                return (
                  <div
                    key={`new-${key}`}
                    className={cn(
                      "p-1.5 rounded transition-colors break-all",
                      isChanged && "bg-emerald-500/15 text-emerald-200"
                    )}
                  >
                    <span className="text-[var(--text-muted)]">{key}: </span>
                    <span>{JSON.stringify(newValues[key], null, 2) ?? "undefined"}</span>
                  </div>
                );
              })
            ) : (
              <div className="text-[var(--text-muted)] italic text-[11px]">Record Removed</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
