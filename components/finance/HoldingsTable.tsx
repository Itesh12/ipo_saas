/**
 * components/finance/HoldingsTable.tsx
 *
 * Client table component rendering live portfolio positions,
 * respecting the 4-tier ownership structure, missing price alerts, and unrealized returns.
 */

'use client';

import React from 'react';
import type { HoldingItem } from '@/features/finance/types/finance.types';
import { Badge } from '@/components/ui/Badge';
import { ArrowUpRight, ArrowDownRight, AlertTriangle, UserCheck } from 'lucide-react';

interface HoldingsTableProps {
  holdings: HoldingItem[];
}

export function HoldingsTable({ holdings }: HoldingsTableProps) {
  if (!holdings || holdings.length === 0) {
    return (
      <div className="text-center py-12 border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-surface)]">
        <p className="text-sm text-[var(--color-text-secondary)]">No shares currently held in this ownership portfolio.</p>
        <p className="text-xs text-[var(--color-text-muted)] mt-1">Allotted IPO shares will automatically populate here upon allotment confirmation.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-surface)] shadow-sm">
      <table className="w-full text-left border-collapse text-xs">
        <thead>
          <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] font-medium">
            <th className="py-3 px-4">Security / Company</th>
            <th className="py-3 px-4">Beneficial Owner</th>
            <th className="py-3 px-4">Ownership Status</th>
            <th className="py-3 px-4 text-right">Quantity</th>
            <th className="py-3 px-4 text-right">Avg Cost</th>
            <th className="py-3 px-4 text-right">Invested Capital</th>
            <th className="py-3 px-4 text-right">Price Snapshot</th>
            <th className="py-3 px-4 text-right">Market Value</th>
            <th className="py-3 px-4 text-right">Unrealized P&L</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)] text-[var(--color-text-primary)]">
          {holdings.map((h) => {
            const hasProfit = (h.unrealizedPnl ?? 0) >= 0;
            const pnlPercentage = h.unrealizedPnlPct ?? 0;

            return (
              <tr key={h.id} className="hover:bg-[var(--color-bg-elevated)]/50 transition-colors">
                <td className="py-3.5 px-4">
                  <div className="font-semibold text-sm">{h.companyName}</div>
                  <div className="text-[10px] text-[var(--color-text-muted)] font-mono flex items-center gap-1.5 mt-0.5">
                    <span>{h.symbol}</span>
                    <span>•</span>
                    <span>ISIN: {h.isin || 'Pending'}</span>
                  </div>
                </td>

                <td className="py-3.5 px-4">
                  <div className="flex items-center gap-1.5 font-medium">
                    <UserCheck className="w-3.5 h-3.5 text-indigo-500" />
                    <span>{h.applicantDisplayName || 'Self (Personal)'}</span>
                  </div>
                  {h.applicantRelationship && (
                    <div className="text-[10px] text-[var(--color-text-muted)] font-sans mt-0.5">
                      {h.applicantRelationship}
                    </div>
                  )}
                </td>

                <td className="py-3.5 px-4">
                  {h.isExternalTracked ? (
                    <Badge variant="warning">External Tracked</Badge>
                  ) : (
                    <Badge variant="info">Verified Portfolio</Badge>
                  )}
                </td>

                <td className="py-3.5 px-4 text-right font-mono font-medium">
                  {h.quantity.toLocaleString('en-IN')}
                </td>

                <td className="py-3.5 px-4 text-right font-mono">
                  ₹{h.averageCostPrice.toFixed(2)}
                </td>

                <td className="py-3.5 px-4 text-right font-mono font-medium">
                  ₹{h.totalInvestedCost.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </td>

                <td className="py-3.5 px-4 text-right">
                  {h.currentPrice !== null ? (
                    <div className="font-mono">
                      <span>₹{h.currentPrice.toFixed(2)}</span>
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="w-3 h-3" />
                      <span>Pending Snapshot</span>
                    </div>
                  )}
                </td>

                <td className="py-3.5 px-4 text-right font-mono font-semibold">
                  {h.marketValue !== null ? (
                    `₹${h.marketValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
                  ) : (
                    <span className="text-[var(--color-text-muted)]">—</span>
                  )}
                </td>

                <td className="py-3.5 px-4 text-right font-mono">
                  {h.unrealizedPnl !== null ? (
                    <div className={`flex flex-col items-end ${hasProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      <div className="flex items-center gap-0.5 font-semibold">
                        {hasProfit ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        <span>{hasProfit ? '+' : ''}₹{h.unrealizedPnl.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="text-[10px]">
                        {hasProfit ? '+' : ''}{pnlPercentage.toFixed(2)}%
                      </div>
                    </div>
                  ) : (
                    <span className="text-[var(--color-text-muted)]">—</span>
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
