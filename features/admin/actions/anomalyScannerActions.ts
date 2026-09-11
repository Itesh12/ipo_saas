"use server";

/**
 * features/admin/actions/anomalyScannerActions.ts
 *
 * Next.js Server Action to trigger the full platform anomaly detection scan.
 * Restricted to super_admin and admin roles.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { DataQualityScannerService } from "../services/dataQualityScannerService";

async function requireAdminRole() {
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
    throw new Error("Forbidden: Only administrators can trigger platform anomaly scans.");
  }

  return user;
}

export async function runAnomalyScanAction() {
  await requireAdminRole();
  const summary = await DataQualityScannerService.runFullScan();

  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/work-queue");
  revalidatePath("/admin/system-health");
  revalidatePath("/admin/data-quality");

  return { success: true, summary };
}
