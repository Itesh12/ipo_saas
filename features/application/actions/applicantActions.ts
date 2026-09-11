"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/security/auth-guards";
import {
  createApplicant,
  updateApplicant,
  toggleApplicantActive,
} from "../services/applicantService";
import { ApplicantFormData } from "../schemas/application.schemas";

export async function createApplicantAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Authentication required." };
  }

  const payload: ApplicantFormData = {
    relationship: formData.get("relationship") as never,
    display_name: (formData.get("display_name") as string) || "",
    pan: (formData.get("pan") as string) || "",
    demat_dp_id: (formData.get("demat_dp_id") as string) || null,
    demat_account_no: (formData.get("demat_account_no") as string) || null,
    upi_id: (formData.get("upi_id") as string) || null,
    default_category: (formData.get("default_category") as never) || "retail",
    notes: (formData.get("notes") as string) || null,
    is_active: true,
  };

  const result = await createApplicant(user.id, payload);
  if (result.success) {
    revalidatePath("/applicants");
    revalidatePath("/applications/new");
    revalidatePath("/dashboard");
  }
  return result;
}

export async function updateApplicantAction(applicantId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Authentication required." };
  }

  const payload: Partial<ApplicantFormData> = {};
  const rel = formData.get("relationship");
  if (rel) payload.relationship = rel as never;
  const name = formData.get("display_name");
  if (name) payload.display_name = name as string;
  const pan = formData.get("pan");
  if (pan) payload.pan = pan as string;
  const dpId = formData.get("demat_dp_id");
  if (dpId !== null) payload.demat_dp_id = (dpId as string) || null;
  const acNo = formData.get("demat_account_no");
  if (acNo !== null) payload.demat_account_no = (acNo as string) || null;
  const upi = formData.get("upi_id");
  if (upi !== null) payload.upi_id = (upi as string) || null;
  const cat = formData.get("default_category");
  if (cat) payload.default_category = cat as never;

  const result = await updateApplicant(applicantId, user.id, payload);
  if (result.success) {
    revalidatePath("/applicants");
  }
  return result;
}

export async function toggleApplicantActiveAction(applicantId: string, isActive: boolean) {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Authentication required." };
  }

  const result = await toggleApplicantActive(applicantId, user.id, isActive);
  if (result.success) {
    revalidatePath("/applicants");
    revalidatePath("/applications/new");
  }
  return result;
}
