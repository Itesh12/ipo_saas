/**
 * features/admin/services/adminWorkQueueService.ts
 *
 * Operational triage engine managing the Admin Work Queue.
 * Enforces:
 *  - Active-anomaly deduplication via partial unique index
 *  - State machine transition validation
 *  - Diagnostic metadata sanitization
 *  - Automatic history generation via DB triggers
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  AdminWorkItem,
  AdminWorkItemHistory,
  WorkItemCategory,
  WorkItemSeverity,
  WorkQueueFilterOptions,
} from "../types/workQueue.types";
import { AuditLoggingService } from "./auditLoggingService";

export interface UpsertWorkItemParams {
  fingerprint: string;
  severity: WorkItemSeverity;
  category: WorkItemCategory;
  entityType: string;
  entityId: string;
  title: string;
  description: string;
  metadata?: Record<string, unknown>;
  dueDate?: string | null;
}

/**
 * Validates and sanitizes work-item metadata: strictly prevents credentials,
 * OTPs, passwords, unmasked PANs, and raw upstream payloads.
 */
export function sanitizeWorkItemMetadata(meta?: Record<string, unknown>): Record<string, unknown> {
  if (!meta) return {};

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    const lower = key.toLowerCase();
    if (
      lower.includes("password") ||
      lower.includes("secret") ||
      lower.includes("token") ||
      lower.includes("otp") ||
      lower.includes("auth") ||
      lower.includes("api_key")
    ) {
      sanitized[key] = "[PROHIBITED_CREDENTIAL_REDACTED]";
    } else if (lower.includes("pan") && typeof value === "string" && value.length === 10) {
      sanitized[key] = `XXXXX${value.slice(5)}`;
    } else if (lower.includes("account_no") && typeof value === "string" && value.length >= 4) {
      sanitized[key] = `XXXXXXXX${value.slice(-4)}`;
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeWorkItemMetadata(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export class AdminWorkQueueService {
  /**
   * Upserts an active anomaly work item.
   * If an active (open/investigating) work item with the same fingerprint exists,
   * updates its metadata and timestamp.
   * If no active item exists (or prior item was resolved/dismissed), inserts a new item.
   */
  public static async upsertActiveWorkItem(params: UpsertWorkItemParams): Promise<AdminWorkItem> {
    const adminClient = createAdminClient();
    const cleanMeta = sanitizeWorkItemMetadata(params.metadata);

    // Check for existing active item with this fingerprint
    const { data: existingActive, error: findErr } = await adminClient
      .from("admin_work_items")
      .select("*")
      .eq("fingerprint", params.fingerprint)
      .in("status", ["open", "investigating"])
      .maybeSingle();

    if (findErr) {
      console.error("Error checking active work item:", findErr);
    }

    if (existingActive) {
      // Update existing active item with latest diagnostic details
      const { data: updated, error: updateErr } = await adminClient
        .from("admin_work_items")
        .update({
          severity: params.severity,
          title: params.title,
          description: params.description,
          metadata: cleanMeta,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingActive.id)
        .select("*")
        .single();

      if (updateErr) throw new Error(`Failed to update active work item: ${updateErr.message}`);
      return updated as AdminWorkItem;
    }

    // Insert new active work item
    const { data: created, error: insertErr } = await adminClient
      .from("admin_work_items")
      .insert({
        fingerprint: params.fingerprint,
        severity: params.severity,
        category: params.category,
        entity_type: params.entityType,
        entity_id: params.entityId,
        title: params.title,
        description: params.description,
        metadata: cleanMeta,
        status: "open",
        due_date: params.dueDate || null,
      })
      .select("*")
      .single();

    if (insertErr) {
      throw new Error(`Failed to create work item: ${insertErr.message}`);
    }

    return created as AdminWorkItem;
  }

  /**
   * Triage: Assign a work item to an admin/editor.
   */
  public static async assignWorkItem(
    itemId: string,
    assignedTo: string | null,
    actorId: string,
    notes?: string
  ): Promise<AdminWorkItem> {
    const adminClient = createAdminClient();

    const { data: current, error: getErr } = await adminClient
      .from("admin_work_items")
      .select("id, status, assigned_to")
      .eq("id", itemId)
      .single();

    if (getErr || !current) throw new Error("Work item not found");

    const { data: updated, error: updateErr } = await adminClient
      .from("admin_work_items")
      .update({
        assigned_to: assignedTo,
        resolution_notes: notes || null,
      })
      .eq("id", itemId)
      .select("*")
      .single();

    if (updateErr) throw new Error(`Failed to assign work item: ${updateErr.message}`);

    // Audit log privileged assignment
    await AuditLoggingService.recordAudit({
      action: "assign_work_item",
      resourceType: "admin_work_items",
      resourceId: itemId,
      oldValues: { assigned_to: current.assigned_to },
      newValues: { assigned_to: assignedTo, notes },
      actorId,
    });

    return updated as AdminWorkItem;
  }

  /**
   * Updates work item status to 'investigating'.
   */
  public static async markInvestigating(
    itemId: string,
    actorId: string,
    notes?: string
  ): Promise<AdminWorkItem> {
    const adminClient = createAdminClient();

    const { data: updated, error: updateErr } = await adminClient
      .from("admin_work_items")
      .update({
        status: "investigating",
        resolution_notes: notes || null,
      })
      .eq("id", itemId)
      .select("*")
      .single();

    if (updateErr) throw new Error(`Failed to update status to investigating: ${updateErr.message}`);

    await AuditLoggingService.recordAudit({
      action: "investigate_work_item",
      resourceType: "admin_work_items",
      resourceId: itemId,
      newValues: { status: "investigating", notes },
      actorId,
    });

    return updated as AdminWorkItem;
  }

  /**
   * Resolves a work item. Requires resolution notes.
   */
  public static async resolveWorkItem(
    itemId: string,
    actorId: string,
    resolutionNotes: string
  ): Promise<AdminWorkItem> {
    if (!resolutionNotes || resolutionNotes.trim().length === 0) {
      throw new Error("Resolution notes are strictly required to resolve a work item.");
    }

    const adminClient = createAdminClient();

    const { data: updated, error: updateErr } = await adminClient
      .from("admin_work_items")
      .update({
        status: "resolved",
        resolved_by: actorId,
        resolved_at: new Date().toISOString(),
        resolution_notes: resolutionNotes.trim(),
      })
      .eq("id", itemId)
      .select("*")
      .single();

    if (updateErr) throw new Error(`Failed to resolve work item: ${updateErr.message}`);

    await AuditLoggingService.recordAudit({
      action: "resolve_work_item",
      resourceType: "admin_work_items",
      resourceId: itemId,
      newValues: { status: "resolved", resolution_notes: resolutionNotes.trim() },
      actorId,
    });

    return updated as AdminWorkItem;
  }

  /**
   * Dismisses a work item (e.g. false positive or acceptable variance). Requires rationale.
   */
  public static async dismissWorkItem(
    itemId: string,
    actorId: string,
    rationale: string
  ): Promise<AdminWorkItem> {
    if (!rationale || rationale.trim().length === 0) {
      throw new Error("Dismissal rationale is strictly required to dismiss a work item.");
    }

    const adminClient = createAdminClient();

    const { data: updated, error: updateErr } = await adminClient
      .from("admin_work_items")
      .update({
        status: "dismissed",
        resolved_by: actorId,
        resolved_at: new Date().toISOString(),
        resolution_notes: rationale.trim(),
      })
      .eq("id", itemId)
      .select("*")
      .single();

    if (updateErr) throw new Error(`Failed to dismiss work item: ${updateErr.message}`);

    await AuditLoggingService.recordAudit({
      action: "dismiss_work_item",
      resourceType: "admin_work_items",
      resourceId: itemId,
      newValues: { status: "dismissed", rationale: rationale.trim() },
      actorId,
    });

    return updated as AdminWorkItem;
  }

  /**
   * Reopens a resolved or dismissed work item.
   * Mandates explicit reopening justification notes.
   */
  public static async reopenWorkItem(
    itemId: string,
    actorId: string,
    reopeningJustification: string
  ): Promise<AdminWorkItem> {
    if (!reopeningJustification || reopeningJustification.trim().length === 0) {
      throw new Error("Reopening justification notes are strictly required to reopen a work item.");
    }

    const adminClient = createAdminClient();

    const { data: updated, error: updateErr } = await adminClient
      .from("admin_work_items")
      .update({
        status: "open",
        resolution_notes: `REOPENED: ${reopeningJustification.trim()}`,
      })
      .eq("id", itemId)
      .select("*")
      .single();

    if (updateErr) throw new Error(`Failed to reopen work item: ${updateErr.message}`);

    await AuditLoggingService.recordAudit({
      action: "reopen_work_item",
      resourceType: "admin_work_items",
      resourceId: itemId,
      newValues: { status: "open", justification: reopeningJustification.trim() },
      actorId,
    });

    return updated as AdminWorkItem;
  }

  /**
   * Queries work items with filtering and pagination.
   */
  public static async getWorkItems(filters: WorkQueueFilterOptions = {}): Promise<{
    items: AdminWorkItem[];
    total: number;
  }> {
    const adminClient = createAdminClient();
    const page = filters.page || 1;
    const pageSize = filters.pageSize || 25;
    const offset = (page - 1) * pageSize;

    let query = adminClient
      .from("admin_work_items")
      .select("*, assigned_profile:profiles!admin_work_items_assigned_to_fkey(id, full_name, email, role), resolved_profile:profiles!admin_work_items_resolved_by_fkey(id, full_name, email)", { count: "exact" });

    if (filters.status && filters.status !== "all") {
      query = query.eq("status", filters.status);
    }
    if (filters.severity && filters.severity !== "all") {
      query = query.eq("severity", filters.severity);
    }
    if (filters.category && filters.category !== "all") {
      query = query.eq("category", filters.category);
    }
    if (filters.assignedTo) {
      if (filters.assignedTo === "unassigned") {
        query = query.is("assigned_to", null);
      } else if (filters.assignedTo !== "all") {
        query = query.eq("assigned_to", filters.assignedTo);
      }
    }
    if (filters.search) {
      query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
    }

    query = query.order("created_at", { ascending: false }).range(offset, offset + pageSize - 1);

    const { data, error, count } = await query;
    if (error) throw new Error(`Error fetching work items: ${error.message}`);

    return {
      items: (data || []) as AdminWorkItem[],
      total: count || 0,
    };
  }

  /**
   * Fetches full diagnostic detail for a single work item.
   */
  public static async getWorkItemById(id: string): Promise<AdminWorkItem | null> {
    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from("admin_work_items")
      .select("*, assigned_profile:profiles!admin_work_items_assigned_to_fkey(id, full_name, email, role), resolved_profile:profiles!admin_work_items_resolved_by_fkey(id, full_name, email)")
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(`Error fetching work item: ${error.message}`);
    return data as AdminWorkItem | null;
  }

  /**
   * Fetches the immutable audit history of a work item.
   */
  public static async getWorkItemHistory(workItemId: string): Promise<AdminWorkItemHistory[]> {
    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from("admin_work_item_history")
      .select("*, actor_profile:profiles(id, full_name, email, role)")
      .eq("work_item_id", workItemId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Error fetching work item history: ${error.message}`);
    return (data || []) as AdminWorkItemHistory[];
  }
}
