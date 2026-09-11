import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { AdminWorkQueueService } from "@/features/admin/services/adminWorkQueueService";
import { createClient } from "@/lib/supabase/server";
import { WorkItemSeverityBadge, WorkItemStatusBadge } from "@/features/admin/components/workQueue/WorkItemSeverityBadge";
import { WorkItemDetailActions } from "./WorkItemDetailActions";
import {
  ArrowLeft,
  ExternalLink,
  History,
  FileCode,
} from "lucide-react";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function WorkItemDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [item, history] = await Promise.all([
    AdminWorkQueueService.getWorkItemById(id),
    AdminWorkQueueService.getWorkItemHistory(id),
  ]);

  if (!item) {
    notFound();
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let userRole = "analyst";
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    const profile = data as unknown as { role: string } | null;
    if (profile?.role) userRole = profile.role;
  }

  // Determine deep link to authoritative entity
  let entityHref: string | null = null;
  if (item.entity_type === "ipos") {
    entityHref = `/admin/ipos/${item.entity_id}/edit`;
  } else if (item.entity_type === "ipo_applications") {
    entityHref = `/admin/applications`;
  } else if (item.entity_type === "journal_entries") {
    entityHref = `/admin/finance`;
  } else if (item.entity_type === "notification_events") {
    entityHref = `/admin/system-health`;
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fadeIn">
      {/* Navigation & Header */}
      <div>
        <Link
          href="/admin/work-queue"
          className="inline-flex items-center text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-2"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1" />
          Back to Work Queue
        </Link>
        <PageHeader
          title={item.title}
          description={`Work Item ID: ${item.id}`}
          badge={
            <div className="flex items-center gap-1.5">
              <WorkItemSeverityBadge severity={item.severity} />
              <WorkItemStatusBadge status={item.status} />
            </div>
          }
        />
      </div>

      {/* Main Details & Metadata */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Details & Diagnostic */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Diagnostic Summary</CardTitle>
              <CardDescription>Observed exception context and anomaly rationale.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              <div className="p-3 rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] space-y-1">
                <span className="text-[10px] text-[var(--text-muted)] font-mono uppercase">Description</span>
                <p className="text-[var(--text-primary)] leading-relaxed">{item.description}</p>
              </div>

              {item.resolution_notes && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 space-y-1">
                  <span className="text-[10px] text-emerald-400 font-mono uppercase font-bold">
                    Resolution / Dismissal Notes
                  </span>
                  <p className="text-[var(--text-primary)] leading-relaxed">{item.resolution_notes}</p>
                </div>
              )}

              {/* Diagnostic Metadata Inspector */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-1.5">
                    <FileCode className="w-3.5 h-3.5" />
                    Structured Diagnostic Metadata
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono">
                    fingerprint: {item.fingerprint}
                  </span>
                </div>
                <pre className="p-3 rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-primary)] overflow-x-auto">
                  {JSON.stringify(item.metadata, null, 2)}
                </pre>
              </div>
            </CardContent>
          </Card>

          {/* Immutable Timeline History */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <History className="w-4 h-4 text-[var(--brand-primary)]" />
                  <span>Immutable State History</span>
                </CardTitle>
                <CardDescription>Database-triggered audit trail of state transitions.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <div className="text-xs text-[var(--text-muted)] italic py-4 text-center">
                  No state transition records yet.
                </div>
              ) : (
                <div className="relative pl-6 space-y-4 border-l border-[var(--border-subtle)] ml-2">
                  {history.map((hist) => (
                    <div key={hist.id} className="relative space-y-1 text-xs">
                      <div className="absolute -left-[31px] top-0.5 w-3 h-3 rounded-full bg-[var(--brand-primary)] ring-4 ring-[var(--bg-surface)]" />
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[var(--text-primary)] uppercase tracking-wider text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)]">
                          {hist.action.replace(/_/g, " ")}
                        </span>
                        <span className="text-[var(--text-muted)] text-[11px]">
                          {new Date(hist.created_at).toLocaleString("en-IN")}
                        </span>
                      </div>
                      <div className="text-[var(--text-secondary)]">
                        {hist.previous_status && (
                          <span className="line-through text-[var(--text-muted)] mr-1">
                            {hist.previous_status}
                          </span>
                        )}
                        <span className="font-semibold text-[var(--text-primary)]">
                          → {hist.new_status}
                        </span>
                        {hist.actor_profile && (
                          <span className="text-[var(--text-muted)] ml-2">
                            by {hist.actor_profile.full_name || hist.actor_profile.email}
                          </span>
                        )}
                      </div>
                      {hist.notes && (
                        <p className="text-[11px] text-[var(--text-muted)] italic pl-2 border-l border-[var(--border-subtle)]">
                          &ldquo;{hist.notes}&rdquo;
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right 1 Col: Metadata & Action Card */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Entity & Attribution</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs divide-y divide-[var(--border-subtle)]">
              <div className="pb-2.5">
                <span className="text-[10px] text-[var(--text-muted)] uppercase block">Category</span>
                <span className="font-semibold text-[var(--text-primary)]">{item.category.replace(/_/g, " ")}</span>
              </div>

              <div className="py-2.5">
                <span className="text-[10px] text-[var(--text-muted)] uppercase block">Target Entity</span>
                <span className="font-semibold text-[var(--text-primary)]">{item.entity_type}</span>
                <span className="font-mono text-[10px] text-[var(--text-muted)] block truncate">{item.entity_id}</span>
                {entityHref && (
                  <Link
                    href={entityHref}
                    className="mt-1 inline-flex items-center text-[11px] text-[var(--brand-primary)] hover:underline"
                  >
                    View Source Entity <ExternalLink className="w-3 h-3 ml-1" />
                  </Link>
                )}
              </div>

              <div className="py-2.5">
                <span className="text-[10px] text-[var(--text-muted)] uppercase block">Assignee</span>
                <span className="font-semibold text-[var(--text-primary)]">
                  {item.assigned_profile?.full_name || item.assigned_profile?.email || "Unassigned"}
                </span>
              </div>

              <div className="py-2.5">
                <span className="text-[10px] text-[var(--text-muted)] uppercase block">Detected At</span>
                <span className="text-[var(--text-primary)] font-mono">
                  {new Date(item.created_at).toLocaleString("en-IN")}
                </span>
              </div>

              {item.resolved_at && (
                <div className="pt-2.5">
                  <span className="text-[10px] text-[var(--text-muted)] uppercase block">Resolved At</span>
                  <span className="text-[var(--text-primary)] font-mono">
                    {new Date(item.resolved_at).toLocaleString("en-IN")}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Operational Triage Actions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Triage Actions</CardTitle>
              <CardDescription>Role-gated state machine operations.</CardDescription>
            </CardHeader>
            <CardContent>
              <WorkItemDetailActions item={item} userRole={userRole} userId={user?.id} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
