import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { AuditDiffViewer } from "@/features/admin/components/audit/AuditDiffViewer";
import { getAuditLogDetailAction } from "@/features/admin/actions/auditActions";
import { ArrowLeft, ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AuditLogDetailPage({ params }: PageProps) {
  const { id } = await params;
  let log;
  try {
    log = await getAuditLogDetailAction(id);
  } catch {
    notFound();
  }

  if (!log) notFound();

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-fadeIn">
      <div>
        <Link
          href="/admin/audit-logs"
          className="inline-flex items-center text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-2"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1" />
          Back to Audit Trail
        </Link>
        <PageHeader
          title={`Audit Record: ${log.action}`}
          description={`Log Entry ID: ${log.id}`}
          badge={
            <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-full bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)]">
              {log.resource_type}
            </span>
          }
        />
      </div>

      {/* Attribution Meta Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Actor & Context Attribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] space-y-1">
              <span className="text-[10px] text-[var(--text-muted)] uppercase block">Actor</span>
              <span className="font-semibold text-[var(--text-primary)] block truncate">
                {log.actor_profile?.full_name || log.actor_profile?.email || (log.actor_type === "system" ? "System Service" : log.actor_id)}
              </span>
            </div>
            <div className="p-3 rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] space-y-1">
              <span className="text-[10px] text-[var(--text-muted)] uppercase block">Role</span>
              <span className="font-mono text-[var(--text-primary)] block truncate">
                {log.actor_profile?.role || log.actor_type}
              </span>
            </div>
            <div className="p-3 rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] space-y-1">
              <span className="text-[10px] text-[var(--text-muted)] uppercase block">IP Address</span>
              <span className="font-mono text-[var(--text-primary)] block truncate">
                {log.ip_address || "internal"}
              </span>
            </div>
            <div className="p-3 rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] space-y-1">
              <span className="text-[10px] text-[var(--text-muted)] uppercase block">Recorded At</span>
              <span className="font-mono text-[var(--text-primary)] block truncate">
                {new Date(log.created_at).toLocaleString("en-IN")}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* State Mutation Diff */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>State Mutation Diff (Sanitized)</span>
          </CardTitle>
          <CardDescription>
            Before and after JSON payload comparison with automatic PII masking.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AuditDiffViewer oldValues={log.old_values} newValues={log.new_values} />
        </CardContent>
      </Card>
    </div>
  );
}
