/**
 * components/screener/ScreenerTable.tsx
 *
 * Phase 6: Multi-Factor Screener Data Table
 * Renders filtered IPOs with score badges, valuation multiples, subscription demand,
 * and quick-compare selection checkboxes.
 */

'use client';

import React from 'react';
import Link from 'next/link';
import { ScreenerRecord } from '@/features/analytics/types/analytics.types';
import { ArrowUpDown, ArrowUpRight, AlertCircle } from 'lucide-react';

interface ScreenerTableProps {
  records: ScreenerRecord[];
  sortBy: string;
  sortDirection: 'asc' | 'desc';
  onSortChange: (column: string) => void;
  selectedCompareSlugs: string[];
  onToggleCompare: (slug: string) => void;
}

export function ScreenerTable({
  records,
  sortBy,
  sortDirection,
  onSortChange,
  selectedCompareSlugs,
  onToggleCompare,
}: ScreenerTableProps) {
  if (!records || records.length === 0) {
    return (
      <div className="text-center py-16 border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-surface)]">
        <AlertCircle className="w-8 h-8 text-[var(--color-text-muted)] mx-auto mb-2" />
        <p className="text-sm font-medium text-[var(--color-text-primary)]">No IPOs match the active filter criteria.</p>
        <p className="text-xs text-[var(--color-text-secondary)] mt-1">Try relaxing filters or enabling unpriced/early-stage issues.</p>
      </div>
    );
  }

  const renderSortHeader = (column: string, label: string, align: 'left' | 'right' = 'left') => (
    <th
      onClick={() => onSortChange(column)}
      className={`py-3 px-4 cursor-pointer hover:text-[var(--color-text-primary)] transition-colors select-none text-${align}`}
    >
      <div className={`inline-flex items-center gap-1.5 ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
        <span>{label}</span>
        <ArrowUpDown className={`w-3 h-3 ${sortBy === column ? (sortDirection === 'asc' ? 'text-indigo-500 rotate-180' : 'text-indigo-500') : 'text-[var(--color-text-muted)]'}`} />
      </div>
    </th>
  );

  return (
    <div className="overflow-x-auto border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-surface)] shadow-sm">
      <table className="w-full text-left border-collapse text-xs">
        <thead>
          <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] font-medium">
            <th className="py-3 px-3 w-10 text-center">Compare</th>
            {renderSortHeader('company_name', 'Company / Issue')}
            {renderSortHeader('status', 'Status')}
            {renderSortHeader('price_band_high', 'Price Band (₹)', 'right')}
            {renderSortHeader('min_investment', 'Min Lot (₹)', 'right')}
            {renderSortHeader('issue_size_cr', 'Size (₹ Cr)', 'right')}
            {renderSortHeader('pe_ratio_high', 'P/E (High)', 'right')}
            {renderSortHeader('latest_roe_pct', 'ROE %', 'right')}
            {renderSortHeader('latest_subscription_x', 'Demand (x)', 'right')}
            {renderSortHeader('overall_score', 'IPO Score', 'right')}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)] text-[var(--color-text-primary)]">
          {records.map((r) => {
            const isCompareSelected = selectedCompareSlugs.includes(r.slug);
            const scoreColor = (r.overall_score || 0) >= 75
              ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
              : (r.overall_score || 0) >= 60
              ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/20'
              : 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20';

            return (
              <tr key={r.id} className="hover:bg-[var(--color-bg-elevated)]/50 transition-colors">
                <td className="py-3 px-3 text-center">
                  <input
                    type="checkbox"
                    checked={isCompareSelected}
                    disabled={!isCompareSelected && selectedCompareSlugs.length >= 4}
                    onChange={() => onToggleCompare(r.slug)}
                    className="rounded border-[var(--color-border)] text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
                  />
                </td>

                <td className="py-3 px-4">
                  <Link href={`/ipos/${r.slug}`} className="group font-medium hover:text-indigo-500 transition-colors">
                    <div className="flex items-center gap-1.5 font-semibold text-sm">
                      <span>{r.company_name}</span>
                      <ArrowUpRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </Link>
                  <div className="text-[10px] text-[var(--color-text-muted)] font-mono flex items-center gap-1.5 mt-0.5">
                    <span>{r.symbol || 'N/A'}</span>
                    <span>•</span>
                    <span className="capitalize">{r.category.replace('_', ' ')}</span>
                    {r.industry && (
                      <>
                        <span>•</span>
                        <span className="truncate max-w-[140px]">{r.industry}</span>
                      </>
                    )}
                  </div>
                </td>

                <td className="py-3 px-4">
                  <span className="capitalize px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                    {r.status.replace('_', ' ')}
                  </span>
                </td>

                <td className="py-3 px-4 text-right font-mono">
                  {r.price_band_high !== null ? (
                    <span>₹{r.price_band_low ? `${r.price_band_low} – ` : ''}{r.price_band_high}</span>
                  ) : (
                    <span className="text-[var(--color-text-muted)]">—</span>
                  )}
                </td>

                <td className="py-3 px-4 text-right font-mono font-medium">
                  {r.min_investment !== null ? (
                    <span>₹{r.min_investment.toLocaleString('en-IN')}</span>
                  ) : (
                    <span className="text-[var(--color-text-muted)]">—</span>
                  )}
                </td>

                <td className="py-3 px-4 text-right font-mono">
                  {r.issue_size_cr !== null ? (
                    <span>₹{r.issue_size_cr.toLocaleString('en-IN')} Cr</span>
                  ) : (
                    <span className="text-[var(--color-text-muted)]">—</span>
                  )}
                </td>

                <td className="py-3 px-4 text-right font-mono">
                  {r.pe_ratio_high !== null ? (
                    <span className="font-semibold">{r.pe_ratio_high.toFixed(1)}x</span>
                  ) : (
                    <span className="text-[var(--color-text-muted)] italic text-[11px]">Unpriced</span>
                  )}
                </td>

                <td className="py-3 px-4 text-right font-mono">
                  {r.latest_roe_pct !== null ? (
                    <span className={r.latest_roe_pct >= 15 ? 'text-emerald-600 dark:text-emerald-400 font-medium' : ''}>
                      {r.latest_roe_pct.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-[var(--color-text-muted)]">—</span>
                  )}
                </td>

                <td className="py-3 px-4 text-right font-mono">
                  {r.latest_subscription_x !== null ? (
                    <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                      {r.latest_subscription_x.toFixed(1)}x
                    </span>
                  ) : (
                    <span className="text-[var(--color-text-muted)]">—</span>
                  )}
                </td>

                <td className="py-3 px-4 text-right">
                  {r.overall_score !== null ? (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border font-mono ${scoreColor}`}>
                      {r.overall_score}
                    </span>
                  ) : (
                    <span className="text-[var(--color-text-muted)] text-[11px]">Pending</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
