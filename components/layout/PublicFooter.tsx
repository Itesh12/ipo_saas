import React from "react";
import Link from "next/link";
import { BrandLogo } from "./BrandLogo";
import { ShieldCheck } from "lucide-react";

export function PublicFooter() {
  return (
    <footer className="border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] py-12 transition-theme">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
          {/* Col 1: Brand Info */}
          <div className="space-y-3 md:col-span-1">
            <BrandLogo />
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              The premier IPO operating system for Indian equity investors. Discover, research, manage family applications, and track portfolio gains with precision.
            </p>
          </div>

          {/* Col 2: Discovery */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-primary)] mb-3">
              IPO Discovery
            </h4>
            <ul className="space-y-2 text-xs text-[var(--text-secondary)]">
              <li><Link href="/ipos" className="hover:text-[var(--text-primary)] transition-colors">Current IPOs</Link></li>
              <li><Link href="/ipos?tab=upcoming" className="hover:text-[var(--text-primary)] transition-colors">Upcoming Issues</Link></li>
              <li><Link href="/ipo-gmp" className="hover:text-[var(--text-primary)] transition-colors">Grey Market Premium (GMP)</Link></li>
              <li><Link href="/ipo-subscription" className="hover:text-[var(--text-primary)] transition-colors">Live Subscription Status</Link></li>
              <li><Link href="/ipo-calendar" className="hover:text-[var(--text-primary)] transition-colors">IPO Calendar</Link></li>
            </ul>
          </div>

          {/* Col 3: Research & Tools */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-primary)] mb-3">
              Analytics & Tools
            </h4>
            <ul className="space-y-2 text-xs text-[var(--text-secondary)]">
              <li><Link href="/ipo-screener" className="hover:text-[var(--text-primary)] transition-colors">IPO Screener</Link></li>
              <li><Link href="/compare" className="hover:text-[var(--text-primary)] transition-colors">IPO Comparison</Link></li>
              <li><Link href="/dashboard" className="hover:text-[var(--text-primary)] transition-colors">Investor Dashboard</Link></li>
              <li><Link href="/news" className="hover:text-[var(--text-primary)] transition-colors">Market Circulars & News</Link></li>
            </ul>
          </div>

          {/* Col 4: Trust & Compliance */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-primary)] mb-3">
              Compliance & Safety
            </h4>
            <div className="flex items-start gap-2 text-xs text-[var(--text-muted)]">
              <ShieldCheck className="w-4 h-4 text-[var(--brand-primary)] shrink-0 mt-0.5" />
              <p className="text-[11px] leading-relaxed">
                Zero secret credentials stored. We never store UPI PINs, broker passwords, or banking access keys.
              </p>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
              Grey Market Premium (GMP) data is unofficial market intelligence for tracking purposes and does not guarantee listing returns.
            </p>
          </div>
        </div>

        {/* Bottom Bar & Legal Disclaimer */}
        <div className="pt-8 border-t border-[var(--border-subtle)] flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-[var(--text-muted)]">
          <p>© {new Date().getFullYear()} IPO OS. All rights reserved. Built for Indian capital markets.</p>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="hover:text-[var(--text-primary)]">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-[var(--text-primary)]">Terms of Service</Link>
            <Link href="/disclaimer" className="hover:text-[var(--text-primary)]">SEBI Disclaimer</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
