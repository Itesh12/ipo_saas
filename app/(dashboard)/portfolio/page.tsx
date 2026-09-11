/**
 * app/(dashboard)/portfolio/page.tsx
 *
 * Phase 5 Stage 2: IPO Portfolio & Allotment Holdings Dashboard
 * Respects 4-tier ownership (Personal vs Family Pool vs Applicant Direct vs External Tracked).
 * Missing market prices are handled as `null` with explicit alerts (never ₹0).
 */

import React from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { HoldingsTable } from '@/components/finance/HoldingsTable';
import { PortfolioValuationService, type OwnershipScope } from '@/features/finance/services/portfolioValuationService';
import { createClient } from '@/lib/supabase/server';
import {
  TrendingUp,
  PieChart,
  ShieldCheck,
  AlertTriangle,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';

import { requireAuth } from '@/lib/security/auth-guards';

interface PortfolioPageProps {
  searchParams: Promise<{
    scope?: string;
    applicantId?: string;
  }>;
}

export default async function PortfolioPage({ searchParams }: PortfolioPageProps) {
  const resolvedParams = await searchParams;
  const scope = (resolvedParams.scope || 'personal') as OwnershipScope;
  const applicantId = resolvedParams.applicantId;

  const authUser = await requireAuth();
  const userId = authUser.id;
  const supabase = await createClient();

  // Fetch applicant options for tabs/filters
  const { data: rawApplicants } = await supabase
    .from('applicant_profiles')
    .select('id, display_name, pan_masked, relationship')
    .eq('user_id', userId)
    .order('display_name');

  type ApplicantItem = {
    id: string;
    display_name: string;
    pan_masked: string | null;
    relationship: string;
  };

  const applicants = (rawApplicants || []) as unknown as ApplicantItem[];

  // Fetch holdings and valuation for the chosen scope
  const { summary, holdings } = await PortfolioValuationService.getUserPortfolioHoldings(userId, scope, applicantId);

  const totalQuantity = holdings.reduce((sum, h) => sum + h.quantity, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="IPO Portfolio & Allotments"
        description="Allotted shareholdings, average acquisition cost, verified price snapshot valuation, and strictly segregated ownership positions."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/capital">
              <Button size="sm" variant="outline" leftIcon={<Wallet className="w-3.5 h-3.5" />}>
                Capital Ledger
              </Button>
            </Link>
          </div>
        }
      />

      {/* Scope Navigation Bar */}
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] pb-3 overflow-x-auto text-xs">
        <Link
          href="/portfolio?scope=personal"
          className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
            scope === 'personal'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]'
          }`}
        >
          User Personal
        </Link>
        <Link
          href="/portfolio?scope=family_all"
          className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
            scope === 'family_all'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]'
          }`}
        >
          Family Pool & Direct
        </Link>
        <Link
          href="/portfolio?scope=external"
          className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
            scope === 'external'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]'
          }`}
        >
          External / Friend Tracked (Isolated)
        </Link>

        {applicants.length > 0 && (
          <div className="h-4 w-[1px] bg-[var(--color-border)] mx-1" />
        )}

        {applicants.map((app) => (
          <Link
            key={app.id}
            href={`/portfolio?scope=applicant&applicantId=${app.id}`}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              scope === 'applicant' && applicantId === app.id
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]'
            }`}
          >
            {app.display_name} ({app.relationship})
          </Link>
        ))}
      </div>

      {/* Ownership Isolation Banner */}
      {scope === 'external' ? (
        <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 dark:text-amber-200">
            <p className="font-semibold text-sm">Strict Separation: Externally Tracked Securities</p>
            <p className="mt-0.5 text-amber-700 dark:text-amber-300">
              Securities held on behalf of friends or external parties are tracked here for allotment verification only.
              These holdings have <strong>zero monetary impact</strong> on your personal cash ledger, bank balance, or personal net-worth calculations.
            </p>
          </div>
        </div>
      ) : (
        <div className="p-3.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
          <div className="text-xs text-indigo-900 dark:text-indigo-200">
            <p className="font-semibold">General Ledger Synchronized</p>
            <p className="mt-0.5 text-indigo-700 dark:text-indigo-300">
              Acquisition costs reflect posted double-entry journal entries from Account 1110 (Investments: IPO Equities).
            </p>
          </div>
        </div>
      )}

      {/* Key Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)]">
          <div className="flex items-center justify-between text-xs text-[var(--color-text-secondary)]">
            <span>Total Invested Capital</span>
            <PieChart className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="mt-2 text-xl font-bold font-mono text-[var(--color-text-primary)]">
            ₹{summary.totalInvested.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-[var(--color-text-muted)] mt-1">
            {holdings.length} security positions
          </div>
        </div>

        <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)]">
          <div className="flex items-center justify-between text-xs text-[var(--color-text-secondary)]">
            <span>Current Market Valuation</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-xl font-bold font-mono text-[var(--color-text-primary)]">
            {summary.currentMarketValue !== null ? (
              `₹${summary.currentMarketValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
            ) : (
              <span className="text-amber-500 text-base font-normal">Pending price snapshot</span>
            )}
          </div>
          <div className="text-[11px] text-[var(--color-text-muted)] mt-1">
            {summary.unpricedHoldingsCount > 0 ? (
              <span className="text-amber-600 dark:text-amber-400 font-medium">
                {summary.unpricedHoldingsCount} holding(s) pending verified price
              </span>
            ) : (
              'All quotes verified'
            )}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)]">
          <div className="flex items-center justify-between text-xs text-[var(--color-text-secondary)]">
            <span>Unrealized P&L</span>
            <span className="text-xs font-semibold">{summary.totalUnrealizedPnlPct !== null ? `${summary.totalUnrealizedPnlPct.toFixed(2)}%` : ''}</span>
          </div>
          <div className="mt-2 text-xl font-bold font-mono">
            {summary.totalUnrealizedPnl !== null ? (
              <span className={summary.totalUnrealizedPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                {summary.totalUnrealizedPnl >= 0 ? '+' : ''}₹{summary.totalUnrealizedPnl.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
            ) : (
              <span className="text-[var(--color-text-muted)] text-base font-normal">—</span>
            )}
          </div>
          <div className="text-[11px] text-[var(--color-text-muted)] mt-1">
            Based on active quote snapshots
          </div>
        </div>

        <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)]">
          <div className="flex items-center justify-between text-xs text-[var(--color-text-secondary)]">
            <span>Total Quantity Held</span>
            <span className="text-xs text-[var(--color-text-muted)]">Equity Shares</span>
          </div>
          <div className="mt-2 text-xl font-bold font-mono text-[var(--color-text-primary)]">
            {totalQuantity.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-[var(--color-text-muted)] mt-1 font-mono">
            Scope: {scope.toUpperCase()}
          </div>
        </div>
      </div>

      {/* Holdings Table */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Holdings Breakdown</h3>
        <HoldingsTable holdings={holdings} />
      </div>
    </div>
  );
}
