/**
 * components/screener/SavedScreensModal.tsx
 *
 * Phase 6: Saved Screens Dialog
 * Allows users to persist custom filter setups with public/private visibility toggles.
 */

'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Bookmark, X, Loader2, ShieldCheck, Globe } from 'lucide-react';
import { saveScreenAction } from '@/features/analytics/actions/screenerActions';
import { ScreenerFilterPayload } from '@/features/analytics/types/analytics.types';

interface SavedScreensModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentFilters: ScreenerFilterPayload;
  sortBy: string;
  sortDirection: 'asc' | 'desc';
}

export function SavedScreensModal({
  isOpen,
  onClose,
  currentFilters,
  sortBy,
  sortDirection,
}: SavedScreensModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    formData.set('filterConfig', JSON.stringify(currentFilters));
    formData.set('sortBy', sortBy);
    formData.set('sortDirection', sortDirection);

    const res = await saveScreenAction(formData);

    setLoading(false);
    if (res.success) {
      onClose();
    } else {
      setError(res.error || 'Failed to save screen');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-md bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600">
              <Bookmark className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-[var(--color-text-primary)]">Save Custom Screen</h3>
              <p className="text-xs text-[var(--color-text-secondary)]">Bookmark your active filter parameters</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 text-xs text-rose-600 bg-rose-50 dark:bg-rose-950/40 rounded-lg border border-rose-200 dark:border-rose-900/50">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">
              Screen Name *
            </label>
            <input
              name="name"
              type="text"
              required
              placeholder="e.g. Low Debt Mainboard Tech"
              className="w-full px-3 py-2 text-sm bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">
              Description (Optional)
            </label>
            <textarea
              name="description"
              rows={2}
              placeholder="Brief description of the investment thesis behind this screen"
              className="w-full px-3 py-2 text-sm bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          <div className="p-3 bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg space-y-2">
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                name="isPublic"
                value="true"
                className="mt-0.5 rounded border-[var(--color-border)] text-indigo-600 focus:ring-indigo-500 w-4 h-4"
              />
              <div className="text-xs">
                <div className="flex items-center gap-1.5 font-medium text-[var(--color-text-primary)]">
                  <Globe className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Make Public (Shareable)</span>
                </div>
                <p className="text-[11px] text-[var(--color-text-secondary)] mt-0.5">
                  Public screens share filter rules only. Personal portfolio, applicant, and capital parameters are strictly excluded.
                </p>
              </div>
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--color-border)]">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={loading}
              leftIcon={loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            >
              {loading ? 'Saving Screen...' : 'Save Configuration'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
