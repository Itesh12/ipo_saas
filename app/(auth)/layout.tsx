import React from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/layout/BrandLogo";
import { ThemeSwitcher } from "@/components/theme/ThemeSwitcher";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col justify-between bg-[var(--bg-app)] transition-theme">
      {/* Top Bar */}
      <div className="p-6 flex items-center justify-between max-w-7xl w-full mx-auto">
        <BrandLogo />
        <ThemeSwitcher variant="dropdown" />
      </div>

      {/* Auth Box Center */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md">{children}</div>
      </div>

      {/* Footer Disclaimer */}
      <div className="p-6 text-center text-xs text-[var(--text-muted)] border-t border-[var(--border-subtle)]">
        <p>Protected by Supabase Auth & PostgreSQL Row Level Security.</p>
        <div className="flex justify-center gap-4 mt-2">
          <Link href="/privacy" className="hover:text-[var(--text-primary)]">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-[var(--text-primary)]">Terms of Service</Link>
          <Link href="/" className="hover:text-[var(--text-primary)]">Back to Home</Link>
        </div>
      </div>
    </div>
  );
}
