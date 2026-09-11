/**
 * Zod Validation Schemas for Phase 5 Finance Operations
 */

import { z } from "zod";

export const declareOpeningBalanceSchema = z.object({
  amount: z
    .number()
    .positive("Starting capital must be greater than zero.")
    .max(1000000000, "Amount exceeds maximum permitted book balance."),
  asOfDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}/, "Effective date must be in YYYY-MM-DD format.")
    .optional(),
  accountCode: z.string().max(20).default("1010").optional(),
  bankName: z.string().max(80).optional(),
  notes: z.string().max(250).optional(),
});

export type DeclareOpeningBalanceFormData = z.infer<typeof declareOpeningBalanceSchema>;

export const capitalDepositSchema = z.object({
  amount: z
    .number()
    .positive("Deposit amount must be positive.")
    .max(1000000000, "Deposit amount exceeds limit."),
  depositDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}/, "Deposit date must be in YYYY-MM-DD format.")
    .optional(),
  source: z.string().max(50).default("bank_transfer").optional(),
  referenceNumber: z.string().max(100).optional(),
  notes: z.string().max(250).optional(),
});

export type CapitalDepositFormData = z.infer<typeof capitalDepositSchema>;

export const capitalWithdrawalSchema = z.object({
  amount: z
    .number()
    .positive("Withdrawal amount must be positive.")
    .max(1000000000, "Amount exceeds limit."),
  withdrawalDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}/, "Withdrawal date must be in YYYY-MM-DD format.")
    .optional(),
  destination: z.string().max(80).default("savings_account").optional(),
  notes: z.string().max(250).optional(),
});

export type CapitalWithdrawalFormData = z.infer<typeof capitalWithdrawalSchema>;

export const journalReversalSchema = z.object({
  originalEntryId: z.string().uuid("Invalid journal ID format."),
  reason: z
    .string()
    .trim()
    .min(5, "A clear reason for reversal is required.")
    .max(300, "Reason too long."),
});

export type JournalReversalFormData = z.infer<typeof journalReversalSchema>;

export const securityPriceSchema = z.object({
  securityId: z.string().uuid("Invalid security ID."),
  price: z.number().positive("Market price must be positive."),
  dayOpen: z.number().positive().optional().nullable(),
  dayHigh: z.number().positive().optional().nullable(),
  dayLow: z.number().positive().optional().nullable(),
  previousClose: z.number().positive().optional().nullable(),
  source: z.string().min(2).max(50).default("manual_admin").optional(),
  priceDate: z.string().optional(),
});

export type SecurityPriceFormData = z.infer<typeof securityPriceSchema>;
