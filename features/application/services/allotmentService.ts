/**
 * Allotment & Refund Service
 * Records registrar allotment outcomes, calculates exact allotment and refund amounts
 * using the explicitly provided allotment price, and orchestrates post-allotment lifecycle.
 */

import { createClient } from "@/lib/supabase/server";
import { calculateAllotmentFinancials } from "./applicationRules";
import { transitionApplicationStatus } from "./applicationService";
import { RecordAllotmentFormData, recordAllotmentSchema } from "../schemas/application.schemas";
import { IPOApplicationAllotmentInsert } from "../types/application.types";

/**
 * Records allotment results for an application.
 */
export async function recordApplicationAllotment(
  formData: RecordAllotmentFormData,
  actorId?: string | null
): Promise<{ success: boolean; error?: string }> {
  const validated = recordAllotmentSchema.safeParse(formData);
  if (!validated.success) {
    return {
      success: false,
      error: validated.error.issues.map((i) => i.message).join(", "),
    };
  }

  const {
    application_id,
    allotment_status,
    shares_allotted,
    allotment_price,
    basis_of_allotment_ref,
    notes,
  } = validated.data;

  const supabase = await createClient();

  // Fetch application details to obtain applied quantity, lot size, and blocked/application amount
  const { data: rawApp, error: appErr } = await supabase
    .from("ipo_applications")
    .select(`
      id,
      total_quantity,
      total_lots,
      application_amount,
      blocked_amount,
      status,
      ipos (lot_size)
    `)
    .eq("id", application_id)
    .single();

  const app = rawApp as unknown as {
    id: string;
    total_quantity: number;
    total_lots: number;
    application_amount: number;
    blocked_amount: number;
    status: string;
    ipos: { lot_size: number } | null;
  } | null;

  if (appErr || !app) {
    return { success: false, error: "Application not found." };
  }

  const lotSize = app.ipos?.lot_size || 1;
  const appliedAmount = app.blocked_amount > 0 ? app.blocked_amount : app.application_amount;

  const financials = calculateAllotmentFinancials({
    sharesApplied: app.total_quantity,
    sharesAllotted: shares_allotted,
    lotSize,
    allotmentPrice: allotment_price,
    blockedOrApplicationAmount: appliedAmount,
  });

  const now = new Date().toISOString();

  // 1. Upsert allotment record
  const allotmentPayload: IPOApplicationAllotmentInsert = {
    application_id,
    allotment_status,
    shares_applied: app.total_quantity,
    shares_allotted,
    lots_applied: app.total_lots,
    lots_allotted: financials.lotsAllotted,
    allotment_price,
    allotment_amount: financials.allotmentAmount,
    refund_amount: financials.refundAmount,
    basis_of_allotment_ref: basis_of_allotment_ref || null,
    processed_at: now,
    notes: notes || null,
  };

  const { error: upsertErr } = await supabase
    .from("ipo_application_allotments")
    .upsert(allotmentPayload as never, { onConflict: "application_id" });

  if (upsertErr) {
    return { success: false, error: upsertErr.message };
  }

  // 2. Synchronize amounts on parent application record
  await supabase
    .from("ipo_applications")
    .update({
      allotment_amount: financials.allotmentAmount,
      refund_amount: financials.refundAmount,
      updated_at: now,
    } as never)
    .eq("id", application_id);

  // 3. Advance lifecycle
  if (allotment_status === "allotted") {
    await transitionApplicationStatus({
      applicationId: application_id,
      nextStatus: "allotted",
      actorId,
      description: `Allotment result: ${shares_allotted} shares allotted @ ₹${allotment_price} (₹${financials.allotmentAmount.toLocaleString("en-IN")}).`,
      metadata: { sharesAllotted: shares_allotted, allotmentAmount: financials.allotmentAmount },
    });

    // If fully allotted with zero refund, it can transition to completed
    if (financials.refundAmount === 0) {
      await transitionApplicationStatus({
        applicationId: application_id,
        nextStatus: "completed",
        actorId,
        description: "Application completed with full share allotment.",
      });
    } else {
      // Partial surplus refund required
      await transitionApplicationStatus({
        applicationId: application_id,
        nextStatus: "refund_pending",
        actorId,
        description: `Surplus funds of ₹${financials.refundAmount.toLocaleString("en-IN")} queued for refund.`,
      });
    }
  } else if (allotment_status === "partially_allotted") {
    await transitionApplicationStatus({
      applicationId: application_id,
      nextStatus: "partially_allotted",
      actorId,
      description: `Partial allotment: ${shares_allotted} of ${app.total_quantity} shares allotted.`,
    });
    await transitionApplicationStatus({
      applicationId: application_id,
      nextStatus: "refund_pending",
      actorId,
      description: `Unallotted funds of ₹${financials.refundAmount.toLocaleString("en-IN")} queued for refund.`,
    });
  } else if (allotment_status === "not_allotted") {
    await transitionApplicationStatus({
      applicationId: application_id,
      nextStatus: "not_allotted",
      actorId,
      description: "Allotment result: No shares allotted.",
    });
    await transitionApplicationStatus({
      applicationId: application_id,
      nextStatus: "refund_pending",
      actorId,
      description: `Full refund of ₹${financials.refundAmount.toLocaleString("en-IN")} queued for unblocking.`,
    });
  }

  return { success: true };
}

/**
 * Marks refund processed and advances to unblocked -> completed.
 */
export async function processRefundAndUnblock(
  applicationId: string,
  actorId?: string | null
): Promise<{ success: boolean; error?: string }> {
  // Step 1: refund_completed
  const res1 = await transitionApplicationStatus({
    applicationId,
    nextStatus: "refund_completed",
    actorId,
    description: "Refund / unblock instructions transmitted to sponsor bank.",
  });
  if (!res1.success) return res1;

  // Step 2: funds_unblocked
  const res2 = await transitionApplicationStatus({
    applicationId,
    nextStatus: "funds_unblocked",
    actorId,
    description: "Bank fund lien unblocked successfully.",
  });
  if (!res2.success) return res2;

  // Step 3: completed (terminal)
  return transitionApplicationStatus({
    applicationId,
    nextStatus: "completed",
    actorId,
    description: "Application lifecycle concluded.",
  });
}
