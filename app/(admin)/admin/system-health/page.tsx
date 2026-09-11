import React from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { SystemTelemetryWidget } from "@/features/admin/components/intelligence/SystemTelemetryWidget";
import { FinanceIntegrityWidget } from "@/features/admin/components/intelligence/FinanceIntegrityWidget";
import { AdminIntelligenceService } from "@/features/admin/services/adminIntelligenceService";
import { createAdminClient } from "@/lib/supabase/admin";
import { DeadLetterManager } from "./DeadLetterManager";
import { Activity, Server } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

export default async function AdminSystemHealthPage() {
  const adminClient = createAdminClient();

  const health = await AdminIntelligenceService.getSystemHealth().catch(() => ({
    pending_notifications: 0,
    processing_notifications: 0,
    dead_letter_notifications: 0,
    completed_24h_notifications: 0,
    submitted_applications: 0,
    mandate_pending_applications: 0,
    allotment_pending_applications: 0,
    critical_work_items: 0,
    total_active_work_items: 0,
  }));

  // Fetch dead letter events for operator triage
  const { data: deadLetters } = await adminClient
    .from("notification_events")
    .select("id, event_type, aggregate_type, aggregate_id, attempt_count, last_error, created_at, available_at")
    .eq("status", "dead_letter")
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="System Health & Operational Observability"
        description="Platform-wide background processing status, worker queues, and dead-letter exceptions."
        badge={
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" />
            Live Telemetry
          </span>
        }
      />

      {/* Main Telemetry Widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SystemTelemetryWidget metrics={health} />
        <FinanceIntegrityWidget />
      </div>

      {/* Background Processing Engine Overview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Server className="w-4 h-4 text-[var(--brand-primary)]" />
            <span>Notification & Async Processing Queues</span>
          </CardTitle>
          <CardDescription>
            Phase 7B concurrency engine (FOR UPDATE SKIP LOCKED) with lease tracking and exponential backoff.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)]">
              <span className="text-[10px] text-[var(--text-muted)] uppercase block">Pending Queue</span>
              <span className="text-xl font-bold font-mono text-[var(--text-primary)]">{health.pending_notifications}</span>
            </div>
            <div className="p-3 rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)]">
              <span className="text-[10px] text-[var(--text-muted)] uppercase block">Active Leases</span>
              <span className="text-xl font-bold font-mono text-blue-400">{health.processing_notifications}</span>
            </div>
            <div className="p-3 rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)]">
              <span className="text-[10px] text-[var(--text-muted)] uppercase block">Processed (24h)</span>
              <span className="text-xl font-bold font-mono text-emerald-400">{health.completed_24h_notifications}</span>
            </div>
            <div className="p-3 rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)]">
              <span className="text-[10px] text-[var(--text-muted)] uppercase block">Dead Letters</span>
              <span className={`text-xl font-bold font-mono ${health.dead_letter_notifications > 0 ? "text-red-400" : "text-[var(--text-muted)]"}`}>
                {health.dead_letter_notifications}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dead Letter Management Section */}
      <DeadLetterManager deadLetters={deadLetters || []} />
    </div>
  );
}
