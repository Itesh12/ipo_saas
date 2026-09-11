/**
 * components/screener/ScreenerFilterDrawer.tsx
 *
 * Phase 6: Multi-Attribute Screener Filter Drawer
 * Allows fine-grained filtering across financial health, valuation multiples,
 * category tiers, and null value behavior.
 */

'use client';

import React from 'react';
import { ScreenerFilterPayload } from '@/features/analytics/types/analytics.types';
import { RotateCcw, Filter, X } from 'lucide-react';

interface ScreenerFilterDrawerProps {
  filters: ScreenerFilterPayload;
  onChange: (filters: ScreenerFilterPayload) => void;
  onReset: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export function ScreenerFilterDrawer({
  filters,
  onChange,
  onReset,
  isOpen,
  onClose,
}: ScreenerFilterDrawerProps) {
  if (!isOpen) return null;

  const handleCategoryToggle = (cat: 'mainboard' | 'sme_bse' | 'sme_nse') => {
    const current = filters.category || [];
    const next = current.includes(cat) ? current.filter((c) => c !== cat) : [...current, cat];
    onChange({ ...filters, category: next.length > 0 ? next : undefined, page: 1 });
  };

  const handleStatusToggle = (st: string) => {
    const current = filters.status || [];
    const next = current.includes(st) ? current.filter((s) => s !== st) : [...current, st];
    onChange({ ...filters, status: next.length > 0 ? next : undefined, page: 1 });
  };

  return (
    <div className="p-5 border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-surface)] shadow-md space-y-5 animate-in fade-in">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-indigo-500" />
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Custom Filter Matrix</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onReset}
            className="text-xs text-[var(--color-text-muted)] hover:text-indigo-500 flex items-center gap-1 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-xs">
        {/* Category Filter */}
        <div className="space-y-2">
          <label className="font-semibold text-[var(--color-text-secondary)] block">Market Tier</label>
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: 'mainboard' as const, label: 'Mainboard' },
              { id: 'sme_nse' as const, label: 'NSE SME' },
              { id: 'sme_bse' as const, label: 'BSE SME' },
            ].map((cat) => {
              const active = filters.category?.includes(cat.id);
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleCategoryToggle(cat.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                    active
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Status Filter */}
        <div className="space-y-2">
          <label className="font-semibold text-[var(--color-text-secondary)] block">Lifecycle Status</label>
          <div className="flex flex-wrap gap-1.5">
            {['open', 'upcoming', 'closed', 'listed'].map((st) => {
              const active = filters.status?.includes(st);
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => handleStatusToggle(st)}
                  className={`px-2.5 py-1 rounded-md text-xs capitalize font-medium border transition-colors ${
                    active
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]'
                  }`}
                >
                  {st}
                </button>
              );
            })}
          </div>
        </div>

        {/* Valuation & Quality Sliders */}
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="font-semibold text-[var(--color-text-secondary)]">Max P/E Multiple</span>
              <span className="font-mono text-indigo-500">{filters.peRatioMax ? `${filters.peRatioMax}x` : 'Any'}</span>
            </div>
            <input
              type="range"
              min="10"
              max="80"
              step="5"
              value={filters.peRatioMax || 80}
              onChange={(e) =>
                onChange({
                  ...filters,
                  peRatioMax: Number(e.target.value) === 80 ? undefined : Number(e.target.value),
                  page: 1,
                })
              }
              className="w-full h-1.5 bg-[var(--color-bg-elevated)] rounded-lg accent-indigo-600 cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="font-semibold text-[var(--color-text-secondary)]">Min IPO Score</span>
              <span className="font-mono text-indigo-500">{filters.overallScoreMin ? `${filters.overallScoreMin}/100` : 'Any'}</span>
            </div>
            <input
              type="range"
              min="40"
              max="90"
              step="5"
              value={filters.overallScoreMin || 40}
              onChange={(e) =>
                onChange({
                  ...filters,
                  overallScoreMin: Number(e.target.value) === 40 ? undefined : Number(e.target.value),
                  page: 1,
                })
              }
              className="w-full h-1.5 bg-[var(--color-bg-elevated)] rounded-lg accent-indigo-600 cursor-pointer"
            />
          </div>
        </div>

        {/* Demand & Null Policy */}
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="font-semibold text-[var(--color-text-secondary)]">Min Subscription Multiple</span>
              <span className="font-mono text-indigo-500">{filters.subscriptionMinX ? `${filters.subscriptionMinX}x` : 'Any'}</span>
            </div>
            <input
              type="range"
              min="0"
              max="50"
              step="5"
              value={filters.subscriptionMinX || 0}
              onChange={(e) =>
                onChange({
                  ...filters,
                  subscriptionMinX: Number(e.target.value) === 0 ? undefined : Number(e.target.value),
                  page: 1,
                })
              }
              className="w-full h-1.5 bg-[var(--color-bg-elevated)] rounded-lg accent-indigo-600 cursor-pointer"
            />
          </div>

          <div className="pt-2 border-t border-[var(--color-border)]">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={Boolean(filters.includeUnpriced)}
                onChange={(e) => onChange({ ...filters, includeUnpriced: e.target.checked, page: 1 })}
                className="rounded border-[var(--color-border)] text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
              />
              <span className="text-[11px] text-[var(--color-text-secondary)]">
                Include unpriced / preliminary IPOs
              </span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
