/**
 * components/compare/ComparisonGrid.tsx
 *
 * Phase 6: Side-by-Side Comparison Matrix Grid
 * Renders head-to-head comparison modules with strict evidence segregation
 * between official statutory metrics and unofficial grey market sentiment.
 */

'use client';

import React from 'react';
import Link from 'next/link';
import { ComparisonMatrix } from '@/features/analytics/types/analytics.types';
import { AlertTriangle, ArrowUpRight, ShieldCheck } from 'lucide-react';

interface ComparisonGridProps {
  matrix: ComparisonMatrix;
}

export function ComparisonGrid({ matrix }: ComparisonGridProps) {
  const { ipos, modules } = matrix;

  if (!ipos || ipos.length === 0) {
    return (
      <div className="text-center py-16 border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-surface)]">
        <p className="text-sm font-medium text-[var(--color-text-primary)]">No IPOs selected for comparison.</p>
        <p className="text-xs text-[var(--color-text-secondary)] mt-1">Select 2 to 4 IPOs from the screener or enter slugs above.</p>
      </div>
    );
  }

  const renderModuleSection = (title: string, items: typeof modules.issueProfile, isUnofficial = false) => (
    <div className="space-y-2 pt-4 first:pt-0">
      <div className="flex items-center justify-between px-4 py-2 bg-[var(--color-bg-elevated)]/60 rounded-lg border border-[var(--color-border)]">
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-primary)]">{title}</span>
        {isUnofficial ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
            <AlertTriangle className="w-3 h-3" />
            <span>Unofficial Market Sentiment</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
            <ShieldCheck className="w-3 h-3" />
            <span>Official Disclosures</span>
          </span>
        )}
      </div>

      <div className="divide-y divide-[var(--color-border)] text-xs">
        {items.map((item) => (
          <div key={item.key} className="grid grid-cols-1 md:grid-cols-5 py-2.5 px-4 hover:bg-[var(--color-bg-elevated)]/30 transition-colors">
            <div className="md:col-span-1 font-medium text-[var(--color-text-secondary)] flex items-center">
              <span>{item.label}</span>
              {item.unit && <span className="text-[10px] text-[var(--color-text-muted)] ml-1">({item.unit})</span>}
            </div>

            <div className={`md:col-span-4 grid grid-cols-${ipos.length} gap-4`}>
              {ipos.map((ipo) => {
                const val = item.values[ipo.slug];
                const isNull = val === null || val === undefined;

                return (
                  <div key={ipo.slug} className="font-mono text-right md:text-left flex items-center">
                    {isNull ? (
                      <span className="text-[var(--color-text-muted)] italic text-[11px]">—</span>
                    ) : (
                      <span className="font-semibold text-[var(--color-text-primary)]">
                        {typeof val === 'number' ? val.toLocaleString('en-IN') : String(val)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-surface)] shadow-sm overflow-hidden divide-y divide-[var(--color-border)]">
      {/* Sticky Header Row with IPO Names */}
      <div className="grid grid-cols-1 md:grid-cols-5 p-4 bg-[var(--color-bg-elevated)] border-b border-[var(--color-border)] sticky top-0 z-10">
        <div className="hidden md:flex items-center text-xs font-semibold text-[var(--color-text-secondary)]">
          <span>Comparative Metrics</span>
        </div>

        <div className={`md:col-span-4 grid grid-cols-${ipos.length} gap-4`}>
          {ipos.map((ipo) => (
            <div key={ipo.slug} className="space-y-1">
              <Link href={`/ipos/${ipo.slug}`} className="group hover:text-indigo-500 transition-colors">
                <div className="font-bold text-sm text-[var(--color-text-primary)] flex items-center gap-1 group-hover:text-indigo-500">
                  <span className="truncate">{ipo.companyName}</span>
                  <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                </div>
              </Link>
              <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-muted)] font-mono">
                <span>{ipo.symbol || 'N/A'}</span>
                <span>•</span>
                <span className="capitalize">{ipo.category.replace('_', ' ')}</span>
                {ipo.score !== null && (
                  <span className="ml-auto font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded">
                    Score: {ipo.score}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-6">
        {renderModuleSection('1. Issue Profile & Capital Structure', modules.issueProfile)}
        {renderModuleSection('2. Valuation Multiples', modules.valuations)}
        {renderModuleSection('3. Financial Statement Trajectory', modules.financialTrajectory)}
        {renderModuleSection('4. Peer Group Comparisons', modules.peerComparison)}
        {renderModuleSection('5. Official Bidding & Subscription Demand', modules.officialSubscription)}
        {renderModuleSection('6. Unofficial Grey Market Sentiment (GMP)', modules.unofficialSentiment, true)}
        {renderModuleSection('7. Governance & Risk Profile', modules.governanceAndRisk)}
      </div>
    </div>
  );
}
