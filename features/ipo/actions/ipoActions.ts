"use server";

import { createIPOAdmin, updateIPOAdmin, transitionPublicationStatus } from "../services/ipoAdminService";
import { IPOFormData } from "../schemas/ipoValidation";
import { IPOPublicationStatus } from "../types/ipo.types";
import { getCurrentUser, requireRole } from "@/lib/security/auth-guards";
import { revalidatePath } from "next/cache";

/**
 * Server Action: Creates a new IPO master.
 * Enforces 'editor' minimum role.
 */
export async function createIPOServerAction(formData: IPOFormData) {
  const user = await requireRole("editor");
  const result = await createIPOAdmin(formData, user.id);

  if (result.success) {
    revalidatePath("/ipos");
    revalidatePath("/ipo-calendar");
    revalidatePath("/admin/ipos");
  }

  return result;
}

/**
 * Server Action: Updates an existing IPO master.
 * Enforces 'editor' minimum role.
 */
export async function updateIPOServerAction(id: string, formData: IPOFormData) {
  const user = await requireRole("editor");
  const result = await updateIPOAdmin(id, formData, user.id);

  if (result.success) {
    revalidatePath("/ipos");
    revalidatePath(`/ipos/${formData.slug}`);
    revalidatePath("/ipo-calendar");
    revalidatePath("/admin/ipos");
  }

  return result;
}

/**
 * Server Action: Transitions publication status.
 * - Draft -> In Review: Editor
 * - In Review -> Approved: Admin / Super Admin
 * - Approved -> Published: Admin / Super Admin
 * - Any -> Archived: Admin / Super Admin
 */
export async function transitionPublicationAction(
  id: string,
  nextStatus: IPOPublicationStatus
) {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  // Enforce role gating per transition
  if (nextStatus === "approved" || nextStatus === "published" || nextStatus === "archived") {
    if (!["admin", "super_admin"].includes(user.role)) {
      return {
        success: false,
        error: `Only Administrators can set status to '${nextStatus}'.`,
      };
    }
  }

  const result = await transitionPublicationStatus(id, nextStatus, user.id);

  if (result.success) {
    revalidatePath("/ipos");
    revalidatePath("/ipo-calendar");
    revalidatePath("/admin/ipos");
  }

  return result;
}
