/**
 * Zod Validation Schemas for Applications & Applicants
 */

import { z } from "zod";

export const applicantRelationshipEnum = z.enum([
  "self",
  "father",
  "mother",
  "spouse",
  "son",
  "daughter",
  "brother",
  "sister",
  "friend",
  "other",
]);

export const investorCategoryEnum = z.enum([
  "retail",
  "s_hni",
  "b_hni",
  "employee",
  "shareholder",
]);

export const mandateStatusEnum = z.enum([
  "not_required",
  "created",
  "pending",
  "approved",
  "rejected",
  "expired",
  "cancelled",
  "blocked",
  "unblocked",
]);

export const allotmentStatusEnum = z.enum([
  "pending",
  "allotted",
  "partially_allotted",
  "not_allotted",
]);

/**
 * Validates adding or editing an applicant profile.
 */
export const applicantSchema = z.object({
  relationship: applicantRelationshipEnum,
  display_name: z
    .string()
    .min(2, "Name must be at least 2 characters.")
    .max(80, "Name cannot exceed 80 characters."),
  pan: z
    .string()
    .min(5, "PAN or masked PAN required.")
    .max(15, "Invalid PAN length."),
  demat_dp_id: z.string().max(30).optional().nullable(),
  demat_account_no: z.string().max(30).optional().nullable(),
  upi_id: z.string().max(100).optional().nullable(),
  default_category: investorCategoryEnum.default("retail"),
  notes: z.string().max(500).optional().nullable(),
  is_active: z.boolean().default(true),
});

export type ApplicantFormData = z.infer<typeof applicantSchema>;

/**
 * Single bid schema for book-building.
 */
export const bidItemSchema = z.object({
  bid_number: z.number().int().min(1).max(3),
  lot_count: z.number().int().min(1, "Lot count must be at least 1."),
  price: z.number().positive("Price must be positive."),
  is_cutoff: z.boolean().default(false),
});

const uuidPattern = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
export const uuidSchema = z.string().regex(uuidPattern, "Invalid UUID format.");

/**
 * Validates submitting an IPO application.
 */
export const createApplicationSchema = z.object({
  ipo_id: uuidSchema,
  applicant_id: uuidSchema,
  investor_category: investorCategoryEnum,
  bids: z
    .array(bidItemSchema)
    .min(1, "At least one bid is required.")
    .max(3, "Maximum 3 bids allowed."),
  upi_id: z.string().max(100).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export type CreateApplicationFormData = z.infer<typeof createApplicationSchema>;

/**
 * Validates staff recording or updating mandate tracking.
 */
export const updateMandateSchema = z.object({
  application_id: uuidSchema,
  mandate_status: mandateStatusEnum,
  provider: z.string().max(60).default("BHIM_UPI"),
  provider_reference: z.string().max(100).optional().nullable(),
  blocked_amount: z.number().nonnegative().optional(),
  failure_reason: z.string().max(500).optional().nullable(),
});

export type UpdateMandateFormData = z.infer<typeof updateMandateSchema>;

/**
 * Validates staff recording registrar allotment outcome.
 */
export const recordAllotmentSchema = z.object({
  application_id: uuidSchema,
  allotment_status: allotmentStatusEnum,
  shares_allotted: z.number().int().nonnegative(),
  allotment_price: z.number().positive("Allotment price must be positive."),
  basis_of_allotment_ref: z.string().max(100).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export type RecordAllotmentFormData = z.infer<typeof recordAllotmentSchema>;
