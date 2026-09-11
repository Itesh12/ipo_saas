"use client";

import React from "react";
import { IPOFinancialRow } from "@/features/ipo/types/ipo.types";
import { formatCrores, formatPercentage, formatINR } from "@/lib/utils";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { TrendingUp, BarChart2, ShieldCheck, AlertCircle } from "lucide-react";

interface IPOFinancialsTableProps {
  financials: IPOFinancialRow[];
}

export function IPOFinancialsTable({ financials }: IPOFinancialsTableProps) {
  if (!financials || financials.length === 0) {
    return (
      <Card className="p-6 border-[var(--border-subtle)]">
        <div className="flex flex-col items-center justify-center py-8 text-center text-[var(--text-muted)] space-y-2">
          <AlertCircle className="w-8 h-8 text-[var(--text-muted)]" />
          <h4 className="text-sm font-semibold text-[var(--text-secondary)]">Financials Pending Disclosure</h4>
          <p className="text-xs max-w-sm">
            Audited financial statements have not yet been filed with SEBI for this issue. Multi-year balance sheets will appear here upon DRHP/RHP release.
          </p>
        </div>
      </Card>
    );
  }

  const sorted = [...financials].sort((a, b) => a.financial_year.localeCompare(b.financial_year));

  // Find max revenue for scaling chart bars
  const maxRevenue = Math.max(...sorted.map((f) => f.revenue_cr || 1), 10);

  return (
    <div className="space-y-6">
      {/* Financial Trend Visualizer */}
      <Card className="p-5 border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <div className="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)]/60">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-[var(--brand-primary)]" />
            <h4 className="text-sm font-semibold text-[var(--text-primary)]">Revenue & PAT Progression</h4>
          </div>
          <Badge variant="secondary" size="sm">
            In ₹ Crores (Consolidated)
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-4">
          {sorted.map((item) => {
            const revHeightPct = Math.min(100, Math.max(15, ((item.revenue_cr || 0) / maxRevenue) * 100));
            return (
              <div
                key={item.id || item.financial_year}
                className="p-3 rounded-lg bg-[var(--bg-surface-elevated)]/50 border border-[var(--border-subtle)] space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--text-primary)]">{item.financial_year}</span>
                  <span className="text-[10px] text-[var(--text-muted)]">{item.audit_status || "Restated"}</span>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-[var(--text-secondary)]">Revenue</span>
                    <span className="font-semibold text-[var(--text-primary)]">{formatCrores(item.revenue_cr)}</span>
                  </div>
                  {/* Revenue Bar */}
                  <div className="w-full h-2 bg-[var(--bg-surface-elevated)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--brand-primary)] rounded-full transition-all duration-300"
                      style={{ width: `${revHeightPct}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-[var(--text-secondary)]">PAT (Profit)</span>
                    <span className="font-semibold text-[var(--status-success)]">{formatCrores(item.pat_cr)}</span>
                  </div>
                  <div className="flex justify-between text-[11px] text-[var(--text-muted)]">
                    <span>PAT Margin</span>
                    <span>{formatPercentage(item.pat_margin_pct)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Structured Multi-Year Table */}
      <Card className="overflow-hidden border-[var(--border-subtle)]">
        <CardHeader className="py-3.5 px-5 bg-[var(--bg-surface-elevated)]/30 border-b border-[var(--border-subtle)] flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[var(--brand-primary)]" />
            <CardTitle className="text-sm">Consolidated Statement of Profit & Loss and Key Ratios</CardTitle>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <ShieldCheck className="w-3.5 h-3.5 text-[var(--status-success)]" />
            <span>Audited & Restated as per SEBI ICDR</span>
          </div>
        </CardHeader>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--bg-surface-elevated)]/40 border-b border-[var(--border-subtle)] text-[var(--text-secondary)] font-medium">
              <tr>
                <th className="py-2.5 px-4 font-semibold">Key Metric (₹ Cr)</th>
                {sorted.map((item) => (
                  <th key={item.financial_year} className="py-2.5 px-4 text-right font-semibold">
                    {item.financial_year}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]/60 text-[var(--text-primary)]">
              <tr>
                <td className="py-2 px-4 font-medium text-[var(--text-secondary)]">Total Revenue</td>
                {sorted.map((item) => (
                  <td key={item.financial_year} className="py-2 px-4 text-right font-semibold">
                    {formatCrores(item.revenue_cr)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2 px-4 text-[var(--text-secondary)]">Revenue Growth (YoY)</td>
                {sorted.map((item) => (
                  <td
                    key={item.financial_year}
                    className={`py-2 px-4 text-right font-medium ${
                      (item.revenue_growth_pct || 0) >= 0 ? "text-[var(--status-success)]" : "text-[var(--status-danger)]"
                    }`}
                  >
                    {formatPercentage(item.revenue_growth_pct, { showSign: true })}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2 px-4 text-[var(--text-secondary)]">EBITDA (Operating Profit)</td>
                {sorted.map((item) => (
                  <td key={item.financial_year} className="py-2 px-4 text-right">
                    {formatCrores(item.ebitda_cr)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2 px-4 text-[var(--text-secondary)]">EBITDA Margin</td>
                {sorted.map((item) => (
                  <td key={item.financial_year} className="py-2 px-4 text-right font-medium">
                    {formatPercentage(item.ebitda_margin_pct)}
                  </td>
                ))}
              </tr>
              <tr className="bg-[var(--bg-surface-elevated)]/20 font-semibold">
                <td className="py-2 px-4 text-[var(--text-primary)]">Profit After Tax (PAT)</td>
                {sorted.map((item) => (
                  <td key={item.financial_year} className="py-2 px-4 text-right text-[var(--status-success)]">
                    {formatCrores(item.pat_cr)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2 px-4 text-[var(--text-secondary)]">PAT Margin (%)</td>
                {sorted.map((item) => (
                  <td key={item.financial_year} className="py-2 px-4 text-right font-medium">
                    {formatPercentage(item.pat_margin_pct)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2 px-4 text-[var(--text-secondary)]">Basic EPS (₹)</td>
                {sorted.map((item) => (
                  <td key={item.financial_year} className="py-2 px-4 text-right">
                    {formatINR(item.eps, { showDecimals: true })}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2 px-4 text-[var(--text-secondary)]">Return on Equity (ROE %)</td>
                {sorted.map((item) => (
                  <td key={item.financial_year} className="py-2 px-4 text-right">
                    {formatPercentage(item.roe_pct)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2 px-4 text-[var(--text-secondary)]">Return on Capital Employed (ROCE %)</td>
                {sorted.map((item) => (
                  <td key={item.financial_year} className="py-2 px-4 text-right">
                    {formatPercentage(item.roce_pct)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2 px-4 text-[var(--text-secondary)]">Total Debt</td>
                {sorted.map((item) => (
                  <td key={item.financial_year} className="py-2 px-4 text-right">
                    {formatCrores(item.total_debt_cr)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2 px-4 text-[var(--text-secondary)]">Net Worth</td>
                {sorted.map((item) => (
                  <td key={item.financial_year} className="py-2 px-4 text-right font-medium">
                    {formatCrores(item.net_worth_cr)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2 px-4 text-[var(--text-secondary)]">Operating Cash Flow (OCF)</td>
                {sorted.map((item) => (
                  <td key={item.financial_year} className="py-2 px-4 text-right">
                    {formatCrores(item.operating_cash_flow_cr)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
