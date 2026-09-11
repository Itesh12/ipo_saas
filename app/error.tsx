"use client";

import React, { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error to monitoring if configured
    console.error("Application error boundary caught:", error);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-4 p-8 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-xl">
        <div className="w-12 h-12 rounded-2xl bg-[var(--status-danger-bg)] border border-[var(--status-danger)]/20 flex items-center justify-center text-[var(--status-danger)] mx-auto">
          <AlertTriangle className="w-6 h-6" />
        </div>

        <div className="space-y-1">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">
            Something went wrong
          </h2>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            An unexpected error occurred. Our team has been notified.
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
          <Button
            size="sm"
            variant="primary"
            onClick={() => reset()}
            leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
          >
            Try Again
          </Button>
          <Link href="/">
            <Button size="sm" variant="outline" leftIcon={<Home className="w-3.5 h-3.5" />}>
              Back to Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
