/**
 * components/screener/ScreenerClientContainer.tsx
 *
 * Phase 6: Client Container for Multi-Factor Screener
 * Connects filter state, presets, saved screens modal, and side-by-side compare toolbar.
 */

'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ScreenerRecord,
  ScreenerFilterPayload,
  SavedScreenPreset,
  SavedScreenRow,
} from '@/features/analytics/types/analytics.types';
import { ScreenerTable } from './ScreenerTable';
import { ScreenerFilterDrawer } from './ScreenerFilterDrawer';
import { SavedScreensModal } from './SavedScreensModal';
import { Button } from '@/components/ui/Button';
import {
  SlidersHorizontal,
  Bookmark,
  GitCompare,
  Search,
  Sparkles,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { filterInMemory } from '@/features/analytics/services/screenerFilterEngine';

interface ScreenerClientContainerProps {
  initialRecords: ScreenerRecord[];
  initialFilters: ScreenerFilterPayload;
  presets: SavedScreenPreset[];
  userScreens: SavedScreenRow[];
}

export function ScreenerClientContainer({
  initialRecords,
  initialFilters,
  presets,
  userScreens,
}: ScreenerClientContainerProps) {
  const [filters, setFilters] = useState<ScreenerFilterPayload>(initialFilters);
  const [activePresetId, setActivePresetId] = useState<string>('all');
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [selectedCompareSlugs, setSelectedCompareSlugs] = useState<string[]>([]);

  // Local filtered view for immediate reactive feedback
  const screenerResult = filterInMemory(initialRecords, filters);

  const handlePresetSelect = (preset: SavedScreenPreset) => {
    setActivePresetId(preset.id);
    setFilters({
      ...preset.filterConfig,
      sortBy: preset.sortBy,
      sortDirection: preset.sortDirection,
      page: 1,
    });
  };

  const handleCustomScreenSelect = (screen: SavedScreenRow) => {
    setActivePresetId(screen.id);
    setFilters({
      ...screen.filter_config,
      sortBy: screen.sort_by,
      sortDirection: screen.sort_direction,
      page: 1,
    });
  };

  const handleResetFilters = () => {
    setActivePresetId('all');
    setFilters({
      sortBy: 'overall_score',
      sortDirection: 'desc',
      page: 1,
      limit: 20,
    });
  };

  const handleSortChange = (column: string) => {
    const isSameCol = filters.sortBy === column;
    const nextDir = isSameCol && filters.sortDirection === 'asc' ? 'desc' : 'asc';
    setFilters({
      ...filters,
      sortBy: column,
      sortDirection: nextDir,
    });
  };

  const handleToggleCompare = (slug: string) => {
    if (selectedCompareSlugs.includes(slug)) {
      setSelectedCompareSlugs(selectedCompareSlugs.filter((s) => s !== slug));
    } else if (selectedCompareSlugs.length < 4) {
      setSelectedCompareSlugs([...selectedCompareSlugs, slug]);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Toolbar: Search, Presets, Filter Drawer Toggle, Save Screen */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search Bar */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[var(--color-text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search company, symbol, or sector..."
            value={filters.searchQuery || ''}
            onChange={(e) => setFilters({ ...filters, searchQuery: e.target.value, page: 1 })}
            className="w-full pl-9 pr-3 py-2 text-xs bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={isFilterDrawerOpen ? 'primary' : 'outline'}
            leftIcon={<SlidersHorizontal className="w-3.5 h-3.5" />}
            onClick={() => setIsFilterDrawerOpen(!isFilterDrawerOpen)}
          >
            Filters {screenerResult.activeFilterCount > 0 && `(${screenerResult.activeFilterCount})`}
          </Button>

          <Button
            size="sm"
            variant="outline"
            leftIcon={<Bookmark className="w-3.5 h-3.5" />}
            onClick={() => setIsSaveModalOpen(true)}
          >
            Save Screen
          </Button>
        </div>
      </div>

      {/* Preset Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <button
          onClick={handleResetFilters}
          className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors border ${
            activePresetId === 'all'
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
              : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]'
          }`}
        >
          All Issues ({initialRecords.length})
        </button>

        {presets.map((preset) => (
          <button
            key={preset.id}
            onClick={() => handlePresetSelect(preset)}
            className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors border flex items-center gap-1.5 ${
              activePresetId === preset.id
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]'
            }`}
          >
            <Sparkles className="w-3 h-3 text-amber-500" />
            <span>{preset.name}</span>
          </button>
        ))}

        {userScreens.map((screen) => (
          <button
            key={screen.id}
            onClick={() => handleCustomScreenSelect(screen)}
            className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors border flex items-center gap-1.5 ${
              activePresetId === screen.id
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]'
            }`}
          >
            <Bookmark className="w-3 h-3 text-indigo-500" />
            <span>{screen.name}</span>
          </button>
        ))}
      </div>

      {/* Filter Drawer */}
      <ScreenerFilterDrawer
        filters={filters}
        onChange={setFilters}
        onReset={handleResetFilters}
        isOpen={isFilterDrawerOpen}
        onClose={() => setIsFilterDrawerOpen(false)}
      />

      {/* Floating Compare Action Bar (If 2 to 4 IPOs selected) */}
      {selectedCompareSlugs.length >= 2 && (
        <div className="p-3 bg-indigo-600 text-white rounded-xl shadow-lg flex items-center justify-between animate-in slide-in-from-bottom-2">
          <div className="flex items-center gap-2 text-xs">
            <GitCompare className="w-4 h-4" />
            <span className="font-semibold">{selectedCompareSlugs.length} IPOs Selected for Comparison</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedCompareSlugs([])}
              className="text-xs text-indigo-200 hover:text-white underline mr-2"
            >
              Clear
            </button>
            <Link href={`/compare?slugs=${selectedCompareSlugs.join(',')}`}>
              <Button size="sm" variant="secondary">
                Compare Side-by-Side
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* Screener Data Table */}
      <ScreenerTable
        records={screenerResult.records}
        sortBy={filters.sortBy || 'overall_score'}
        sortDirection={filters.sortDirection || 'desc'}
        onSortChange={handleSortChange}
        selectedCompareSlugs={selectedCompareSlugs}
        onToggleCompare={handleToggleCompare}
      />

      {/* Table Footer: Result Count, Performance Benchmark & Pagination */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[var(--color-text-secondary)] pt-2">
        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span>Showing {screenerResult.records.length} of {screenerResult.totalCount} results</span>
          {screenerResult.executionTimeMs !== undefined && (
            <span className="text-[var(--color-text-muted)]">
              (Query execution: {screenerResult.executionTimeMs.toFixed(2)}ms)
            </span>
          )}
        </div>

        {screenerResult.totalPages > 1 && (
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              disabled={screenerResult.page <= 1}
              onClick={() => setFilters({ ...filters, page: (filters.page || 1) - 1 })}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <span className="px-2 font-mono">
              Page {screenerResult.page} of {screenerResult.totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={screenerResult.page >= screenerResult.totalPages}
              onClick={() => setFilters({ ...filters, page: (filters.page || 1) + 1 })}
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Saved Screens Modal */}
      <SavedScreensModal
        isOpen={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
        currentFilters={filters}
        sortBy={filters.sortBy || 'overall_score'}
        sortDirection={filters.sortDirection || 'desc'}
      />
    </div>
  );
}
