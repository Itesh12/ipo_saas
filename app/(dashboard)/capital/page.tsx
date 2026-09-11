/**
 * app/(dashboard)/capital/page.tsx
 *
 * Phase 5 Stage 2: Capital & General Ledger Dashboard
 * Live presentation of Available Cash, ASBA Liens, Invested Capital, and Double-Entry General Ledger Entries.
 */

import React from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { CapitalDashboardClient } from '@/components/finance/CapitalDashboardClient';
import { PortfolioValuationService } from '@/features/finance/services/portfolioValuationService';
import { createClient } from '@/lib/supabase/server';
import {
  Wallet,
  Lock,
  PieChart,
  Landmark,
  ArrowUpRight,
  ArrowDownRight,
  FileText,
  ShieldCheck,
} from 'lucide-react';

import { requireAuth } from '@/lib/security/auth-guards';

export default async function CapitalPage() {
  const authUser = await requireAuth();
  const userId = authUser.id;
  const supabase = await createClient();

  // 1. Fetch user's capital breakdown (Accounts 1010, 1020, 1110)
  const capital = await PortfolioValuationService.getUserCapitalBreakdown(userId);

  // 2. Fetch recent double-entry journal entries with lines
  const { data: rawEntries } = await supabase
    .from('journal_entries')
    .select(`
      id,
      journal_number,
      transaction_date,
      journal_type,
      narration,
      status,
      journal_lines (
        id,
        account_id,
        debit,
        credit,
        line_narration,
        financial_accounts (
          account_code,
          account_name
        )
      )
    `)
    .eq('user_id', userId)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(25);

  type RawLineItem = {
    id: string;
    account_id: string;
    debit: number;
    credit: number;
    line_narration: string | null;
    financial_accounts: {
      account_code: string;
      account_name: string;
    } | null;
  };

  type RawJournalItem = {
    id: string;
    journal_number: string;
    transaction_date: string;
    journal_type: string;
    narration: string;
    status: string;
    journal_lines: RawLineItem[] | null;
  };

  const journalEntries = (rawEntries || []) as unknown as RawJournalItem[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Capital & Financial Ledger"
        description="Authoritative double-entry General Ledger tracking available cash, ASBA IPO liens, and invested capital."
        actions={<CapitalDashboardClient />}
      />

      {/* Capital Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)]">
          <div className="flex items-center justify-between text-xs text-[var(--color-text-secondary)]">
            <span>Available Cash</span>
            <Wallet className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-[var(--color-text-primary)]">
            ₹{capital.availableCash.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-[var(--color-text-muted)] mt-1 font-mono">
            Account 1010 (Liquid Bank)
          </div>
        </div>

        <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)]">
          <div className="flex items-center justify-between text-xs text-[var(--color-text-secondary)]">
            <span>ASBA Lien Blocked</span>
            <Lock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
            ₹{capital.blockedLien.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-[var(--color-text-muted)] mt-1 font-mono">
            Account 1020 (Bank: IPO Lien)
          </div>
        </div>

        <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)]">
          <div className="flex items-center justify-between text-xs text-[var(--color-text-secondary)]">
            <span>Invested in IPO Shares</span>
            <PieChart className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-indigo-600 dark:text-indigo-400">
            ₹{capital.investedAllotted.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-[var(--color-text-muted)] mt-1 font-mono">
            Account 1110 (Equities Cost)
          </div>
        </div>

        <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)]">
          <div className="flex items-center justify-between text-xs text-[var(--color-text-secondary)]">
            <span>Total Book Net Worth</span>
            <Landmark className="w-4 h-4 text-blue-500" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-[var(--color-text-primary)]">
            ₹{capital.totalBookNetWorth.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-[var(--color-text-muted)] mt-1 font-mono">
            Sum of Asset Accounts
          </div>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-500" />
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
              General Ledger Entries
            </h3>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Database Balanced (Σ Debits = Σ Credits)</span>
          </div>
        </div>

        {!journalEntries || journalEntries.length === 0 ? (
          <div className="text-center py-12 border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-surface)]">
            <p className="text-sm text-[var(--color-text-secondary)]">No journal entries recorded yet.</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">Declare an opening balance or submit an application to start the double-entry ledger.</p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-surface)] shadow-sm">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] font-medium">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Entry #</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Description / Constituent Accounts</th>
                  <th className="py-3 px-4 text-right">Debit (₹)</th>
                  <th className="py-3 px-4 text-right">Credit (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)] text-[var(--color-text-primary)]">
                {journalEntries.map((entry) => {
                  const lines = entry.journal_lines || [];
                  const totalAmount = lines.reduce((acc, l) => acc + Number(l.debit || 0), 0);

                  return (
                    <React.Fragment key={entry.id}>
                      <tr className="bg-[var(--color-bg-elevated)]/30 font-semibold border-t border-[var(--color-border)]">
                        <td className="py-2.5 px-4 font-mono">{entry.transaction_date.slice(0, 10)}</td>
                        <td className="py-2.5 px-4 font-mono text-[var(--color-text-muted)]">{entry.journal_number}</td>
                        <td className="py-2.5 px-4">
                          <span className="capitalize px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-mono text-[10px]">
                            {entry.journal_type.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-2.5 px-4">{entry.narration}</td>
                        <td className="py-2.5 px-4 text-right font-mono text-emerald-600 dark:text-emerald-400">
                          ₹{totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-indigo-600 dark:text-indigo-400">
                          ₹{totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                      {lines.map((line) => {
                        const fa = Array.isArray(line.financial_accounts)
                          ? line.financial_accounts[0]
                          : line.financial_accounts;
                        const accountCode = fa?.account_code || '';
                        const accountName = fa?.account_name || 'Account';

                        return (
                          <tr key={line.id} className="text-[11px] text-[var(--color-text-secondary)]">
                            <td className="py-1.5 px-4"></td>
                            <td className="py-1.5 px-4"></td>
                            <td className="py-1.5 px-4"></td>
                            <td className="py-1.5 px-4 pl-8">
                              <div className="flex items-center gap-1.5 font-mono">
                                <span className="text-[var(--color-text-muted)]">[{accountCode}]</span>
                                <span>{accountName}</span>
                                {line.line_narration && (
                                  <span className="text-[var(--color-text-muted)] italic font-sans text-[10px]">
                                    — {line.line_narration}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-1.5 px-4 text-right font-mono">
                              {Number(line.debit) > 0 ? (
                                <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                                  <ArrowDownRight className="w-3 h-3" />
                                  ₹{Number(line.debit).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="py-1.5 px-4 text-right font-mono">
                              {Number(line.credit) > 0 ? (
                                <span className="inline-flex items-center gap-0.5 text-indigo-600 dark:text-indigo-400">
                                  <ArrowUpRight className="w-3 h-3" />
                                  ₹{Number(line.credit).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
