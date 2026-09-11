import React from "react";
import { IPOTimelineMilestone } from "@/features/ipo/types/ipo.types";
import { formatDate } from "@/lib/utils";
import { CheckCircle2, Clock, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

interface IPOTimelineProps {
  milestones: IPOTimelineMilestone[];
  className?: string;
}

export function IPOTimeline({ milestones, className }: IPOTimelineProps) {
  return (
    <div className={cn("w-full py-4", className)}>
      <div className="relative">
        {/* Desktop / Tablet Horizontal Timeline */}
        <div className="hidden md:grid md:grid-cols-6 gap-2 relative">
          {/* Connecting line */}
          <div className="absolute top-4 left-6 right-6 h-0.5 bg-[var(--border-subtle)] z-0" />

          {milestones.map((milestone, index) => {
            const isCompleted = milestone.status === "completed";
            const isActive = milestone.status === "active";

            return (
              <div key={index} className="relative z-10 flex flex-col items-center text-center px-1">
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center transition-all bg-[var(--bg-surface)] border-2 shadow-xs",
                    isCompleted && "border-[var(--status-success)] text-[var(--status-success)] bg-[var(--status-success-bg)]",
                    isActive && "border-[var(--brand-primary)] text-[var(--brand-primary)] ring-4 ring-[var(--brand-primary)]/20 animate-pulse",
                    !isCompleted && !isActive && "border-[var(--border-strong)] text-[var(--text-muted)]"
                  )}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : isActive ? (
                    <Clock className="w-4 h-4" />
                  ) : (
                    <Circle className="w-3.5 h-3.5" />
                  )}
                </div>

                <div className="mt-2.5 space-y-0.5">
                  <div className="text-xs font-semibold text-[var(--text-primary)]">
                    {milestone.title}
                  </div>
                  <div className="text-[11px] font-medium text-[var(--brand-primary)]">
                    {formatDate(milestone.date)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Mobile Vertical Timeline */}
        <div className="md:hidden space-y-4 relative pl-6 border-l-2 border-[var(--border-subtle)] ml-4">
          {milestones.map((milestone, index) => {
            const isCompleted = milestone.status === "completed";
            const isActive = milestone.status === "active";

            return (
              <div key={index} className="relative group">
                <div
                  className={cn(
                    "absolute -left-[31px] top-0 w-6 h-6 rounded-full flex items-center justify-center bg-[var(--bg-surface)] border-2",
                    isCompleted && "border-[var(--status-success)] text-[var(--status-success)] bg-[var(--status-success-bg)]",
                    isActive && "border-[var(--brand-primary)] text-[var(--brand-primary)] ring-2 ring-[var(--brand-primary)]/20",
                    !isCompleted && !isActive && "border-[var(--border-strong)] text-[var(--text-muted)]"
                  )}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="w-3 h-3" />
                  ) : isActive ? (
                    <Clock className="w-3 h-3" />
                  ) : (
                    <Circle className="w-2.5 h-2.5" />
                  )}
                </div>

                <div className="space-y-0.5 pb-2">
                  <div className="text-xs font-semibold text-[var(--text-primary)]">
                    {milestone.title}
                  </div>
                  <div className="text-xs text-[var(--brand-primary)] font-medium">
                    {formatDate(milestone.date)}
                  </div>
                  {milestone.description && (
                    <p className="text-[11px] text-[var(--text-muted)] leading-tight">
                      {milestone.description}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
