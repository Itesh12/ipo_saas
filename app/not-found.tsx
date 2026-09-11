import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { FileQuestion, Home, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-5 p-8 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-xl">
        <div className="w-14 h-14 rounded-2xl bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--brand-primary)] mx-auto">
          <FileQuestion className="w-7 h-7" />
        </div>

        <div className="space-y-1.5">
          <div className="text-xs font-bold uppercase tracking-widest text-[var(--brand-primary)]">
            404 Error
          </div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">
            Page Not Found
          </h2>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            The page or IPO record you are looking for does not exist or may have been relocated.
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
          <Link href="/">
            <Button size="sm" variant="primary" leftIcon={<Home className="w-3.5 h-3.5" />}>
              Return Home
            </Button>
          </Link>
          <Link href="/dashboard">
            <Button size="sm" variant="outline" leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}>
              Investor Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
