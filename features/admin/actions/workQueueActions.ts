"use server";

/**
 * features/admin/actions/workQueueActions.ts
 *
 * Next.js Server Actions for Admin Work Queue triage, assignment, and resolution.
 * Enforces server-side RBAC validation on every action.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { AdminWorkQueueService } from "../services/adminWorkQueueService";
import { WorkQueueFilterOptions } from "../types/workQueue.types";

/**
 * Verifies caller authentication and enforces role-based access.
 */
async function requireAdminRole(allowedRoles: string[] = ["super_admin", "admin"]) {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    throw new Error("Unauthorized: Authentication required.");
  }

  const { data, error: profileErr } = await supabase
    .from("profiles")
    .select("id, role, full_name, email, is_suspended")
    .eq("id", user.id)
    .single();

  const profile = data as unknown as {
    id: string;
    role: string;
    full_name?: string | null;
    email?: string | null;
    is_suspended?: boolean;
  } | null;

  if (profileErr || !profile || profile.is_suspended || !allowedRoles.includes(profile.role)) {
    throw new Error("Forbidden: Insufficient privileges for this administrative action.");
  }

  return { user, profile };
}

/**
 * Queries work items with filtering and pagination.
 * Accessible to: super_admin, admin, editor, analyst.
 */
export async function getWorkItemsAction(filters: WorkQueueFilterOptions = {}) {
  await requireAdminRole(["super_admin", "admin", "editor", "analyst"]);
  return AdminWorkQueueService.getWorkItems(filters);
}

/**
 * Fetches full detail for a single work item.
 * Accessible to: super_admin, admin, editor, analyst.
 */
export async function getWorkItemDetailAction(id: string) {
  await requireAdminRole(["super_admin", "admin", "editor", "analyst"]);
  const [item, history] = await Promise.all([
    AdminWorkQueueService.getWorkItemById(id),
    AdminWorkQueueService.getWorkItemHistory(id),
  ]);
  return { item, history };
}

/**
 * Assigns a work item.
 * - 'admin' and 'super_admin' can assign to any user or unassign.
 * - 'editor' can only assign to themselves.
 */
export async function assignWorkItemAction(itemId: string, assignedTo: string | null, notes?: string) {
  const { user, profile } = await requireAdminRole(["super_admin", "admin", "editor"]);

  if (profile.role === "editor" && assignedTo !== user.id) {
    throw new Error("Forbidden: Editors can only self-assign work items.");
  }

  const updated = await AdminWorkQueueService.assignWorkItem(itemId, assignedTo, user.id, notes);
  revalidatePath("/admin/work-queue");
  revalidatePath(`/admin/work-queue/${itemId}`);
  return { success: true, item: updated };
}

/**
 * Updates status to 'investigating'.
 * Accessible to: super_admin, admin, editor.
 */
export async function markInvestigatingAction(itemId: string, notes?: string) {
  const { user } = await requireAdminRole(["super_admin", "admin", "editor"]);
  const updated = await AdminWorkQueueService.markInvestigating(itemId, user.id, notes);
  revalidatePath("/admin/work-queue");
  revalidatePath(`/admin/work-queue/${itemId}`);
  return { success: true, item: updated };
}

/**
 * Resolves a work item.
 * Accessible to: super_admin, admin.
 */
export async function resolveWorkItemAction(itemId: string, resolutionNotes: string) {
  const { user } = await requireAdminRole(["super_admin", "admin"]);
  const updated = await AdminWorkQueueService.resolveWorkItem(itemId, user.id, resolutionNotes);
  revalidatePath("/admin/work-queue");
  revalidatePath(`/admin/work-queue/${itemId}`);
  return { success: true, item: updated };
}

/**
 * Dismisses a work item.
 * Accessible to: super_admin, admin.
 */
export async function dismissWorkItemAction(itemId: string, rationale: string) {
  const { user } = await requireAdminRole(["super_admin", "admin"]);
  const updated = await AdminWorkQueueService.dismissWorkItem(itemId, user.id, rationale);
  revalidatePath("/admin/work-queue");
  revalidatePath(`/admin/work-queue/${itemId}`);
  return { success: true, item: updated };
}

/**
 * Reopens a resolved or dismissed work item.
 * Accessible to: super_admin, admin.
 */
export async function reopenWorkItemAction(itemId: string, justification: string) {
  const { user } = await requireAdminRole(["super_admin", "admin"]);
  const updated = await AdminWorkQueueService.reopenWorkItem(itemId, user.id, justification);
  revalidatePath("/admin/work-queue");
  revalidatePath(`/admin/work-queue/${itemId}`);
  return { success: true, item: updated };
}
