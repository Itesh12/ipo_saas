import React from "react";
import { IpoPipelineOverview } from "../../types/intelligence.types";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Layers } from "lucide-react";

interface PipelineHealthCardProps {
  overview: IpoPipelineOverview;
}

export function PipelineHealthCard({ overview }: PipelineHealthCardProps) {
  const stages = [
    { label: "Announced", count: overview.announced, color: "text-blue-400 bg-blue-500/10" },
    { label: "Upcoming", count: overview.upcoming, color: "text-indigo-400 bg-indigo-500/10" },
    { label: "Bidding Open", count: overview.open, color: "text-emerald-400 bg-emerald-500/10" },
    { label: "Closed", count: overview.closed, color: "text-yellow-400 bg-yellow-500/10" },
    { label: "Allotment Pending", count: overview.allotment_pending, color: "text-orange-400 bg-orange-500/10" },
    { label: "Listing Soon", count: overview.listing_soon, color: "text-purple-400 bg-purple-500/10" },
    { label: "Listed", count: overview.listed, color: "text-gray-400 bg-gray-500/10" },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[var(--brand-primary)]" />
              <span>IPO Pipeline Distribution</span>
            </CardTitle>
            <CardDescription>Active issues across regulatory lifecycle stages.</CardDescription>
          </div>
          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)]">
            Total: {overview.total_ipos}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
          {stages.map((st) => (
            <div
              key={st.label}
              className="p-3 rounded-xl bg-[var(--bg-surface-elevated)]/50 border border-[var(--border-subtle)] flex flex-col items-center justify-center text-center space-y-1"
            >
              <span className="text-[11px] text-[var(--text-muted)] truncate w-full">{st.label}</span>
              <span className={`text-lg font-bold font-mono px-2 py-0.5 rounded ${st.color}`}>
                {st.count}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
