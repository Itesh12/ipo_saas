/**
 * components/analytics/SectorExposureChart.tsx
 *
 * Phase 6: Sector & Industry Exposure Visualizer
 * Displays allocation breakdown by industry, comparing invested cost % and market valuation %.
 */

'use client';

import React from 'react';
import { SectorExposureItem } from '@/features/analytics/types/analytics.types';
import { PieChart } from 'lucide-react';

interface SectorExposureChartProps {
  sectors: SectorExposureItem[];
}

export function SectorExposureChart({ sectors }: SectorExposureChartProps) {
  if (!sectors || sectors.length === 0) {
    return (
      <div className="p-8 text-center border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-surface)]">
        <PieChart className="w-6 h-6 text-[var(--color-text-muted)] mx-auto mb-2" />
        <p className="text-xs text-[var(--color-text-secondary)]">No sector allocations recorded in this portfolio scope.</p>
      </div>
    );
  }

  const sectorColors = [
    'bg-indigo-600 text-indigo-100',
    'bg-blue-500 text-blue-100',
    'bg-emerald-500 text-emerald-100',
    'bg-amber-500 text-amber-100',
    'bg-rose-500 text-rose-100',
    'bg-purple-500 text-purple-100',
  ];

  return (
    <div className="p-5 border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-surface)] space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PieChart className="w-4 h-4 text-indigo-500" />
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Sector & Industry Allocation</h3>
        </div>
        <span className="text-[11px] text-[var(--color-text-muted)] font-mono">{sectors.length} sectors</span>
      </div>

      {/* Stacked Progress Bar */}
      <div className="w-full h-3 rounded-full overflow-hidden flex bg-[var(--color-bg-elevated)]">
        {sectors.map((s, idx) => (
          <div
            key={s.sector}
            style={{ width: `${Math.max(2, s.investedPct)}%` }}
            className={`h-full ${sectorColors[idx % sectorColors.length].split(' ')[0]} transition-all`}
            title={`${s.sector}: ${s.investedPct}%`}
          />
        ))}
      </div>

      {/* Sector Rows */}
      <div className="divide-y divide-[var(--color-border)] text-xs">
        {sectors.map((s, idx) => (
          <div key={s.sector} className="py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${sectorColors[idx % sectorColors.length].split(' ')[0]}`} />
              <span className="font-medium text-[var(--color-text-primary)]">{s.sector}</span>
              <span className="text-[10px] text-[var(--color-text-muted)] font-mono">({s.securitiesCount} issues)</span>
            </div>

            <div className="flex items-center gap-4 font-mono">
              <div className="text-right">
                <span className="font-semibold text-[var(--color-text-primary)]">{s.investedPct}%</span>
                <span className="text-[10px] text-[var(--color-text-muted)] block">₹{s.investedCost.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
