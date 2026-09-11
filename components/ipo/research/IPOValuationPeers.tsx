"use client";

import React from "react";
import { IPOValuationRow, IPOPeerRow, IPORow } from "@/features/ipo/types/ipo.types";
import { formatCrores, formatPercentage } from "@/lib/utils";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Users } from "lucide-react";

interface IPOValuationPeersProps {
  ipo: IPORow;
  valuation: IPOValuationRow | null;
  peers: IPOPeerRow[];
}

export function IPOValuationPeers({ ipo, valuation, peers }: IPOValuationPeersProps) {
  const priceBandStr =
    ipo.price_band_low && ipo.price_band_high
      ? ipo.price_band_low === ipo.price_band_high
        ? `₹${ipo.price_band_high}`
        : `₹${ipo.price_band_low} – ₹${ipo.price_band_high}`
      : "TBA";

  return (
    <div className="space-y-6">
      {/* Valuation Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          <span className="text-[11px] text-[var(--text-muted)] font-medium">Issue Price</span>
          <p className="text-sm font-bold text-[var(--text-primary)] mt-0.5">{priceBandStr}</p>
          <span className="text-[10px] text-[var(--text-secondary)]">Per equity share</span>
        </div>

        <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          <span className="text-[11px] text-[var(--text-muted)] font-medium">P/E Ratio (Upper)</span>
          <p className="text-sm font-bold text-[var(--brand-primary)] mt-0.5">
            {valuation?.pe_ratio_high ? `${valuation.pe_ratio_high}x` : "TBA"}
          </p>
          <span className="text-[10px] text-[var(--text-secondary)]">Based on FY24 EPS</span>
        </div>

        <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          <span className="text-[11px] text-[var(--text-muted)] font-medium">Industry P/E Median</span>
          <p className="text-sm font-bold text-[var(--text-primary)] mt-0.5">
            {valuation?.industry_pe_median ? `${valuation.industry_pe_median}x` : "—"}
          </p>
          <span className="text-[10px] text-[var(--text-secondary)]">Listed peer median</span>
        </div>

        <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          <span className="text-[11px] text-[var(--text-muted)] font-medium">Price to Book (P/B)</span>
          <p className="text-sm font-bold text-[var(--text-primary)] mt-0.5">
            {valuation?.pb_ratio ? `${valuation.pb_ratio}x` : "TBA"}
          </p>
          <span className="text-[10px] text-[var(--text-secondary)]">Post-issue BVPS</span>
        </div>

        <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          <span className="text-[11px] text-[var(--text-muted)] font-medium">EV / EBITDA</span>
          <p className="text-sm font-bold text-[var(--text-primary)] mt-0.5">
            {valuation?.ev_ebitda ? `${valuation.ev_ebitda}x` : "TBA"}
          </p>
          <span className="text-[10px] text-[var(--text-secondary)]">Enterprise value multiple</span>
        </div>

        <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          <span className="text-[11px] text-[var(--text-muted)] font-medium">Market Cap (Est.)</span>
          <p className="text-sm font-bold text-[var(--status-success)] mt-0.5">
            {valuation?.market_cap_cr ? formatCrores(valuation.market_cap_cr) : "TBA"}
          </p>
          <span className="text-[10px] text-[var(--text-secondary)]">At upper price band</span>
        </div>
      </div>

      {valuation?.valuation_summary && (
        <div className="p-4 rounded-xl bg-[var(--bg-surface-elevated)]/50 border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--text-primary)]">Valuation Note: </span>
          {valuation.valuation_summary}
        </div>
      )}

      {/* Peer Comparison Table */}
      <Card className="overflow-hidden border-[var(--border-subtle)]">
        <CardHeader className="py-3.5 px-5 bg-[var(--bg-surface-elevated)]/30 border-b border-[var(--border-subtle)] flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[var(--brand-primary)]" />
            <CardTitle className="text-sm">Listed Industry Peer Comparison</CardTitle>
          </div>
          <span className="text-xs text-[var(--text-muted)]">Source: Exchange filings & RHP</span>
        </CardHeader>

        {peers.length === 0 ? (
          <div className="py-8 text-center text-xs text-[var(--text-muted)]">
            No listed comparable peers identified or filed in the RHP for this sector.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--bg-surface-elevated)]/40 border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">Company Name</th>
                  <th className="py-2.5 px-4 text-right font-semibold">M-Cap (₹ Cr)</th>
                  <th className="py-2.5 px-4 text-right font-semibold">Revenue (₹ Cr)</th>
                  <th className="py-2.5 px-4 text-right font-semibold">P/E (x)</th>
                  <th className="py-2.5 px-4 text-right font-semibold">P/B (x)</th>
                  <th className="py-2.5 px-4 text-right font-semibold">ROE (%)</th>
                  <th className="py-2.5 px-4 text-right font-semibold">ROCE (%)</th>
                  <th className="py-2.5 px-4 text-right font-semibold">D/E</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]/60 text-[var(--text-primary)]">
                {/* Subject IPO Row Highlighted */}
                <tr className="bg-[var(--brand-primary)]/10 font-semibold">
                  <td className="py-2.5 px-4 flex items-center gap-1.5">
                    <span>{ipo.company_name}</span>
                    <Badge variant="default" size="sm">
                      Subject IPO
                    </Badge>
                  </td>
                  <td className="py-2.5 px-4 text-right">{valuation?.market_cap_cr ? formatCrores(valuation.market_cap_cr) : "TBA"}</td>
                  <td className="py-2.5 px-4 text-right">{formatCrores(ipo.issue_size_cr)}</td>
                  <td className="py-2.5 px-4 text-right text-[var(--brand-primary)]">
                    {valuation?.pe_ratio_high ? `${valuation.pe_ratio_high}x` : "TBA"}
                  </td>
                  <td className="py-2.5 px-4 text-right">{valuation?.pb_ratio ? `${valuation.pb_ratio}x` : "—"}</td>
                  <td className="py-2.5 px-4 text-right">—</td>
                  <td className="py-2.5 px-4 text-right">—</td>
                  <td className="py-2.5 px-4 text-right">—</td>
                </tr>

                {/* Peer Companies */}
                {peers.map((peer) => (
                  <tr key={peer.id} className="hover:bg-[var(--bg-surface-elevated)]/30 transition-colors">
                    <td className="py-2.5 px-4 font-medium">
                      {peer.peer_company_name}
                      {peer.peer_symbol && <span className="text-[10px] text-[var(--text-muted)] ml-1.5">({peer.peer_symbol})</span>}
                    </td>
                    <td className="py-2.5 px-4 text-right">{formatCrores(peer.market_cap_cr)}</td>
                    <td className="py-2.5 px-4 text-right">{formatCrores(peer.revenue_cr)}</td>
                    <td className="py-2.5 px-4 text-right font-medium">{peer.pe_ratio ? `${peer.pe_ratio}x` : "—"}</td>
                    <td className="py-2.5 px-4 text-right">{peer.pb_ratio ? `${peer.pb_ratio}x` : "—"}</td>
                    <td className="py-2.5 px-4 text-right">{formatPercentage(peer.roe_pct)}</td>
                    <td className="py-2.5 px-4 text-right">{formatPercentage(peer.roce_pct)}</td>
                    <td className="py-2.5 px-4 text-right">{peer.debt_to_equity !== null ? peer.debt_to_equity : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
