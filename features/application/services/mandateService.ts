/**
 * UPI Mandate Orchestration Service
 * Handles UPI mandate tracking, status progression, and blocked amount synchronization.
 * Note: Never executes real payment or stores credentials. Orchestrates mandate tracking records only.
 */

import { createClient } from "@/lib/supabase/server";
import { transitionApplicationStatus } from "./applicationService";
import { UpdateMandateFormData, updateMandateSchema } from "../schemas/application.schemas";

/**
 * Updates a mandate tracking record and synchronizes application lifecycle accordingly.
 */
export async function updateApplicationMandate(
  formData: UpdateMandateFormData,
  actorId?: string | null
): Promise<{ success: boolean; error?: string }> {
  const validated = updateMandateSchema.safeParse(formData);
  if (!validated.success) {
    return {
      success: false,
      error: validated.error.issues.map((i) => i.message).join(", "),
    };
  }

  const { application_id, mandate_status, provider, provider_reference, blocked_amount, failure_reason } =
    validated.data;

  const supabase = await createClient();

  const now = new Date().toISOString();
  const updatePayload: Record<string, unknown> = {
    mandate_status,
    provider,
    updated_at: now,
  };

  if (provider_reference !== undefined) updatePayload.provider_reference = provider_reference;
  if (blocked_amount !== undefined) updatePayload.blocked_amount = blocked_amount;
  if (failure_reason !== undefined) updatePayload.failure_reason = failure_reason;

  if (mandate_status === "approved") updatePayload.approved_at = now;
  if (mandate_status === "rejected") updatePayload.rejected_at = now;
  if (mandate_status === "unblocked") updatePayload.unblocked_at = now;

  const { error: mandateErr } = await supabase
    .from("ipo_application_mandates")
    .update(updatePayload as never)
    .eq("application_id", application_id);

  if (mandateErr) {
    return { success: false, error: mandateErr.message };
  }

  // Update application-level blocked amount if provided
  if (blocked_amount !== undefined) {
    await supabase
      .from("ipo_applications")
      .update({ blocked_amount, updated_at: now } as never)
      .eq("id", application_id);
  }

  // Automatically transition application status based on mandate progression
  if (mandate_status === "approved") {
    await transitionApplicationStatus({
      applicationId: application_id,
      nextStatus: "mandate_approved",
      actorId,
      description: `Mandate approval confirmed (Ref: ${provider_reference || "UPI"}).`,
    });
  } else if (mandate_status === "blocked") {
    await transitionApplicationStatus({
      applicationId: application_id,
      nextStatus: "funds_blocked",
      actorId,
      description: `Bank lien confirmed on funds (₹${(blocked_amount || 0).toLocaleString("en-IN")}).`,
      metadata: { blockedAmount: blocked_amount },
    });
  } else if (mandate_status === "unblocked") {
    await transitionApplicationStatus({
      applicationId: application_id,
      nextStatus: "funds_unblocked",
      actorId,
      description: "Bank fund lien released.",
    });
  }

  return { success: true };
}
