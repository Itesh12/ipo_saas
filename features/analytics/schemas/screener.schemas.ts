/**
 * features/analytics/schemas/screener.schemas.ts
 *
 * Phase 6: Zod Validation Schemas for Screener & Analytics
 * Enforces strict input validation, null defense, and public screen privacy invariants.
 */

import { z } from 'zod';

export const screenerFilterSchema = z.object({
  status: z.array(z.string()).optional(),
  category: z.array(z.enum(['mainboard', 'sme_bse', 'sme_nse'])).optional(),
  issueType: z.array(z.enum(['book_building', 'fixed_price'])).optional(),
  industry: z.array(z.string()).optional(),
  minInvestmentMax: z.coerce.number().positive().optional(),
  minInvestmentMin: z.coerce.number().nonnegative().optional(),
  issueSizeMinCr: z.coerce.number().nonnegative().optional(),
  issueSizeMaxCr: z.coerce.number().positive().optional(),
  peRatioMax: z.coerce.number().positive().optional(),
  peRatioMin: z.coerce.number().nonnegative().optional(),
  peDiscountMinPct: z.coerce.number().optional(),
  pbRatioMax: z.coerce.number().positive().optional(),
  evEbitdaMax: z.coerce.number().positive().optional(),
  revenueGrowthMinPct: z.coerce.number().optional(),
  patMarginMinPct: z.coerce.number().optional(),
  roeMinPct: z.coerce.number().optional(),
  roceMinPct: z.coerce.number().optional(),
  debtToEquityMax: z.coerce.number().nonnegative().optional(),
  overallScoreMin: z.coerce.number().min(0).max(100).optional(),
  gmpGainMinPct: z.coerce.number().optional(),
  subscriptionMinX: z.coerce.number().nonnegative().optional(),
  retailSubMinX: z.coerce.number().nonnegative().optional(),
  qibSubMinX: z.coerce.number().nonnegative().optional(),
  includeUnpriced: z.boolean().optional().default(false),
  searchQuery: z.string().max(100).optional(),
  sortBy: z.string().max(50).optional().default('overall_score'),
  sortDirection: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export type ScreenerFilterInput = z.infer<typeof screenerFilterSchema>;

/**
 * Saved Screen Mutation Schema
 * Enforces Public Screen Privacy Invariant:
 * Public screens must NEVER contain personal portfolio, applicant, or capital constraints.
 */
export const savedScreenSchema = z.object({
  name: z.string().trim().min(2, 'Name must have at least 2 characters').max(100),
  description: z.string().trim().max(300).optional().nullable(),
  filterConfig: screenerFilterSchema.passthrough(),
  sortBy: z.string().max(50).default('overall_score'),
  sortDirection: z.enum(['asc', 'desc']).default('desc'),
  selectedColumns: z.array(z.string()).default([
    'company_name',
    'price_band',
    'issue_size_cr',
    'pe_ratio_high',
    'overall_score',
    'status',
  ]),
  isPinned: z.boolean().default(false),
  isPublic: z.boolean().default(false),
}).refine(
  (data) => {
    // If public screen, ensure no private or user-specific criteria are embedded
    if (data.isPublic) {
      const config = data.filterConfig as Record<string, unknown>;
      if ('applicantId' in config || 'userPortfolioOnly' in config || 'myAvailableCashOnly' in config) {
        return false;
      }
    }
    return true;
  },
  {
    message: 'Public saved screens cannot contain personal portfolio, applicant, or private capital parameters.',
    path: ['isPublic'],
  }
);

export type SavedScreenInput = z.infer<typeof savedScreenSchema>;

export const investorPreferencesSchema = z.object({
  preferredCategories: z.array(z.enum(['mainboard', 'sme_bse', 'sme_nse'])).default(['mainboard']),
  preferredSectors: z.array(z.string()).default([]),
  maxLotInvestment: z.coerce.number().positive().optional().nullable(),
  minIpoScore: z.coerce.number().min(0).max(100).default(60.0),
});

export type InvestorPreferencesInput = z.infer<typeof investorPreferencesSchema>;

export const compareQuerySchema = z.object({
  slugs: z.array(z.string().trim().min(2)).min(2, 'At least 2 IPOs are required for comparison').max(4, 'Maximum 4 IPOs can be compared simultaneously'),
});

export type CompareQueryInput = z.infer<typeof compareQuerySchema>;
