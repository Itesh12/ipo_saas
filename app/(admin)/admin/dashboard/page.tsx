import React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/Button";
import { PipelineHealthCard } from "@/features/admin/components/intelligence/PipelineHealthCard";
import { SystemTelemetryWidget } from "@/features/admin/components/intelligence/SystemTelemetryWidget";
import { FinanceIntegrityWidget } from "@/features/admin/components/intelligence/FinanceIntegrityWidget";
import { WorkItemSeverityBadge, WorkItemStatusBadge } from "@/features/admin/components/workQueue/WorkItemSeverityBadge";
import { AdminIntelligenceService } from "@/features/admin/services/adminIntelligenceService";
import { AdminWorkQueueService } from "@/features/admin/services/adminWorkQueueService";
import {
  Users,
  Layers,
  CheckSquare,
  Activity,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  let health = {
    pending_notifications: 0,
    processing_notifications: 0,
    dead_letter_notifications: 0,
    completed_24h_notifications: 0,
    submitted_applications: 0,
    mandate_pending_applications: 0,
    allotment_pending_applications: 0,
    critical_work_items: 0,
    total_active_work_items: 0,
  };

  let pipeline = {
    total_ipos: 0,
    announced: 0,
    upcoming: 0,
    open: 0,
    closed: 0,
    allotment_pending: 0,
    listing_soon: 0,
    listed: 0,
  };

  let workItems: Awaited<ReturnType<typeof AdminWorkQueueService.getWorkItems>>["items"] = [];

  try {
    const [h, p, w] = await Promise.all([
      AdminIntelligenceService.getSystemHealth().catch(() => health),
      AdminIntelligenceService.getIpoPipelineOverview().catch(() => pipeline),
      AdminWorkQueueService.getWorkItems({ status: "open", pageSize: 5 }).catch(() => ({ items: [], total: 0 })),
    ]);
    health = h;
    pipeline = p;
    workItems = w.items;
  } catch (err) {
    console.error("Dashboard data load error:", err);
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <PageHeader
        title="Operations Command Center"
        description="Global administrative intelligence, operational telemetry, and anomaly triage."
        badge={
          <span className="text-xs uppercase font-bold tracking-wider px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            Live Governance
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <Link href="/admin/work-queue">
              <Button size="sm" variant="primary" leftIcon={<CheckSquare className="w-3.5 h-3.5" />}>
                Work Queue ({health.total_active_work_items})
              </Button>
            </Link>
          </div>
        }
      />

      {/* Admin KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Active IPO Pipeline"
          value={pipeline.open + pipeline.upcoming}
          icon={Layers}
          subtext={`${pipeline.open} open bidding • ${pipeline.upcoming} upcoming`}
        />
        <StatCard
          title="Active Work Items"
          value={health.total_active_work_items}
          icon={CheckSquare}
          subtext={`${health.critical_work_items} critical severity items`}
        />
        <StatCard
          title="Notification Backlog"
          value={health.pending_notifications + health.processing_notifications}
          icon={Activity}
          subtext={`${health.dead_letter_notifications} dead-letter events`}
        />
        <StatCard
          title="Bidding Funnel In-Flight"
          value={health.mandate_pending_applications + health.allotment_pending_applications}
          icon={Users}
          subtext={`${health.submitted_applications} submitted total`}
        />
      </div>

      {/* Pipeline Distribution */}
      <PipelineHealthCard overview={pipeline} />

      {/* System Health & Ledger Invariants */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SystemTelemetryWidget metrics={health} />
        <FinanceIntegrityWidget />
      </div>

      {/* Action Required: Open Work Items Preview */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-[var(--brand-primary)]" />
              <span>Priority Work Queue Triage</span>
            </CardTitle>
            <CardDescription>Most recent actionable exceptions requiring operator verification.</CardDescription>
          </div>
          <Link href="/admin/work-queue">
            <Button size="sm" variant="outline" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
              View All ({health.total_active_work_items})
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {workItems.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--text-muted)] space-y-1">
              <div className="text-emerald-400 font-semibold flex items-center justify-center gap-1.5">
                <ShieldCheck className="w-4 h-4" /> Zero Active Anomalies
              </div>
              <p>All data pipelines, research structures, and ledger accounts are healthy.</p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]">
              {workItems.map((item) => (
                <div
                  key={item.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-[var(--bg-surface-elevated)]/40 px-2 rounded-lg transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <WorkItemSeverityBadge severity={item.severity} />
                      <WorkItemStatusBadge status={item.status} />
                      <Link
                        href={`/admin/work-queue/${item.id}`}
                        className="text-xs font-semibold text-[var(--text-primary)] hover:text-[var(--brand-primary)] transition-colors"
                      >
                        {item.title}
                      </Link>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] line-clamp-1">
                      {item.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-xs">
                    <span className="text-[11px] text-[var(--text-muted)] font-mono">
                      {item.category.replace(/_/g, " ")}
                    </span>
                    <Link href={`/admin/work-queue/${item.id}`}>
                      <Button size="sm" variant="ghost" className="h-7 text-xs px-2.5">
                        Triage <ArrowRight className="w-3 h-3 ml-1" />
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
