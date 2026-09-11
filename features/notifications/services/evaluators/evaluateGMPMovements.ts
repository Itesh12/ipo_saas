/**
 * features/notifications/services/evaluators/evaluateGMPMovements.ts
 *
 * Phase 7B: Significant Grey Market Premium (GMP) Movement Evaluator
 * Evaluates changes between consecutive GMP entries for an IPO using verified schema:
 * - gmp_value (NUMERIC(10,2))
 * - gmp_percentage (NUMERIC(8,2))
 * - observed_at (TIMESTAMPTZ)
 *
 * Threshold: |delta_gmp| >= 25 OR |delta_pct| >= 15.0%
 * STRICT REQUIREMENT: Appends mandatory unofficial grey-market disclaimer.
 */

import { MANDATORY_GMP_DISCLAIMER } from '../templateRenderer';

export interface GMPEntryRecord {
  id: string;
  ipoId: string;
  gmpValue: number;
  gmpPercentage: number | null;
  estimatedListingPrice: number | null;
  observedAt: string;
  companyName?: string;
  symbol?: string | null;
  slug?: string;
}

export interface GMPEvaluationResult {
  isSignificant: boolean;
  deltaValue: number;
  deltaPercentage: number;
  eventPayload?: Record<string, unknown>;
  idempotencyKey?: string;
}

export class GMPMovementEvaluator {
  static readonly VALUE_THRESHOLD = 25.0; // ₹25 absolute change
  static readonly PCT_THRESHOLD = 15.0;   // 15% percentage points change

  /**
   * Evaluates if the latest GMP entry constitutes a significant movement
   * relative to the immediately preceding entry.
   */
  static evaluateMovement(
    latest: GMPEntryRecord,
    previous: GMPEntryRecord | null
  ): GMPEvaluationResult {
    if (!previous) {
      return {
        isSignificant: false,
        deltaValue: 0,
        deltaPercentage: 0,
      };
    }

    const deltaValue = Math.round((latest.gmpValue - previous.gmpValue) * 100) / 100;
    const latestPct = latest.gmpPercentage ?? 0;
    const prevPct = previous.gmpPercentage ?? 0;
    const deltaPercentage = Math.round((latestPct - prevPct) * 100) / 100;

    const isSignificant =
      Math.abs(deltaValue) >= this.VALUE_THRESHOLD ||
      Math.abs(deltaPercentage) >= this.PCT_THRESHOLD;

    if (!isSignificant) {
      return {
        isSignificant: false,
        deltaValue,
        deltaPercentage,
      };
    }

    return {
      isSignificant: true,
      deltaValue,
      deltaPercentage,
      idempotencyKey: `gmp:movement:${latest.ipoId}:${latest.id}`,
      eventPayload: {
        ipo_id: latest.ipoId,
        company_name: latest.companyName || 'IPO Candidate',
        symbol: latest.symbol,
        slug: latest.slug,
        current_gmp: latest.gmpValue,
        previous_gmp: previous.gmpValue,
        delta_gmp: deltaValue,
        current_gmp_pct: latest.gmpPercentage,
        previous_gmp_pct: previous.gmpPercentage,
        delta_gmp_pct: deltaPercentage,
        estimated_listing_price: latest.estimatedListingPrice,
        observed_at: latest.observedAt,
        disclaimer: MANDATORY_GMP_DISCLAIMER,
      },
    };
  }
}
