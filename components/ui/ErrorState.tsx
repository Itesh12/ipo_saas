import React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "./Button";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = "Something went wrong",
  message = "An unexpected error occurred while loading this section. Please try again.",
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center p-8 text-center rounded-2xl border border-[var(--status-danger)]/30 bg-[var(--status-danger-bg)] max-w-md mx-auto my-6",
        className
      )}
    >
      <div className="w-10 h-10 rounded-xl bg-[var(--status-danger)]/20 flex items-center justify-center text-[var(--status-danger)] mb-3">
        <AlertTriangle className="w-5 h-5" />
      </div>

      <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
        {title}
      </h4>

      <p className="text-xs text-[var(--text-secondary)] mb-4 leading-relaxed">
        {message}
      </p>

      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Try Again
        </Button>
      )}
    </div>
  );
}
