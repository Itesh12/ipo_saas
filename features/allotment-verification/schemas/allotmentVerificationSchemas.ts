/**
 * features/allotment-verification/schemas/allotmentVerificationSchemas.ts
 *
 * Zod validation schemas enforcing domain invariants for Stage 4 Allotment Verification:
 * 1. Hard invariant: shares_allotted <= shares_applied
 * 2. Hard invariant: record_not_found cannot produce 'not_allotted' (must be 'unknown' / 'UNVERIFIED')
 * 3. Exact allotment outcome semantics
 * 4. PII masking & sanitize guarantees
 */

import { z } from 'zod';

export const registrarVerificationModeSchema = z.enum([
  'automated_api',
  'user_assisted',
  'cas_statement_upload',
  'bank_mandate_evidence',
  'manual_admin_entry',
]);

export const evidenceSourceTypeSchema = z.enum([
  'REGISTRAR_DIRECT',
  'REGISTRAR_USER_ASSISTED',
  'CAS_DOCUMENT',
  'DEPOSITORY_STATEMENT',
  'BANK_NOTIFICATION',
  'USER_SCREENSHOT',
  'USER_ENTERED',
  'ADMIN_ENTERED',
]);

export const verificationEvidenceClassificationSchema = z.enum([
  'REGISTRAR_CONFIRMED',
  'DEPOSITORY_CONFIRMED',
  'BANK_CONFIRMED',
  'USER_PROVIDED',
  'MANUAL_ADMIN',
  'CONFLICTED',
  'UNVERIFIED',
]);

export const verificationAttemptStatusSchema = z.enum([
  'completed',
  'record_not_found',
  'challenge_required',
  'portal_unavailable',
  'parse_error',
  'network_error',
]);

export const verificationResultTypeSchema = z.enum([
  'allotted',
  'partially_allotted',
  'not_allotted',
  'unknown',
]);

export const lookupTypeSchema = z.enum(['pan', 'application_no', 'dp_client_id']);

/**
 * Normalized Result Schema enforcing financial & quantity consistency
 */
export const normalizedAllotmentResultSchema = z
  .object({
    resultType: verificationResultTypeSchema,
    sharesApplied: z.number().int().nonnegative('sharesApplied must be non-negative'),
    sharesAllotted: z.number().int().nonnegative('sharesAllotted must be non-negative'),
    lotsAllotted: z.number().int().nonnegative().optional().default(0),
    allotmentPrice: z.number().positive().optional(),
    reportedRefundAmount: z.number().nonnegative().default(0),
    sourceObservedAt: z.string().datetime({ offset: true }).optional(),
    applicantNameMasked: z.string().max(100).optional(),
    categoryCode: z.string().max(20).optional(),
    depositoryClientIdMasked: z.string().max(50).optional(),
    applicationNumberMasked: z.string().max(50).optional(),
    registrarReference: z.string().max(100).optional(),
  })
  .superRefine((data, ctx) => {
    // 1. shares_allotted <= shares_applied
    if (data.sharesAllotted > data.sharesApplied) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sharesAllotted'],
        message: `sharesAllotted (${data.sharesAllotted}) cannot exceed sharesApplied (${data.sharesApplied})`,
      });
    }

    // 2. Result classification check
    if (data.resultType === 'allotted') {
      if (data.sharesAllotted !== data.sharesApplied || data.sharesApplied === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['resultType'],
          message: 'Full allotment requires sharesAllotted == sharesApplied > 0',
        });
      }
    } else if (data.resultType === 'partially_allotted') {
      if (data.sharesAllotted <= 0 || data.sharesAllotted >= data.sharesApplied) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['resultType'],
          message: 'Partial allotment requires 0 < sharesAllotted < sharesApplied',
        });
      }
    } else if (data.resultType === 'not_allotted') {
      if (data.sharesAllotted !== 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['resultType'],
          message: 'Non-allotment requires sharesAllotted == 0',
        });
      }
    }
  });

/**
 * Verification Attempt Validation Schema
 */
export const verificationAttemptRecordSchema = z
  .object({
    applicationId: z.string().uuid(),
    applicantId: z.string().uuid(),
    ipoId: z.string().uuid(),
    registrarCode: z.string().min(2).max(50),
    registrarBindingId: z.string().uuid().nullable().optional(),
    verificationMode: registrarVerificationModeSchema,
    attemptStatus: verificationAttemptStatusSchema,
    verificationResult: verificationResultTypeSchema,
    lookupType: lookupTypeSchema,
    lookupIdentifierMasked: z.string().min(3).max(60),
    lookupIdentifierHash: z.string().length(64), // SHA-256
    normalizedResult: normalizedAllotmentResultSchema.nullable().optional(),
    rawResponseHash: z.string().length(64),
    rawResponseRetention: z.literal('none'),
    evidenceSourceType: evidenceSourceTypeSchema,
    evidenceClassification: verificationEvidenceClassificationSchema,
    sourceObservedAt: z.string().datetime({ offset: true }).nullable().optional(),
    verifiedAt: z.string().datetime({ offset: true }).nullable().optional(),
    idempotencyKey: z.string().min(8).max(128),
    errorCode: z.string().max(50).nullable().optional(),
    errorMessage: z.string().nullable().optional(),
    durationMs: z.number().int().nonnegative().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    // Hard invariant: record_not_found must NEVER have verification_result = 'not_allotted'
    if (data.attemptStatus === 'record_not_found') {
      if (data.verificationResult !== 'unknown') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['verificationResult'],
          message:
            'When attemptStatus is record_not_found, verificationResult must be unknown (cannot assume not_allotted)',
        });
      }
      if (data.evidenceClassification !== 'UNVERIFIED') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['evidenceClassification'],
          message:
            'When attemptStatus is record_not_found, evidenceClassification must be UNVERIFIED',
        });
      }
    }
  });

/**
 * User-Assisted Verification Input Schema (Mode 2)
 */
export const submitUserAssistedResultSchema = z.object({
  applicationId: z.string().uuid(),
  resultType: z.enum(['allotted', 'partially_allotted', 'not_allotted']),
  sharesAllotted: z.number().int().nonnegative(),
  allotmentPrice: z.number().positive().optional(),
  reportedRefundAmount: z.number().nonnegative().optional().default(0),
  observedAt: z.string().datetime({ offset: true }).optional(),
  registrarReference: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
});

export type SubmitUserAssistedResultInput = z.infer<typeof submitUserAssistedResultSchema>;
export type NormalizedAllotmentResultSchema = z.infer<typeof normalizedAllotmentResultSchema>;
