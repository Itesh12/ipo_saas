/**
 * components/finance/DeclareOpeningBalanceModal.tsx
 *
 * Client modal to declare opening bank cash balance.
 * Strictly adheres to User Requirement: Zero fabricated financial history.
 * Explicitly records verificationStatus: 'user_declared_unverified'.
 */

'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Landmark, X, AlertCircle, Loader2 } from 'lucide-react';
import { declareOpeningBalanceAction } from '@/features/finance/actions/capitalActions';

interface DeclareOpeningBalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DeclareOpeningBalanceModal({ isOpen, onClose }: DeclareOpeningBalanceModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const res = await declareOpeningBalanceAction(formData);

    setLoading(false);
    if (res.success) {
      onClose();
    } else {
      setError(res.error || 'Failed to declare opening balance');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-lg bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600">
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-[var(--color-text-primary)]">Declare Opening Book Balance</h3>
              <p className="text-xs text-[var(--color-text-secondary)]">User-declared opening book balance — unverified</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-xs text-amber-800 dark:text-amber-300 space-y-1">
              <p className="font-semibold">User-Declared Baseline (Unverified)</p>
              <p>The platform will never manufacture cash records from past applications. The audit event itself is recorded, but the financial value is marked as user-declared and unverified.</p>
            </div>
          </div>

          {error && (
            <div className="p-3 text-xs text-rose-600 bg-rose-50 dark:bg-rose-950/40 rounded-lg border border-rose-200 dark:border-rose-900/50">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">
              Opening Available Balance (₹) *
            </label>
            <input
              name="amount"
              type="number"
              step="0.01"
              min="0"
              required
              placeholder="e.g. 150000"
              className="w-full px-3 py-2 text-sm bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">
                As of Date *
              </label>
              <input
                name="asOfDate"
                type="date"
                defaultValue={new Date().toISOString().split('T')[0]}
                required
                className="w-full px-3 py-2 text-sm bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">
                Bank / Account Name
              </label>
              <input
                name="bankName"
                type="text"
                placeholder="e.g. HDFC Trading Account"
                className="w-full px-3 py-2 text-sm bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">
              User Notes / Declaration Reason
            </label>
            <input
              name="notes"
              type="text"
              placeholder="e.g. Self-declared book balance as of beginning of financial year"
              className="w-full px-3 py-2 text-sm bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--color-border)]">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={loading} leftIcon={loading ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}>
              {loading ? 'Posting Entry...' : 'Record Declared Baseline'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
