import React from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { ComparisonGrid } from '@/components/compare/ComparisonGrid';
import { IpoComparisonService } from '@/features/analytics/services/ipoComparisonService';
import { IpoScreenerService } from '@/features/analytics/services/ipoScreenerService';
import { PlusCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface ComparePageProps {
  searchParams: Promise<{
    slugs?: string;
    slug?: string | string[];
  }>;
}

export default async function ComparePage({ searchParams }: ComparePageProps) {
  const resolvedParams = await searchParams;

  let slugsToCompare: string[] = [];

  if (resolvedParams.slugs) {
    slugsToCompare = resolvedParams.slugs
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  } else if (resolvedParams.slug) {
    if (Array.isArray(resolvedParams.slug)) {
      slugsToCompare = resolvedParams.slug;
    } else {
      slugsToCompare = [resolvedParams.slug];
    }
  }

  // If no slugs or only 1 slug provided, we can fetch available IPOs to let the user choose
  let matrix = await IpoComparisonService.buildComparisonMatrix(slugsToCompare);

  // If empty and no slugs specified, grab top 2 available IPOs for demonstration
  if (matrix.ipos.length === 0 && slugsToCompare.length === 0) {
    const { records } = await IpoScreenerService.queryScreener({ limit: 2 });
    if (records.length >= 2) {
      slugsToCompare = records.slice(0, 2).map((r) => r.slug);
      matrix = await IpoComparisonService.buildComparisonMatrix(slugsToCompare);
    }
  }

  // Also fetch list of published IPOs so user can add/switch comparisons
  const availableQuery = await IpoScreenerService.queryScreener({ limit: 12 });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader
          title="Side-by-Side IPO Comparison Matrix"
          description="Contrasting financials, valuations, lot requirements, anchor backing, subscription momentum, and unofficial GMP sentiment."
        />
        <div className="flex items-center gap-3">
          <Link href="/ipo-screener">
            <Button variant="outline" size="sm" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Screener</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Comparison Selector / Quick Switcher */}
      <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-xl p-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] mb-3">
          Active Comparison ({matrix.ipos.length}/4 Selected)
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {matrix.ipos.map((ipo) => {
            const remainingSlugs = slugsToCompare.filter((s) => s !== ipo.slug);
            const removeUrl = `/compare?slugs=${remainingSlugs.join(',')}`;
            return (
              <span
                key={ipo.slug}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-primary)]"
              >
                <span>{ipo.companyName}</span>
                <Link
                  href={removeUrl}
                  className="text-[var(--color-text-secondary)] hover:text-red-500 font-bold ml-1"
                  title="Remove from comparison"
                >
                  ×
                </Link>
              </span>
            );
          })}

          {matrix.ipos.length < 4 && (
            <details className="relative inline-block">
              <summary className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-[var(--color-border)] text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-text-secondary)] cursor-pointer list-none">
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Add IPO to compare</span>
              </summary>
              <div className="absolute left-0 mt-2 w-64 bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-lg shadow-xl p-2 z-30 max-h-60 overflow-y-auto">
                {availableQuery.records
                  .filter((r) => !slugsToCompare.includes(r.slug))
                  .map((r) => {
                    const newSlugs = [...slugsToCompare, r.slug];
                    return (
                      <Link
                        key={r.slug}
                        href={`/compare?slugs=${newSlugs.join(',')}`}
                        className="block px-3 py-2 text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)] rounded-md"
                      >
                        <div className="font-semibold">{r.company_name}</div>
                        <div className="text-[10px] text-[var(--color-text-secondary)]">
                          {r.issue_type.toUpperCase()} • P/E: {r.pe_ratio_high ? `${r.pe_ratio_high.toFixed(1)}x` : '—'}
                        </div>
                      </Link>
                    );
                  })}
              </div>
            </details>
          )}
        </div>
      </div>

      {/* Comparison Grid */}
      <ComparisonGrid matrix={matrix} />
    </div>
  );
}
