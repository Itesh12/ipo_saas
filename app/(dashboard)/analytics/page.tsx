/**
 * app/(dashboard)/analytics/page.tsx
 *
 * Phase 6 Stage 2: Investor Portfolio Analytics & Concentration Intelligence
 * Dual-mode HHI (market-value primary with valuation coverage disclosure; invested-cost fallback).
 * Sector/Industry exposure and current book liquidity analysis.
 */

import React from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { PortfolioConcentrationCard } from '@/components/analytics/PortfolioConcentrationCard';
import { SectorExposureChart } from '@/components/analytics/SectorExposureChart';
import { PortfolioAnalyticsService } from '@/features/analytics/services/portfolioAnalyticsService';
import { PortfolioValuationService, type OwnershipScope } from '@/features/finance/services/portfolioValuationService';
import { createClient } from '@/lib/supabase/server';
import { ShieldAlert, Wallet, Sparkles, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface AnalyticsPageProps {
  searchParams: Promise<{
    scope?: string;
    applicantId?: string;
  }>;
}

import { requireAuth } from '@/lib/security/auth-guards';

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const resolvedParams = await searchParams;
  const scope = (resolvedParams.scope || 'personal') as OwnershipScope;
  const applicantId = resolvedParams.applicantId;

  const authUser = await requireAuth();
  const userId = authUser.id;
  const supabase = await createClient();

  interface ApplicantOption {
    id: string;
    display_name: string;
    pan_masked: string;
    relationship: string;
  }

  // Fetch applicant options
  const { data: rawApplicants } = await supabase
    .from('applicant_profiles')
    .select('id, display_name, pan_masked, relationship')
    .eq('user_id', userId)
    .order('display_name');

  const applicants: ApplicantOption[] = (rawApplicants as unknown as ApplicantOption[]) || [];

  // Fetch analytics metrics concurrently
  const [concentrationReport, sectorExposures, capitalSummary, portfolioData] = await Promise.all([
    PortfolioAnalyticsService.getConcentrationReport(userId, scope, applicantId),
    PortfolioAnalyticsService.getSectorExposure(userId, scope, applicantId),
    PortfolioValuationService.getUserCapitalBreakdown(userId),
    PortfolioValuationService.getUserPortfolioHoldings(userId, scope, applicantId),
  ]);

  const typicalLotSize = 15000;
  const liquidityCheck = await PortfolioAnalyticsService.evaluateCapitalFeasibility(userId, typicalLotSize);
  const maxLotsPossible = Math.max(0, Math.floor(liquidityCheck.availableBookCash / typicalLotSize));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader
          title="Portfolio Analytics & Concentration Intelligence"
          description="Institutional risk metrics, dual-mode sector concentration (HHI), and book liquidity feasibility."
        />
        <div className="flex items-center gap-2">
          <Link href="/ipo-screener">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>IPO Screener</span>
            </Button>
          </Link>
          <Link href="/portfolio">
            <Button variant="outline" size="sm" className="gap-1.5">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              <span>View Portfolio</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Scope Filter Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-xl">
        <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text-secondary)]">
          <span>Ownership Scope:</span>
          <div className="flex items-center gap-1">
            <Link
              href={`/analytics?scope=personal`}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                scope === 'personal'
                  ? 'bg-primary text-white font-semibold'
                  : 'bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              Personal
            </Link>
            <Link
              href={`/analytics?scope=family_all`}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                scope === 'family_all'
                  ? 'bg-primary text-white font-semibold'
                  : 'bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              Family Pool
            </Link>
            {applicants.length > 0 && (
              <Link
                href={`/analytics?scope=applicant&applicantId=${applicants[0].id}`}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  scope === 'applicant'
                    ? 'bg-primary text-white font-semibold'
                    : 'bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                By Applicant
              </Link>
            )}
          </div>
        </div>

        {scope === 'applicant' && applicants.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--color-text-secondary)]">Applicant:</span>
            <div className="flex flex-wrap items-center gap-1">
              {applicants.map((a) => (
                <Link
                  key={a.id}
                  href={`/analytics?scope=applicant&applicantId=${a.id}`}
                  className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                    applicantId === a.id
                      ? 'bg-primary text-white border-primary font-semibold'
                      : 'bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] hover:border-[var(--color-text-secondary)]'
                  }`}
                >
                  {a.display_name} ({a.pan_masked})
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Top Stat Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)]">
          <div className="text-xs text-[var(--color-text-secondary)]">Active Holdings</div>
          <div className="text-2xl font-bold mt-1 text-[var(--color-text-primary)]">
            {portfolioData.holdings.length}
          </div>
          <div className="text-[11px] text-[var(--color-text-secondary)] mt-1">
            Across {concentrationReport.sectorBreakdown.length} sectors
          </div>
        </div>

        <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)]">
          <div className="text-xs text-[var(--color-text-secondary)]">Current Book Liquidity</div>
          <div className="text-2xl font-bold mt-1 text-emerald-500">
            ₹{capitalSummary.availableCash.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-[var(--color-text-secondary)] mt-1">
            Available in Account 1010 (not bank verified)
          </div>
        </div>

        <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)]">
          <div className="text-xs text-[var(--color-text-secondary)]">Blocked ASBA Lien</div>
          <div className="text-2xl font-bold mt-1 text-amber-500">
            ₹{capitalSummary.blockedLien.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-[var(--color-text-secondary)] mt-1">
            Pending allotment or unfreeze
          </div>
        </div>

        <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)]">
          <div className="text-xs text-[var(--color-text-secondary)]">Lot Bidding Feasibility</div>
          <div className="text-2xl font-bold mt-1 text-[var(--color-text-primary)]">
            {maxLotsPossible} Lots
          </div>
          <div className="text-[11px] text-[var(--color-text-secondary)] mt-1">
            Based on standard ₹{typicalLotSize.toLocaleString('en-IN')} retail lot
          </div>
        </div>
      </div>

      {/* Concentration Index & Sector Exposures Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PortfolioConcentrationCard report={concentrationReport} />
        <SectorExposureChart sectors={sectorExposures} />
      </div>

      {/* Current Book Liquidity Feasibility Details Card */}
      <div className="p-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] space-y-4">
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-emerald-500" />
          <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
            Current Book Liquidity Context
          </h3>
        </div>

        <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
          The IPO platform computes your available bidding headroom against <strong>Account 1010 (Liquid Capital &amp; Bank)</strong> from your double-entry General Ledger.
          This balance reflects user-declared baseline deposits and completed allotment refunds minus active ASBA liens.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div className="p-3 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border)]">
            <div className="text-[11px] text-[var(--color-text-secondary)]">Available Liquid Cash</div>
            <div className="text-lg font-bold text-[var(--color-text-primary)] mt-0.5">
              ₹{liquidityCheck.availableBookCash.toLocaleString('en-IN')}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border)]">
            <div className="text-[11px] text-[var(--color-text-secondary)]">Est. Minimum Lot Size</div>
            <div className="text-lg font-bold text-[var(--color-text-primary)] mt-0.5">
              ₹{liquidityCheck.requiredLotInvestment.toLocaleString('en-IN')}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border)]">
            <div className="text-[11px] text-[var(--color-text-secondary)]">Capital Feasibility Status</div>
            <div className={`text-base font-bold mt-0.5 ${liquidityCheck.isSufficientForLot ? 'text-emerald-500' : 'text-amber-500'}`}>
              {liquidityCheck.isSufficientForLot ? '✓ Sufficient Liquidity' : '⚠️ Insufficient for Lot'}
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300">
          <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <strong>Important Regulatory &amp; Accounting Disclosure: </strong>
            Book liquidity calculations are based exclusively on internal ledger accounts. Antigravity does not connect to external bank APIs or verify live bank balances. Always confirm bank account funds prior to UPI mandate authorization.
          </div>
        </div>
      </div>
    </div>
  );
}
