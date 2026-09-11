import React from "react";
import { SystemHealthMetrics } from "../../types/intelligence.types";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Activity, Bell, FileText, AlertOctagon } from "lucide-react";
import Link from "next/link";

interface SystemTelemetryWidgetProps {
  metrics: SystemHealthMetrics;
}

export function SystemTelemetryWidget({ metrics }: SystemTelemetryWidgetProps) {
  const isHealthy = metrics.dead_letter_notifications === 0 && metrics.critical_work_items === 0;

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[var(--brand-primary)]" />
            <span>Platform Telemetry & Processing Queues</span>
          </CardTitle>
          <CardDescription>Live background worker queues, application submissions, and health status.</CardDescription>
        </div>
        <span
          className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${
            isHealthy
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
              : "bg-red-500/10 text-red-400 border-red-500/20 animate-pulse"
          }`}
        >
          {isHealthy ? "All Systems Operational" : "Action Required"}
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Notification Queue Status */}
          <div className="p-3 rounded-xl bg-[var(--bg-surface-elevated)]/60 border border-[var(--border-subtle)] space-y-2">
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span className="flex items-center gap-1.5 font-medium">
                <Bell className="w-3.5 h-3.5 text-blue-400" />
                Notification Backlog
              </span>
              <span className="font-mono">{metrics.completed_24h_notifications} processed / 24h</span>
            </div>
            <div className="flex items-baseline justify-between">
              <div className="text-2xl font-bold font-mono text-[var(--text-primary)]">
                {metrics.pending_notifications + metrics.processing_notifications}
              </div>
              <span className="text-[11px] text-[var(--text-muted)]">
                {metrics.processing_notifications} in-flight
              </span>
            </div>
          </div>

          {/* Applications Status */}
          <div className="p-3 rounded-xl bg-[var(--bg-surface-elevated)]/60 border border-[var(--border-subtle)] space-y-2">
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span className="flex items-center gap-1.5 font-medium">
                <FileText className="w-3.5 h-3.5 text-purple-400" />
                Active Bidding Funnel
              </span>
              <span className="font-mono">{metrics.submitted_applications} submitted</span>
            </div>
            <div className="flex items-baseline justify-between">
              <div className="text-2xl font-bold font-mono text-[var(--text-primary)]">
                {metrics.mandate_pending_applications + metrics.allotment_pending_applications}
              </div>
              <span className="text-[11px] text-[var(--text-muted)]">
                {metrics.mandate_pending_applications} mandate pending
              </span>
            </div>
          </div>

          {/* Dead Letters & Critical Alerts */}
          <div className="p-3 rounded-xl bg-[var(--bg-surface-elevated)]/60 border border-[var(--border-subtle)] space-y-2">
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span className="flex items-center gap-1.5 font-medium">
                <AlertOctagon className="w-3.5 h-3.5 text-red-400" />
                Exceptions & Dead Letters
              </span>
              <Link href="/admin/work-queue" className="text-[11px] text-[var(--brand-primary)] hover:underline">
                View Queue
              </Link>
            </div>
            <div className="flex items-baseline justify-between">
              <div
                className={`text-2xl font-bold font-mono ${
                  metrics.dead_letter_notifications > 0 ? "text-red-400" : "text-[var(--text-primary)]"
                }`}
              >
                {metrics.dead_letter_notifications}
              </div>
              <span className="text-[11px] text-[var(--text-muted)]">
                {metrics.critical_work_items} critical work items
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
