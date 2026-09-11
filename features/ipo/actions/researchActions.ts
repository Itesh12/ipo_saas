"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/security/auth-guards";
import { hasMinimumRole } from "@/lib/security/roles";
import {
  recordGMPEntry,
  recordSubscriptionSnapshot,
} from "../services/ipoAdminResearchService";

/**
 * Server action to record daily GMP.
 */
export async function recordGMPAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || !hasMinimumRole(user.role, "editor")) {
    return { success: false, error: "Unauthorized: Editor or Admin privileges required." };
  }

  const ipoId = formData.get("ipo_id") as string;
  const gmpValue = parseFloat(formData.get("gmp_value") as string);
  const cutoffPrice = parseFloat(formData.get("cutoff_price") as string);
  const source = formData.get("source") as string;
  const notes = formData.get("notes") as string;

  if (!ipoId || isNaN(gmpValue) || isNaN(cutoffPrice)) {
    return { success: false, error: "Invalid form input parameters." };
  }

  try {
    const res = await recordGMPEntry({
      ipoId,
      gmpValue,
      cutoffPrice,
      source: source || undefined,
      notes: notes || undefined,
    });
    revalidatePath("/admin/gmp");
    revalidatePath("/ipo-gmp");
    revalidatePath("/ipos");
    return { success: true, data: res };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message || "Failed to record GMP" };
  }
}

/**
 * Server action to record subscription snapshot.
 */
export async function recordSubscriptionAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || !hasMinimumRole(user.role, "editor")) {
    return { success: false, error: "Unauthorized: Editor or Admin privileges required." };
  }

  const ipoId = formData.get("ipo_id") as string;
  const dayNumber = parseInt(formData.get("day_number") as string, 10);
  const snapshotDate = formData.get("snapshot_date") as string;
  const qib_x = formData.get("qib_x") ? parseFloat(formData.get("qib_x") as string) : null;
  const nii_x = formData.get("nii_x") ? parseFloat(formData.get("nii_x") as string) : null;
  const retail_x = formData.get("retail_x") ? parseFloat(formData.get("retail_x") as string) : null;
  const overall_x = parseFloat(formData.get("overall_x") as string);
  const source = formData.get("source") as string;

  if (!ipoId || isNaN(dayNumber) || !snapshotDate || isNaN(overall_x)) {
    return { success: false, error: "Invalid subscription snapshot parameters." };
  }

  try {
    const res = await recordSubscriptionSnapshot({
      ipoId,
      dayNumber,
      snapshotDate,
      qib_x,
      nii_x,
      retail_x,
      overall_x,
      source: source || undefined,
    });
    revalidatePath("/admin/subscriptions");
    revalidatePath("/ipo-subscription");
    revalidatePath("/ipos");
    return { success: true, data: res };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message || "Failed to record subscription" };
  }
}
