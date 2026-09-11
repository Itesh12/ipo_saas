/**
 * IPO Application Service
 * Orchestrates application creation, multi-bid insertion, mandate setup, lifecycle transitions,
 * and immutable event logging.
 */

import { createClient } from "@/lib/supabase/server";
import {
  evaluateBids,
  computeApplicationAggregates,
  BidInput,
} from "./applicationRules";
import {
  ApplicationStatus,
  isValidApplicationTransition,
} from "./applicationLifecycle";
import { dispatchApplicationDomainEvent } from "./domainEventDispatcher";
import {
  CreateApplicationFormData,
  createApplicationSchema,
} from "../schemas/application.schemas";
import {
  IPOApplicationRow,
  IPOApplicationInsert,
  IPOApplicationBidRow,
  IPOApplicationBidInsert,
  IPOApplicationMandateInsert,
  IPOApplicationEventInsert,
  ApplicationDetailBundle,
  ApplicationListItem,
} from "../types/application.types";
import { maskUPI } from "./piiMasking";

/**
 * Generates a standard application tracking reference number.
 * Example: 'APP-20260910-8F3A29'
 */
function generateApplicationNumber(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `APP-${dateStr}-${randomSuffix}`;
}

/**
 * Creates a complete IPO application with multi-bids, mandate tracking, and event log.
 */
export async function createApplication(
  userId: string,
  formData: CreateApplicationFormData
): Promise<{ success: boolean; data?: IPOApplicationRow; error?: string }> {
  const validated = createApplicationSchema.safeParse(formData);
  if (!validated.success) {
    return {
      success: false,
      error: validated.error.issues.map((i) => i.message).join(", "),
    };
  }

  const { ipo_id, applicant_id, investor_category, bids, upi_id, notes } = validated.data;
  const supabase = await createClient();

  // 1. Verify Applicant ownership
  const { data: rawApplicant, error: applicantError } = await supabase
    .from("applicant_profiles")
    .select("id, user_id, display_name, pan_masked, is_active, upi_id_masked")
    .eq("id", applicant_id)
    .eq("user_id", userId)
    .single();

  const applicant = rawApplicant as unknown as {
    id: string;
    user_id: string;
    display_name: string;
    pan_masked: string;
    is_active: boolean;
    upi_id_masked: string | null;
  } | null;

  if (applicantError || !applicant) {
    return { success: false, error: "Selected applicant profile not found or unauthorized." };
  }

  if (!applicant.is_active) {
    return { success: false, error: "The selected applicant profile is currently inactive." };
  }

  // 2. Verify IPO existence & bidding eligibility
  const { data: rawIpo, error: ipoError } = await supabase
    .from("ipos")
    .select("id, company_name, status, lot_size, price_band_low, price_band_high, publication_status")
    .eq("id", ipo_id)
    .single();

  const ipo = rawIpo as unknown as {
    id: string;
    company_name: string;
    status: string;
    lot_size: number;
    price_band_low: number;
    price_band_high: number;
    publication_status: string;
  } | null;

  if (ipoError || !ipo) {
    return { success: false, error: "Target IPO record not found." };
  }

  if (ipo.publication_status !== "published") {
    return { success: false, error: "Applications cannot be submitted for unpublished IPOs." };
  }

  // 3. Check duplicate active application for same applicant, IPO, and category
  const { data: rawActiveApp } = await supabase
    .from("ipo_applications")
    .select("id, application_number, status")
    .eq("applicant_id", applicant_id)
    .eq("ipo_id", ipo_id)
    .eq("investor_category", investor_category)
    .not("status", "in", '("cancelled","completed")')
    .maybeSingle();

  const existingActiveApp = rawActiveApp as unknown as {
    id: string;
    application_number: string;
    status: string;
  } | null;

  if (existingActiveApp) {
    return {
      success: false,
      error: `An active application (${existingActiveApp.application_number}) in category '${investor_category}' already exists for ${applicant.display_name}.`,
    };
  }

  // 4. Evaluate bids
  const bidInputs: BidInput[] = bids.map((b) => ({
    bidNumber: b.bid_number,
    lotCount: b.lot_count,
    price: b.price,
    isCutoff: b.is_cutoff,
  }));

  const bidEval = evaluateBids(
    bidInputs,
    ipo.lot_size,
    ipo.price_band_low,
    ipo.price_band_high,
    investor_category
  );

  if (!bidEval.success || !bidEval.calculatedBids) {
    return { success: false, error: bidEval.error || "Bid calculation failed." };
  }

  // 5. Compute aggregates (SEBI max bid rule)
  const aggEval = computeApplicationAggregates(bidEval.calculatedBids, investor_category);
  if (!aggEval.success || !aggEval.aggregates) {
    return { success: false, error: aggEval.error || "Application aggregate calculation failed." };
  }

  const aggregates = aggEval.aggregates;
  const applicationNumber = generateApplicationNumber();

  // 6. Insert Application record
  const appInsertPayload: IPOApplicationInsert = {
    user_id: userId,
    ipo_id,
    applicant_id,
    application_number: applicationNumber,
    investor_category,
    status: "applied",
    applied_at: new Date().toISOString(),
    total_lots: aggregates.totalLots,
    total_quantity: aggregates.totalQuantity,
    bid_price: aggregates.bidPrice,
    is_cutoff: aggregates.isCutoff,
    application_amount: aggregates.applicationAmount,
    mandate_amount: aggregates.applicationAmount,
    blocked_amount: 0,
    allotment_amount: 0,
    refund_amount: 0,
    currency: "INR",
    notes: notes || null,
  };

  const { data: createdApp, error: appInsertError } = await supabase
    .from("ipo_applications")
    .insert(appInsertPayload as never)
    .select()
    .single();

  if (appInsertError || !createdApp) {
    return { success: false, error: `Failed to create application: ${appInsertError?.message}` };
  }

  const appRecord = createdApp as unknown as IPOApplicationRow;

  // 7. Insert Child Bids
  const bidsInsertPayload: IPOApplicationBidInsert[] = bidEval.calculatedBids.map((b) => ({
    application_id: appRecord.id,
    bid_number: b.bidNumber,
    lot_count: b.lotCount,
    quantity: b.quantity,
    price: b.price,
    is_cutoff: b.isCutoff,
    amount: b.amount,
  }));

  await supabase.from("ipo_application_bids").insert(bidsInsertPayload as never);

  // 8. Insert Mandate Record
  const mandateUpi = upi_id ? maskUPI(upi_id) : applicant.upi_id_masked;
  const mandateInsertPayload: IPOApplicationMandateInsert = {
    application_id: appRecord.id,
    provider: "BHIM_UPI",
    provider_reference: null,
    upi_id_masked: mandateUpi,
    mandate_status: "created",
    requested_amount: aggregates.applicationAmount,
    blocked_amount: 0,
  };

  await supabase.from("ipo_application_mandates").insert(mandateInsertPayload as never);

  // 9. Insert Immutable Event Record
  const eventInsertPayload: IPOApplicationEventInsert = {
    application_id: appRecord.id,
    event_type: "application_created",
    description: `Application ${applicationNumber} submitted for ${ipo.company_name} (${aggregates.totalLots} lots, ₹${aggregates.applicationAmount.toLocaleString("en-IN")}).`,
    actor_id: userId,
    metadata: {
      category: investor_category,
      lots: aggregates.totalLots,
      quantity: aggregates.totalQuantity,
      amount: aggregates.applicationAmount,
      bidsCount: bidEval.calculatedBids.length,
    },
  };

  await supabase.from("ipo_application_events").insert(eventInsertPayload as never);

  // 10. Dispatch Domain Event
  dispatchApplicationDomainEvent({
    eventId: `evt-${Date.now()}`,
    applicationId: appRecord.id,
    eventType: "application_created",
    timestamp: new Date().toISOString(),
    actorId: userId,
    payload: {
      applicationNumber,
      ipoId: ipo_id,
      applicantId: applicant_id,
      category: investor_category,
      amount: aggregates.applicationAmount,
    },
  });

  return { success: true, data: appRecord };
}

/**
 * Retrieves full application detail bundle for the application terminal.
 */
export async function getApplicationDetailBundle(
  applicationId: string,
  userId: string,
  isStaff = false
): Promise<ApplicationDetailBundle | null> {
  const supabase = await createClient();

  let query = supabase
    .from("ipo_applications")
    .select(`
      *,
      applicant_profiles (*),
      ipos (
        id,
        company_name,
        symbol,
        slug,
        company_logo,
        status,
        price_band_low,
        price_band_high,
        lot_size,
        open_date,
        close_date,
        allotment_date,
        refund_date,
        listing_date,
        listing_price
      ),
      ipo_application_bids (*),
      ipo_application_mandates (*),
      ipo_application_allotments (*),
      ipo_application_events (*)
    `)
    .eq("id", applicationId);

  if (!isStaff) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query.single();

  if (error || !data) {
    return null;
  }

  const rawData = data as unknown as {
    ipo_application_bids: IPOApplicationBidRow[] | null;
    ipo_application_events: ApplicationDetailBundle["events"] | null;
    ipo_application_mandates: unknown;
    ipo_application_allotments: unknown;
    applicant_profiles: ApplicationDetailBundle["applicant"];
    ipos: ApplicationDetailBundle["ipo"];
  };

  const bids = (rawData.ipo_application_bids || []) as IPOApplicationBidRow[];
  bids.sort((a, b) => a.bid_number - b.bid_number);

  const events = (rawData.ipo_application_events || []) as ApplicationDetailBundle["events"];
  events.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const mandate = Array.isArray(rawData.ipo_application_mandates)
    ? rawData.ipo_application_mandates[0] || null
    : rawData.ipo_application_mandates || null;

  const allotment = Array.isArray(rawData.ipo_application_allotments)
    ? rawData.ipo_application_allotments[0] || null
    : rawData.ipo_application_allotments || null;

  return {
    application: data as unknown as IPOApplicationRow,
    applicant: rawData.applicant_profiles,
    ipo: rawData.ipos,
    bids,
    mandate: mandate as ApplicationDetailBundle["mandate"],
    allotment: allotment as ApplicationDetailBundle["allotment"],
    events,
  };
}

interface RawApplicationItem {
  id: string;
  application_number: string;
  status: ApplicationStatus;
  applied_at: string;
  investor_category: ApplicationListItem["investor_category"];
  total_lots: number;
  total_quantity: number;
  bid_price: number;
  application_amount: number;
  blocked_amount: number;
  allotment_amount: number;
  refund_amount: number;
  ipos: ApplicationListItem["ipo"];
  applicant_profiles: ApplicationListItem["applicant"];
  ipo_application_mandates: Array<{ mandate_status: string }> | null;
  ipo_application_allotments: Array<{ allotment_status: string }> | null;
}

/**
 * Retrieves a user's applications with filtering options.
 */
export async function getUserApplications(
  userId: string,
  filters?: {
    status?: ApplicationStatus;
    searchQuery?: string;
  }
): Promise<ApplicationListItem[]> {
  const supabase = await createClient();

  let query = supabase
    .from("ipo_applications")
    .select(`
      id,
      application_number,
      status,
      applied_at,
      investor_category,
      total_lots,
      total_quantity,
      bid_price,
      application_amount,
      blocked_amount,
      allotment_amount,
      refund_amount,
      ipos (
        id,
        company_name,
        symbol,
        slug,
        company_logo,
        status,
        lot_size,
        close_date,
        allotment_date
      ),
      applicant_profiles (
        id,
        display_name,
        relationship,
        pan_masked
      ),
      ipo_application_mandates (
        mandate_status
      ),
      ipo_application_allotments (
        allotment_status
      )
    `)
    .eq("user_id", userId)
    .order("applied_at", { ascending: false });

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query;

  if (error || !data) {
    return [];
  }

  const rawDataList = data as unknown as RawApplicationItem[];
  let items = rawDataList.map((d) => {
    const rawMandates = d.ipo_application_mandates;
    const rawAllotment = d.ipo_application_allotments;

    return {
      id: d.id,
      application_number: d.application_number,
      status: d.status,
      applied_at: d.applied_at,
      investor_category: d.investor_category,
      total_lots: d.total_lots,
      total_quantity: d.total_quantity,
      bid_price: d.bid_price,
      application_amount: d.application_amount,
      blocked_amount: d.blocked_amount,
      allotment_amount: d.allotment_amount,
      refund_amount: d.refund_amount,
      ipo: d.ipos,
      applicant: d.applicant_profiles,
      mandate_status: rawMandates && rawMandates.length > 0 ? (rawMandates[0].mandate_status as never) : undefined,
      allotment_status: rawAllotment && rawAllotment.length > 0 ? (rawAllotment[0].allotment_status as never) : undefined,
    };
  });

  if (filters?.searchQuery) {
    const q = filters.searchQuery.toLowerCase();
    items = items.filter(
      (item) =>
        item.application_number.toLowerCase().includes(q) ||
        item.ipo?.company_name.toLowerCase().includes(q) ||
        item.applicant?.display_name.toLowerCase().includes(q)
    );
  }

  return items;
}

/**
 * Transitions an application's lifecycle status with validation and event recording.
 */
export async function transitionApplicationStatus(params: {
  applicationId: string;
  nextStatus: ApplicationStatus;
  actorId?: string | null;
  description?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ success: boolean; error?: string }> {
  const { applicationId, nextStatus, actorId, description, metadata } = params;
  const supabase = await createClient();

  const { data: rawCurrentApp, error: fetchErr } = await supabase
    .from("ipo_applications")
    .select("id, status, application_number")
    .eq("id", applicationId)
    .single();

  const currentApp = rawCurrentApp as unknown as {
    id: string;
    status: string;
    application_number: string;
  } | null;

  if (fetchErr || !currentApp) {
    return { success: false, error: "Application not found." };
  }

  const currentStatus = currentApp.status as ApplicationStatus;
  if (!isValidApplicationTransition(currentStatus, nextStatus)) {
    return {
      success: false,
      error: `Invalid transition from '${currentStatus}' to '${nextStatus}'.`,
    };
  }

  const { error: updateErr } = await supabase
    .from("ipo_applications")
    .update({
      status: nextStatus,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", applicationId);

  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  // Record audit event
  const desc = description || `Status updated from ${currentStatus} to ${nextStatus}.`;
  await supabase.from("ipo_application_events").insert({
    application_id: applicationId,
    event_type: nextStatus as never,
    description: desc,
    actor_id: actorId ?? null,
    metadata: metadata || {},
  } as never);

  // Dispatch domain event
  dispatchApplicationDomainEvent({
    eventId: `evt-${Date.now()}`,
    applicationId,
    eventType: nextStatus as never,
    timestamp: new Date().toISOString(),
    actorId,
    payload: { previousStatus: currentStatus, newStatus: nextStatus, ...metadata },
  });

  return { success: true };
}

/**
 * Cancels an application prior to allotment if lifecycle allows it.
 */
export async function cancelApplication(
  applicationId: string,
  userId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const { data: app, error } = await supabase
    .from("ipo_applications")
    .select("id, user_id, status")
    .eq("id", applicationId)
    .eq("user_id", userId)
    .single();

  if (error || !app) {
    return { success: false, error: "Application not found or unauthorized." };
  }

  return transitionApplicationStatus({
    applicationId,
    nextStatus: "cancelled",
    actorId: userId,
    description: reason ? `Application cancelled by user: ${reason}` : "Application cancelled by user.",
    metadata: { reason },
  });
}

/**
 * Admin: Retrieves all applications across all users.
 */
export async function getApplicationsAdmin(filters?: {
  status?: string;
  ipoId?: string;
}): Promise<ApplicationListItem[]> {
  const supabase = await createClient();

  let query = supabase
    .from("ipo_applications")
    .select(`
      id,
      application_number,
      status,
      applied_at,
      investor_category,
      total_lots,
      total_quantity,
      bid_price,
      application_amount,
      blocked_amount,
      allotment_amount,
      refund_amount,
      ipos (
        id,
        company_name,
        symbol,
        slug,
        company_logo,
        status,
        lot_size,
        close_date,
        allotment_date
      ),
      applicant_profiles (
        id,
        display_name,
        relationship,
        pan_masked
      ),
      ipo_application_mandates (
        mandate_status
      ),
      ipo_application_allotments (
        allotment_status
      )
    `)
    .order("applied_at", { ascending: false });

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }
  if (filters?.ipoId) {
    query = query.eq("ipo_id", filters.ipoId);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  const rawDataList = data as unknown as RawApplicationItem[];
  return rawDataList.map((d) => {
    const rawMandates = d.ipo_application_mandates;
    const rawAllotment = d.ipo_application_allotments;

    return {
      id: d.id,
      application_number: d.application_number,
      status: d.status,
      applied_at: d.applied_at,
      investor_category: d.investor_category,
      total_lots: d.total_lots,
      total_quantity: d.total_quantity,
      bid_price: d.bid_price,
      application_amount: d.application_amount,
      blocked_amount: d.blocked_amount,
      allotment_amount: d.allotment_amount,
      refund_amount: d.refund_amount,
      ipo: d.ipos,
      applicant: d.applicant_profiles,
      mandate_status: rawMandates && rawMandates.length > 0 ? (rawMandates[0].mandate_status as never) : undefined,
      allotment_status: rawAllotment && rawAllotment.length > 0 ? (rawAllotment[0].allotment_status as never) : undefined,
    };
  });
}
