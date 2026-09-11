/**
 * components/finance/CapitalDepositModal.tsx
 *
 * Client modal to deposit capital into trading bank account (Cash Infusion)
 */

'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ArrowDownRight, X, Loader2 } from 'lucide-react';
import { recordCapitalDepositAction } from '@/features/finance/actions/capitalActions';

interface CapitalDepositModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CapitalDepositModal({ isOpen, onClose }: CapitalDepositModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const res = await recordCapitalDepositAction(formData);

    setLoading(false);
    if (res.success) {
      onClose();
    } else {
      setError(res.error || 'Failed to record deposit');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-md bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600">
              <ArrowDownRight className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-[var(--color-text-primary)]">Deposit Trading Funds</h3>
              <p className="text-xs text-[var(--color-text-secondary)]">Double-entry cash addition to available balance</p>
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
              Deposit Amount (₹) *
            </label>
            <input
              name="amount"
              type="number"
              step="0.01"
              min="1"
              required
              placeholder="e.g. 50000"
              className="w-full px-3 py-2 text-sm bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">
                Deposit Date *
              </label>
              <input
                name="depositDate"
                type="date"
                defaultValue={new Date().toISOString().split('T')[0]}
                required
                className="w-full px-3 py-2 text-sm bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">
                Source Channel
              </label>
              <select
                name="source"
                className="w-full px-3 py-2 text-sm bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="bank_transfer">NEFT / RTGS</option>
                <option value="upi">UPI Transfer</option>
                <option value="net_banking">Net Banking</option>
                <option value="other">Other Source</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">
              UTR / Reference Number (Optional)
            </label>
            <input
              name="referenceNumber"
              type="text"
              placeholder="Bank transaction ID / UTR"
              className="w-full px-3 py-2 text-sm bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">
              Audit Notes
            </label>
            <input
              name="notes"
              type="text"
              placeholder="e.g. Added capital for SME IPOs"
              className="w-full px-3 py-2 text-sm bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--color-border)]">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={loading} leftIcon={loading ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}>
              {loading ? 'Posting Journal...' : 'Confirm Deposit'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
