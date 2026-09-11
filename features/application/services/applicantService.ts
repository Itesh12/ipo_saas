/**
 * Applicant Profile Service
 * Manages user family and friends Demat applicant profiles with strict user isolation and masked PII.
 */

import { createClient } from "@/lib/supabase/server";
import { maskPAN, maskDematAccount, maskUPI } from "./piiMasking";
import {
  ApplicantFormData,
  applicantSchema,
} from "../schemas/application.schemas";
import {
  ApplicantProfileRow,
  ApplicantProfileInsert,
  ApplicantProfileUpdate,
  ApplicantSummary,
} from "../types/application.types";

/**
 * Retrieves all active/inactive applicant profiles belonging to a user.
 */
export async function getApplicantsForUser(userId: string): Promise<ApplicantSummary[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("applicant_profiles")
    .select(`
      id,
      relationship,
      display_name,
      pan_masked,
      demat_dp_id_masked,
      demat_account_no_masked,
      upi_id_masked,
      default_category,
      is_active,
      ipo_applications (count)
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error || !data) {
    return [];
  }

  const applicants = data as unknown as Array<{
    id: string;
    relationship: ApplicantSummary["relationship"];
    display_name: string;
    pan_masked: string;
    demat_dp_id_masked: string | null;
    demat_account_no_masked: string | null;
    upi_id_masked: string | null;
    default_category: ApplicantSummary["defaultCategory"];
    is_active: boolean;
    ipo_applications: Array<{ count: number }> | null;
  }>;

  return applicants.map((app) => {
    const rawCount = app.ipo_applications;
    const applicationCount = rawCount && rawCount.length > 0 ? rawCount[0].count : 0;

    return {
      id: app.id,
      relationship: app.relationship,
      displayName: app.display_name,
      panMasked: app.pan_masked,
      dematMasked: app.demat_account_no_masked
        ? `${app.demat_dp_id_masked ?? ""} ${app.demat_account_no_masked}`.trim()
        : "—",
      upiMasked: app.upi_id_masked || "—",
      defaultCategory: app.default_category,
      isActive: app.is_active,
      applicationCount,
    };
  });
}

/**
 * Retrieves a single applicant profile by ID with ownership verification.
 */
export async function getApplicantById(
  applicantId: string,
  userId: string
): Promise<ApplicantProfileRow | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("applicant_profiles")
    .select("*")
    .eq("id", applicantId)
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    return null;
  }

  return data as ApplicantProfileRow;
}

/**
 * Creates a new applicant profile with automatic masking.
 */
export async function createApplicant(
  userId: string,
  formData: ApplicantFormData
): Promise<{ success: boolean; data?: ApplicantProfileRow; error?: string }> {
  const validated = applicantSchema.safeParse(formData);
  if (!validated.success) {
    return {
      success: false,
      error: validated.error.issues.map((i) => i.message).join(", "),
    };
  }

  const values = validated.data;
  const supabase = await createClient();

  const insertPayload: ApplicantProfileInsert = {
    user_id: userId,
    relationship: values.relationship,
    display_name: values.display_name,
    pan_masked: maskPAN(values.pan),
    demat_dp_id_masked: values.demat_dp_id ? maskDematAccount(values.demat_dp_id) : null,
    demat_account_no_masked: values.demat_account_no
      ? maskDematAccount(values.demat_account_no)
      : null,
    upi_id_masked: values.upi_id ? maskUPI(values.upi_id) : null,
    default_category: values.default_category,
    notes: values.notes || null,
    is_active: values.is_active ?? true,
  };

  const { data, error } = await supabase
    .from("applicant_profiles")
    .insert(insertPayload as never)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data: data as ApplicantProfileRow };
}

/**
 * Updates an applicant profile with ownership verification.
 */
export async function updateApplicant(
  applicantId: string,
  userId: string,
  formData: Partial<ApplicantFormData>
): Promise<{ success: boolean; data?: ApplicantProfileRow; error?: string }> {
  const supabase = await createClient();

  const updatePayload: ApplicantProfileUpdate = {
    updated_at: new Date().toISOString(),
  };

  if (formData.relationship) updatePayload.relationship = formData.relationship;
  if (formData.display_name) updatePayload.display_name = formData.display_name;
  if (formData.pan) updatePayload.pan_masked = maskPAN(formData.pan);
  if (formData.demat_dp_id !== undefined) {
    updatePayload.demat_dp_id_masked = formData.demat_dp_id
      ? maskDematAccount(formData.demat_dp_id)
      : null;
  }
  if (formData.demat_account_no !== undefined) {
    updatePayload.demat_account_no_masked = formData.demat_account_no
      ? maskDematAccount(formData.demat_account_no)
      : null;
  }
  if (formData.upi_id !== undefined) {
    updatePayload.upi_id_masked = formData.upi_id ? maskUPI(formData.upi_id) : null;
  }
  if (formData.default_category) updatePayload.default_category = formData.default_category;
  if (formData.notes !== undefined) updatePayload.notes = formData.notes;
  if (formData.is_active !== undefined) updatePayload.is_active = formData.is_active;

  const { data, error } = await supabase
    .from("applicant_profiles")
    .update(updatePayload as never)
    .eq("id", applicantId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data: data as ApplicantProfileRow };
}

/**
 * Toggles an applicant profile's active status.
 */
export async function toggleApplicantActive(
  applicantId: string,
  userId: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("applicant_profiles")
    .update({ is_active: isActive, updated_at: new Date().toISOString() } as never)
    .eq("id", applicantId)
    .eq("user_id", userId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Admin view: Fetches all applicant profiles across users with masked PII and user details.
 */
export async function getAllApplicantsAdmin(): Promise<
  Array<
    ApplicantProfileRow & {
      user_email?: string;
      user_name?: string;
      application_count?: number;
    }
  >
> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("applicant_profiles")
    .select(`
      *,
      profiles (
        email,
        full_name
      ),
      ipo_applications (count)
    `)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  const items = data as unknown as Array<
    ApplicantProfileRow & {
      profiles: { email?: string; full_name?: string } | null;
      ipo_applications: Array<{ count: number }> | null;
    }
  >;

  return items.map((item) => {
    const profile = item.profiles;
    const rawCount = item.ipo_applications;
    const appCount = rawCount && rawCount.length > 0 ? rawCount[0].count : 0;

    return {
      ...(item as ApplicantProfileRow),
      user_email: profile?.email,
      user_name: profile?.full_name,
      application_count: appCount,
    };
  });
}
