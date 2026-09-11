"use server";

/**
 * features/admin/actions/auditActions.ts
 *
 * Next.js Server Actions for the Immutable Audit Log Explorer.
 * Restricted to super_admin and admin roles.
 * Enforces dynamic on-read sanitization to protect PII across all legacy and current rows.
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuditLogQueryParams, AuditLogRow } from "../types/audit.types";
import { sanitizeAuditPayload } from "../services/auditLoggingService";

async function requireAuditAccess() {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    throw new Error("Unauthorized: Authentication required.");
  }

  const { data } = await supabase
    .from("profiles")
    .select("role, is_suspended")
    .eq("id", user.id)
    .single();

  const profile = data as unknown as { role: string; is_suspended?: boolean } | null;

  if (!profile || profile.is_suspended || !["super_admin", "admin"].includes(profile.role)) {
    throw new Error("Forbidden: Only administrators can access the governance audit logs.");
  }

  return user;
}

export async function queryAuditLogsAction(params: AuditLogQueryParams = {}) {
  await requireAuditAccess();
  const adminClient = createAdminClient();

  const page = params.page || 1;
  const pageSize = params.pageSize || 25;
  const offset = (page - 1) * pageSize;

  let query = adminClient
    .from("audit_logs")
    .select("*, actor_profile:profiles!audit_logs_actor_id_fkey(id, full_name, email, role)", { count: "exact" });

  if (params.resource_type) {
    query = query.eq("resource_type", params.resource_type);
  }
  if (params.resource_id) {
    query = query.eq("resource_id", params.resource_id);
  }
  if (params.action) {
    query = query.eq("action", params.action);
  }
  if (params.actor_id) {
    query = query.eq("actor_id", params.actor_id);
  }
  if (params.fromDate) {
    query = query.gte("created_at", params.fromDate);
  }
  if (params.toDate) {
    query = query.lte("created_at", params.toDate);
  }
  if (params.search) {
    query = query.or(`action.ilike.%${params.search}%,resource_type.ilike.%${params.search}%,resource_id.ilike.%${params.search}%`);
  }

  query = query.order("created_at", { ascending: false }).range(offset, offset + pageSize - 1);

  const { data, error, count } = await query;
  if (error) {
    throw new Error(`Failed to query audit logs: ${error.message}`);
  }

  // Dynamic on-read sanitization: ensure no legacy unmasked PII is rendered
  const sanitizedLogs: AuditLogRow[] = (data || []).map((row) => ({
    ...row,
    old_values: row.old_values ? (sanitizeAuditPayload(row.old_values) as Record<string, unknown>) : null,
    new_values: row.new_values ? (sanitizeAuditPayload(row.new_values) as Record<string, unknown>) : null,
  }));

  return {
    logs: sanitizedLogs,
    total: count || 0,
  };
}

export async function getAuditLogDetailAction(id: string) {
  await requireAuditAccess();
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("audit_logs")
    .select("*, actor_profile:profiles!audit_logs_actor_id_fkey(id, full_name, email, role)")
    .eq("id", id)
    .single();

  if (error || !data) {
    throw new Error("Audit log entry not found");
  }

  const sanitized: AuditLogRow = {
    ...data,
    old_values: data.old_values ? (sanitizeAuditPayload(data.old_values) as Record<string, unknown>) : null,
    new_values: data.new_values ? (sanitizeAuditPayload(data.new_values) as Record<string, unknown>) : null,
  };

  return sanitized;
}
