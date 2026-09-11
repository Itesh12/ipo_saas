"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/security/auth-guards";
import { hasMinimumRole } from "@/lib/security/roles";
import {
  createApplication,
  cancelApplication,
} from "../services/applicationService";
import { updateApplicationMandate } from "../services/mandateService";
import {
  recordApplicationAllotment,
  processRefundAndUnblock,
} from "../services/allotmentService";
import {
  CreateApplicationFormData,
  UpdateMandateFormData,
  RecordAllotmentFormData,
} from "../schemas/application.schemas";

/**
 * User submits an IPO application.
 */
export async function submitApplicationAction(payload: CreateApplicationFormData) {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Authentication required to submit an application." };
  }

  const result = await createApplication(user.id, payload);
  if (result.success && result.data) {
    revalidatePath("/applications");
    revalidatePath("/dashboard");
    revalidatePath(`/applications/${result.data.id}`);
  }
  return result;
}

/**
 * User cancels an application prior to allotment.
 */
export async function cancelApplicationAction(applicationId: string, reason?: string) {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Authentication required." };
  }

  const result = await cancelApplication(applicationId, user.id, reason);
  if (result.success) {
    revalidatePath("/applications");
    revalidatePath(`/applications/${applicationId}`);
    revalidatePath("/dashboard");
  }
  return result;
}

/**
 * Staff records/updates mandate status tracking.
 */
export async function staffUpdateMandateAction(payload: UpdateMandateFormData) {
  const user = await getCurrentUser();
  if (!user || !hasMinimumRole(user.role, "editor")) {
    return { success: false, error: "Unauthorized. Staff role required to manage mandates." };
  }

  const result = await updateApplicationMandate(payload, user.id);
  if (result.success) {
    revalidatePath("/admin/applications");
    revalidatePath(`/applications/${payload.application_id}`);
  }
  return result;
}

/**
 * Staff records registrar allotment results.
 */
export async function staffRecordAllotmentAction(payload: RecordAllotmentFormData) {
  const user = await getCurrentUser();
  if (!user || !hasMinimumRole(user.role, "editor")) {
    return { success: false, error: "Unauthorized. Staff role required to record allotments." };
  }

  const result = await recordApplicationAllotment(payload, user.id);
  if (result.success) {
    revalidatePath("/admin/applications");
    revalidatePath(`/applications/${payload.application_id}`);
    revalidatePath("/dashboard");
  }
  return result;
}

/**
 * Staff triggers refund completion and unblocking.
 */
export async function staffProcessRefundAction(applicationId: string) {
  const user = await getCurrentUser();
  if (!user || !hasMinimumRole(user.role, "editor")) {
    return { success: false, error: "Unauthorized. Staff role required to process refunds." };
  }

  const result = await processRefundAndUnblock(applicationId, user.id);
  if (result.success) {
    revalidatePath("/admin/applications");
    revalidatePath(`/applications/${applicationId}`);
    revalidatePath("/dashboard");
  }
  return result;
}
