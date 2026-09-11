/**
 * app/(admin)/admin/finance/page.tsx
 *
 * Phase 5 Stage 2: Admin Trial Balance & Financial Reconciliation Terminal
 * Real-time parity verification across all user General Ledgers and audit controls.
 */

import React from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { ReconciliationService } from '@/features/finance/services/reconciliationService';
import { createClient } from '@/lib/supabase/server';
import {
  ShieldCheck,
  AlertTriangle,
  Scale,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

export default async function AdminFinancePage() {
  const supabase = await createClient();

  // Run trial balance audit globally across all entries
  const globalAudit = await ReconciliationService.runTrialBalanceAudit();

  // Query all active financial accounts across system with non-zero balance
  const { data: rawAccounts } = await supabase
    .from('financial_accounts')
    .select('id, account_code, account_name, classification, user_id')
    .order('account_code', { ascending: true })
    .limit(50);

  // Fetch balances for accounts via journal lines
  const { data: rawLines } = await supabase
    .from('journal_lines')
    .select(`
      account_id,
      debit,
      credit,
      journal_entries!inner (
        status
      )
    `)
    .eq('journal_entries.status', 'posted');

  type AccountItem = {
    id: string;
    account_code: string;
    account_name: string;
    classification: string;
    balance: number;
    user_id: string;
  };

  type LineItem = {
    account_id: string;
    debit: number;
    credit: number;
  };

  const balanceMap = new Map<string, number>();
  for (const l of ((rawLines || []) as unknown as LineItem[])) {
    const prev = balanceMap.get(l.account_id) || 0;
    balanceMap.set(l.account_id, prev + (Number(l.debit || 0) - Number(l.credit || 0)));
  }

  const accounts: AccountItem[] = ((rawAccounts || []) as unknown as Array<{
    id: string;
    account_code: string;
    account_name: string;
    classification: string;
    user_id: string;
  }>).map((a) => ({
    ...a,
    balance: Math.round((balanceMap.get(a.id) || 0) * 100) / 100,
  }));

  // Group accounts by classification
  const assetTotal = accounts
    .filter((a) => a.classification === 'asset')
    .reduce((sum, a) => sum + a.balance, 0);

  const liabilityTotal = accounts
    .filter((a) => a.classification === 'liability')
    .reduce((sum, a) => sum + Math.abs(a.balance), 0);

  const equityTotal = accounts
    .filter((a) => a.classification === 'equity')
    .reduce((sum, a) => sum + Math.abs(a.balance), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance & General Ledger Administration"
        description="System-wide trial balance audit, double-entry mathematical parity, and ledger account balances."
      />

      {/* Trial Balance Health Banner */}
      <div
        className={`p-4 rounded-xl border flex items-center justify-between ${
          globalAudit.isBalanced
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-200'
            : 'bg-rose-500/10 border-rose-500/30 text-rose-950 dark:text-rose-200'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`p-2.5 rounded-lg ${
              globalAudit.isBalanced
                ? 'bg-emerald-500/20 text-emerald-600'
                : 'bg-rose-500/20 text-rose-600'
            }`}
          >
            {globalAudit.isBalanced ? (
              <CheckCircle2 className="w-6 h-6" />
            ) : (
              <XCircle className="w-6 h-6" />
            )}
          </div>
          <div>
            <h3 className="font-semibold text-sm">
              {globalAudit.isBalanced
                ? 'Global General Ledger is Perfectly Balanced'
                : 'CRITICAL: General Ledger Parity Imbalance Detected'}
            </h3>
            <p className="text-xs opacity-80 mt-0.5">
              {globalAudit.isBalanced
                ? `Total Debits (₹${globalAudit.totalDebits.toLocaleString('en-IN')}) exactly equal Total Credits (₹${globalAudit.totalCredits.toLocaleString('en-IN')}) across ${globalAudit.entriesCount} posted journal entries.`
                : `Mathematical disparity of ₹${globalAudit.imbalance.toLocaleString('en-IN')}. Immediate database reconciliation required.`}
            </p>
          </div>
        </div>

        <div className="text-right font-mono text-xs hidden sm:block">
          <div className="text-[var(--color-text-muted)]">Active Ledger Accounts</div>
          <div className="text-base font-bold text-[var(--color-text-primary)]">
            {globalAudit.accountCount} Accounts
          </div>
        </div>
      </div>

      {/* Parity Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)]">
          <div className="flex items-center justify-between text-xs text-[var(--color-text-secondary)]">
            <span>Total Debits</span>
            <Scale className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
            ₹{globalAudit.totalDebits.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-[var(--color-text-muted)] mt-1 font-mono">
            Posted journal line debits
          </div>
        </div>

        <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)]">
          <div className="flex items-center justify-between text-xs text-[var(--color-text-secondary)]">
            <span>Total Credits</span>
            <Scale className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-indigo-600 dark:text-indigo-400">
            ₹{globalAudit.totalCredits.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-[var(--color-text-muted)] mt-1 font-mono">
            Posted journal line credits
          </div>
        </div>

        <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)]">
          <div className="flex items-center justify-between text-xs text-[var(--color-text-secondary)]">
            <span>Balance Discrepancy</span>
            {globalAudit.isBalanced ? (
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-500" />
            )}
          </div>
          <div
            className={`mt-2 text-2xl font-bold font-mono ${
              globalAudit.isBalanced ? 'text-emerald-600' : 'text-rose-600'
            }`}
          >
            ₹{globalAudit.imbalance.toFixed(2)}
          </div>
          <div className="text-[11px] text-[var(--color-text-muted)] mt-1 font-mono">
            Tolerance threshold: ₹0.00
          </div>
        </div>
      </div>

      {/* Trial Balance Account Rollup */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-indigo-500" />
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Standard Chart of Accounts (COA) Balances
          </h3>
        </div>

        <div className="overflow-x-auto border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-surface)] shadow-sm">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] font-medium">
                <th className="py-3 px-4">Code</th>
                <th className="py-3 px-4">Account Name</th>
                <th className="py-3 px-4">Classification</th>
                <th className="py-3 px-4 text-right">Current Balance (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)] text-[var(--color-text-primary)]">
              {accounts.length > 0 ? (
                accounts.map((acc) => (
                  <tr key={acc.id} className="hover:bg-[var(--color-bg-elevated)]/50">
                    <td className="py-2.5 px-4 font-mono font-semibold">{acc.account_code}</td>
                    <td className="py-2.5 px-4">{acc.account_name}</td>
                    <td className="py-2.5 px-4">
                      <span className="capitalize px-2 py-0.5 rounded bg-[var(--color-bg-elevated)] font-mono text-[10px]">
                        {acc.classification}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-medium">
                      ₹{acc.balance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-[var(--color-text-muted)]">
                    No accounts registered yet.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[var(--color-border)] bg-[var(--color-bg-elevated)] font-semibold font-mono">
                <td colSpan={3} className="py-3 px-4">
                  Net Asset Position (Assets: ₹{assetTotal.toLocaleString('en-IN')} | Liabilities: ₹{liabilityTotal.toLocaleString('en-IN')} | Equity: ₹{equityTotal.toLocaleString('en-IN')})
                </td>
                <td className="py-3 px-4 text-right text-indigo-600 dark:text-indigo-400">
                  ₹{assetTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
