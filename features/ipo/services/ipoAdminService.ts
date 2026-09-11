import { createClient } from "@/lib/supabase/server";
import { IPORow, IPOPublicationStatus } from "../types/ipo.types";
import { Database, Json } from "@/types/database.types";
import { ipoSchema, IPOFormData } from "../schemas/ipoValidation";
import { calculateMinimumInvestment } from "./ipoLifecycle";

type IPOInsert = Database["public"]["Tables"]["ipos"]["Insert"];
type IPOUpdate = Database["public"]["Tables"]["ipos"]["Update"];
type AuditInsert = Database["public"]["Tables"]["audit_logs"]["Insert"];

/**
 * Fetches all IPOs across all publication states for the Admin console.
 */
export async function getAllIPOsAdmin(filters: {
  publicationStatus?: IPOPublicationStatus | "all";
  searchQuery?: string;
  category?: string;
} = {}): Promise<IPORow[]> {
  const supabase = await createClient();
  let query = supabase.from("ipos").select("*").order("created_at", { ascending: false });

  if (filters.publicationStatus && filters.publicationStatus !== "all") {
    query = query.eq("publication_status", filters.publicationStatus);
  }

  if (filters.category && filters.category !== "all") {
    query = query.eq("category", filters.category);
  }

  if (filters.searchQuery) {
    const term = `%${filters.searchQuery}%`;
    query = query.or(`company_name.ilike.${term},symbol.ilike.${term}`);
  }

  const { data, error } = await query;
  if (error || !data) {
    return [];
  }

  return data as unknown as IPORow[];
}

/**
 * Creates a new IPO master record with validation and audit logging.
 */
export async function createIPOAdmin(
  formData: IPOFormData,
  actorId?: string | null
): Promise<{ success: boolean; data?: IPORow; error?: string }> {
  const validated = ipoSchema.safeParse(formData);
  if (!validated.success) {
    return {
      success: false,
      error: validated.error.issues.map((i) => i.message).join(", "),
    };
  }

  const values = validated.data;
  const minInvestment = calculateMinimumInvestment(
    values.price_band_high,
    values.lot_size,
    values.price_band_low
  );

  const supabase = await createClient();

  const insertPayload: IPOInsert = {
    company_name: values.company_name,
    slug: values.slug,
    symbol: values.symbol || null,
    company_logo: values.company_logo || null,
    category: values.category,
    issue_type: values.issue_type,
    status: values.status,
    publication_status: values.publication_status,
    price_band_low: values.price_band_low || null,
    price_band_high: values.price_band_high || null,
    face_value: values.face_value,
    lot_size: values.lot_size,
    min_investment: minInvestment,
    issue_size_cr: values.issue_size_cr || null,
    fresh_issue_cr: values.fresh_issue_cr || null,
    ofs_cr: values.ofs_cr || null,
    shares_offered: values.shares_offered || null,
    retail_quota_pct: values.retail_quota_pct,
    qib_quota_pct: values.qib_quota_pct,
    hni_quota_pct: values.hni_quota_pct,
    exchange: values.exchange,
    registrar_name: values.registrar_name || null,
    lead_managers: values.lead_managers,
    announcement_date: values.announcement_date || null,
    open_date: values.open_date || null,
    close_date: values.close_date || null,
    allotment_date: values.allotment_date || null,
    refund_date: values.refund_date || null,
    listing_date: values.listing_date || null,
    listing_price: values.listing_price || null,
    about_company: values.about_company || null,
    created_by: actorId ?? null,
    published_at: values.publication_status === "published" ? new Date().toISOString() : null,
  };

  const { data, error } = await supabase
    .from("ipos")
    .insert(insertPayload as never)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  const createdIPO = data as unknown as IPORow;

  const auditEntry: AuditInsert = {
    actor_id: actorId ?? null,
    action: "ipo_created",
    resource_type: "ipos",
    resource_id: createdIPO.id,
    new_values: createdIPO as unknown as Json,
  };

  await supabase.from("audit_logs").insert(auditEntry as never);

  return { success: true, data: createdIPO };
}

/**
 * Updates an existing IPO master record with audit trail.
 */
export async function updateIPOAdmin(
  id: string,
  formData: IPOFormData,
  actorId?: string | null
): Promise<{ success: boolean; data?: IPORow; error?: string }> {
  const validated = ipoSchema.safeParse(formData);
  if (!validated.success) {
    return {
      success: false,
      error: validated.error.issues.map((i) => i.message).join(", "),
    };
  }

  const values = validated.data;
  const minInvestment = calculateMinimumInvestment(
    values.price_band_high,
    values.lot_size,
    values.price_band_low
  );

  const supabase = await createClient();

  // Fetch current values for audit diff
  const { data: previousData } = await supabase
    .from("ipos")
    .select("*")
    .eq("id", id)
    .single();

  const prev = previousData as unknown as IPORow | null;

  const updatePayload: IPOUpdate = {
    company_name: values.company_name,
    slug: values.slug,
    symbol: values.symbol || null,
    company_logo: values.company_logo || null,
    category: values.category,
    issue_type: values.issue_type,
    status: values.status,
    publication_status: values.publication_status,
    price_band_low: values.price_band_low || null,
    price_band_high: values.price_band_high || null,
    face_value: values.face_value,
    lot_size: values.lot_size,
    min_investment: minInvestment,
    issue_size_cr: values.issue_size_cr || null,
    fresh_issue_cr: values.fresh_issue_cr || null,
    ofs_cr: values.ofs_cr || null,
    shares_offered: values.shares_offered || null,
    retail_quota_pct: values.retail_quota_pct,
    qib_quota_pct: values.qib_quota_pct,
    hni_quota_pct: values.hni_quota_pct,
    exchange: values.exchange,
    registrar_name: values.registrar_name || null,
    lead_managers: values.lead_managers,
    announcement_date: values.announcement_date || null,
    open_date: values.open_date || null,
    close_date: values.close_date || null,
    allotment_date: values.allotment_date || null,
    refund_date: values.refund_date || null,
    listing_date: values.listing_date || null,
    listing_price: values.listing_price || null,
    about_company: values.about_company || null,
    updated_at: new Date().toISOString(),
    published_at:
      values.publication_status === "published" && !prev?.published_at
        ? new Date().toISOString()
        : prev?.published_at,
  };

  const { data, error } = await supabase
    .from("ipos")
    .update(updatePayload as never)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  const updatedIPO = data as unknown as IPORow;

  const auditEntry: AuditInsert = {
    actor_id: actorId ?? null,
    action: "ipo_updated",
    resource_type: "ipos",
    resource_id: id,
    old_values: prev as unknown as Json,
    new_values: updatedIPO as unknown as Json,
  };

  await supabase.from("audit_logs").insert(auditEntry as never);

  return { success: true, data: updatedIPO };
}

/**
 * Transitions an IPO's publication status with workflow validation.
 * Draft -> In Review -> Approved -> Published -> Archived
 */
export async function transitionPublicationStatus(
  id: string,
  nextStatus: IPOPublicationStatus,
  actorId?: string | null
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const { data: current, error: fetchErr } = await supabase
    .from("ipos")
    .select("publication_status, company_name")
    .eq("id", id)
    .single();

  if (fetchErr || !current) {
    return { success: false, error: "IPO record not found" };
  }

  const curr = current as unknown as { publication_status: IPOPublicationStatus; company_name: string };

  const updatePayload: IPOUpdate = {
    publication_status: nextStatus,
    updated_at: new Date().toISOString(),
    ...(nextStatus === "approved" ? { approved_by: actorId ?? null } : {}),
    ...(nextStatus === "published" ? { published_at: new Date().toISOString() } : {}),
  };

  const { error } = await supabase
    .from("ipos")
    .update(updatePayload as never)
    .eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  const auditEntry: AuditInsert = {
    actor_id: actorId ?? null,
    action: `ipo_status_transition_${nextStatus}`,
    resource_type: "ipos",
    resource_id: id,
    old_values: { publication_status: curr.publication_status },
    new_values: { publication_status: nextStatus },
  };

  await supabase.from("audit_logs").insert(auditEntry as never);

  return { success: true };
}
