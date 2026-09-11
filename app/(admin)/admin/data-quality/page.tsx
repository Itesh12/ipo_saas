import React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataQualityScoreBar } from "@/features/admin/components/dataQuality/DataQualityScoreBar";
import { MissingDataBadgeList } from "@/features/admin/components/dataQuality/MissingDataBadgeList";
import { AdminIntelligenceService } from "@/features/admin/services/adminIntelligenceService";
import { ShieldCheck, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";

export const dynamic = "force-dynamic";

export default async function AdminDataQualityPage() {
  const report = await AdminIntelligenceService.getIpoDataQualityReport().catch(() => []);

  const totalIpos = report.length;
  const completeCount = report.filter((r) => r.completeness_score === 100).length;
  const avgCompleteness = totalIpos > 0
    ? Math.round(report.reduce((acc, r) => acc + r.completeness_score, 0) / totalIpos)
    : 100;

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="IPO Data Quality & Completeness"
        description="Comprehensive structural completeness scorecards across all regulatory and market blocks."
        badge={
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            Avg Completeness: {avgCompleteness}%
          </span>
        }
      />

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-1">
          <span className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">
            Tracked IPO Issues
          </span>
          <div className="text-2xl font-bold font-mono text-[var(--text-primary)]">{totalIpos}</div>
          <span className="text-[11px] text-[var(--text-muted)]">Active, upcoming & historic issues</span>
        </div>

        <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-1">
          <span className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">
            100% Complete Dossiers
          </span>
          <div className="text-2xl font-bold font-mono text-emerald-400">{completeCount}</div>
          <span className="text-[11px] text-[var(--text-muted)]">All mandatory research blocks verified</span>
        </div>

        <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-1">
          <span className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">
            Data Gap Exceptions
          </span>
          <div className="text-2xl font-bold font-mono text-yellow-400">{totalIpos - completeCount}</div>
          <span className="text-[11px] text-[var(--text-muted)]">Issues with missing financials, GMP or filings</span>
        </div>
      </div>

      {/* Grid Table */}
      <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/50 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                <th className="py-3 px-4">Company & Symbol</th>
                <th className="py-3 px-4">Lifecycle Status</th>
                <th className="py-3 px-4 min-w-[180px]">Completeness Score</th>
                <th className="py-3 px-4">Missing Blocks</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
              {report.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-[var(--text-muted)]">
                    No IPO records found in the database.
                  </td>
                </tr>
              ) : (
                report.map((item) => (
                  <tr key={item.ipo_id} className="hover:bg-[var(--bg-surface-elevated)]/40 transition-colors">
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="font-semibold text-[var(--text-primary)]">{item.company_name}</div>
                      <div className="text-[11px] text-[var(--text-muted)] font-mono">{item.symbol || "TBD"}</div>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className="font-mono text-[11px] uppercase tracking-wider px-2 py-0.5 rounded bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)]">
                        {item.status}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <DataQualityScoreBar score={item.completeness_score} />
                    </td>

                    <td className="py-3.5 px-4">
                      <MissingDataBadgeList item={item} />
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap text-right">
                      <Link href={`/admin/ipos/${item.ipo_id}/edit`}>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs">
                          Edit IPO <ArrowRight className="w-3 h-3 ml-1" />
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
