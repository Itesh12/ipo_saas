/**
 * Research Validation Rules & Invariant Engine
 *
 * Enforces the strict distinction mandated by the Lead Architect:
 * 1. Hard Domain Invariants: Mathematical and structural rules that MUST hold.
 *    Any violation throws a HardInvariantViolationError and strictly BLOCKS canonical promotion.
 * 2. Quality & Coverage Checks: Informational completeness assessments.
 *    Non-blocking; produces status classifications (COMPLETE, PARTIAL, INSUFFICIENT_DATA, WARNING)
 *    to guide UI state without rejecting valid real regulatory disclosures.
 */

export class HardInvariantViolationError extends Error {
  constructor(public readonly invariantCode: string, message: string) {
    super(`[Hard Invariant Violation: ${invariantCode}] ${message}`);
    this.name = "HardInvariantViolationError";
  }
}

export type CoverageStatus = "COMPLETE" | "PARTIAL" | "INSUFFICIENT_DATA" | "WARNING";

export interface CoverageEvaluation {
  status: CoverageStatus;
  coverageLabel: string;
  completenessPct: number;
  warnings: string[];
  dimensions: {
    financials: { status: CoverageStatus; periodsCount: number; notes: string[] };
    valuation: { status: CoverageStatus; hasPe: boolean; peerCount: number; notes: string[] };
    governance: { status: CoverageStatus; promoterHoldingTotal: number; notes: string[] };
    disclosures: { status: CoverageStatus; risksCount: number; strengthsCount: number; notes: string[] };
  };
}

export interface RawResearchPayload {
  companyName: string;
  priceBandLow?: number | null;
  priceBandHigh?: number | null;
  openDate?: string | null;
  closeDate?: string | null;
  listingDate?: string | null;
  financials?: Array<{
    financialYear: string;
    revenueCr?: number | null;
    ebitdaCr?: number | null;
    patCr?: number | null;
    totalDebtCr?: number | null;
    netWorthCr?: number | null;
  }>;
  valuation?: {
    peRatioHigh?: number | null;
    industryPeMedian?: number | null;
    marketCapCr?: number | null;
  } | null;
  peers?: Array<{
    peerCompanyName: string;
    peRatio?: number | null;
  }>;
  promoters?: Array<{
    promoterName: string;
    holdingPostPct?: number | null;
  }>;
  risks?: Array<{
    title: string;
    severity?: "low" | "medium" | "high";
  }>;
  strengths?: Array<{
    title: string;
  }>;
}

/**
 * 1. Hard Mathematical & Structural Invariants (BLOCKING)
 */
export function validateResearchHardInvariants(payload: RawResearchPayload): void {
  // Invariant 1: Price Band Order
  if (
    payload.priceBandLow !== undefined &&
    payload.priceBandLow !== null &&
    payload.priceBandHigh !== undefined &&
    payload.priceBandHigh !== null
  ) {
    if (payload.priceBandLow > payload.priceBandHigh) {
      throw new HardInvariantViolationError(
        "PRICE_BAND_INVERTED",
        `priceBandLow (${payload.priceBandLow}) cannot exceed priceBandHigh (${payload.priceBandHigh}).`
      );
    }
  }

  // Invariant 2: Chronological Dates
  if (payload.openDate && payload.closeDate) {
    const open = new Date(payload.openDate).getTime();
    const close = new Date(payload.closeDate).getTime();
    if (open > close) {
      throw new HardInvariantViolationError(
        "DATES_OUT_OF_ORDER",
        `openDate (${payload.openDate}) cannot be later than closeDate (${payload.closeDate}).`
      );
    }
  }

  if (payload.closeDate && payload.listingDate) {
    const close = new Date(payload.closeDate).getTime();
    const listing = new Date(payload.listingDate).getTime();
    if (close > listing) {
      throw new HardInvariantViolationError(
        "LISTING_BEFORE_CLOSE",
        `closeDate (${payload.closeDate}) cannot be later than listingDate (${payload.listingDate}).`
      );
    }
  }

  // Invariant 3: Post-Issue Promoter Holdings Bound (Math Invariant: sum <= 100%)
  if (payload.promoters && payload.promoters.length > 0) {
    const totalPost = payload.promoters.reduce(
      (acc, p) => acc + (p.holdingPostPct ?? 0),
      0
    );
    if (totalPost > 100.01) {
      throw new HardInvariantViolationError(
        "PROMOTER_HOLDING_EXCEEDS_100_PCT",
        `Total post-issue promoter shareholding (${totalPost}%) exceeds 100%.`
      );
    }
  }

  // Invariant 4: Financial Year String Format
  if (payload.financials) {
    for (const f of payload.financials) {
      if (!f.financialYear || typeof f.financialYear !== "string" || f.financialYear.trim().length === 0) {
        throw new HardInvariantViolationError(
          "INVALID_FINANCIAL_YEAR",
          "Every financial record must specify a non-empty financialYear identifier."
        );
      }
    }
  }
}

/**
 * 2. Quality & Coverage Assessment (NON-BLOCKING)
 * Assesses depth of data and guides UI state without discarding real disclosures.
 */
export function evaluateResearchCoverage(payload: RawResearchPayload): CoverageEvaluation {
  const warnings: string[] = [];

  // Financials Coverage
  const finCount = payload.financials?.length ?? 0;
  let finStatus: CoverageStatus = "INSUFFICIENT_DATA";
  const finNotes: string[] = [];

  if (finCount >= 3) {
    finStatus = "COMPLETE";
    finNotes.push(`${finCount} restated fiscal periods available.`);
  } else if (finCount >= 2) {
    finStatus = "PARTIAL";
    finNotes.push(`2 restated fiscal periods available (minimum institutional baseline).`);
  } else if (finCount === 1) {
    finStatus = "PARTIAL";
    warnings.push("Financial data contains only 1 period; multi-year YoY growth is unavailable.");
    finNotes.push("1 period available; multi-year comparison limited.");
  } else {
    warnings.push("Zero financial statement periods available.");
    finNotes.push("Awaiting financial statement disclosure.");
  }

  // Valuation Coverage
  const hasPe = Boolean(payload.valuation?.peRatioHigh);
  const peerCount = payload.peers?.length ?? 0;
  let valStatus: CoverageStatus = "INSUFFICIENT_DATA";
  const valNotes: string[] = [];

  if (hasPe && peerCount >= 2) {
    valStatus = "COMPLETE";
    valNotes.push(`P/E discovered with ${peerCount} listed comparable peers.`);
  } else if (hasPe) {
    valStatus = "PARTIAL";
    if (peerCount === 0) {
      warnings.push("No listed comparable peers identified in RHP basis for issue price.");
    }
    valNotes.push(`P/E evaluated with ${peerCount} peers.`);
  } else {
    warnings.push("Valuation multiples pending formal price band discovery.");
    valNotes.push("Awaiting valuation disclosure.");
  }

  // Governance / Promoters
  const totalPromoterHolding = (payload.promoters || []).reduce(
    (acc, p) => acc + (p.holdingPostPct ?? 0),
    0
  );
  let govStatus: CoverageStatus = "INSUFFICIENT_DATA";
  const govNotes: string[] = [];

  if (payload.promoters && payload.promoters.length > 0) {
    govStatus = totalPromoterHolding > 0 ? "COMPLETE" : "PARTIAL";
    govNotes.push(`${payload.promoters.length} promoter entities identified (~${Math.round(totalPromoterHolding)}% holding).`);
  } else {
    warnings.push("Promoter shareholding structure pending prospectus extraction.");
    govNotes.push("Awaiting capital structure disclosures.");
  }

  // Disclosures (Risks & Strengths)
  const risksCount = payload.risks?.length ?? 0;
  const strengthsCount = payload.strengths?.length ?? 0;
  let discStatus: CoverageStatus = "INSUFFICIENT_DATA";
  const discNotes: string[] = [];

  if (risksCount >= 5 && strengthsCount >= 3) {
    discStatus = "COMPLETE";
    discNotes.push(`${strengthsCount} strengths and ${risksCount} categorized risks.`);
  } else if (risksCount > 0 || strengthsCount > 0) {
    discStatus = "PARTIAL";
    if (risksCount < 5) {
      warnings.push(`Fewer than 5 risks categorized (${risksCount} disclosed); non-blocking quality note.`);
    }
    discNotes.push(`${strengthsCount} strengths and ${risksCount} risks categorized.`);
  } else {
    warnings.push("Prospectus risk factor disclosures not yet categorized.");
    discNotes.push("Awaiting risk factor disclosures.");
  }

  // Overall Completeness Calculation
  let completePoints = 0;
  if (finStatus === "COMPLETE") completePoints += 30;
  else if (finStatus === "PARTIAL") completePoints += 15;

  if (valStatus === "COMPLETE") completePoints += 25;
  else if (valStatus === "PARTIAL") completePoints += 15;

  if (govStatus === "COMPLETE") completePoints += 20;
  else if (govStatus === "PARTIAL") completePoints += 10;

  if (discStatus === "COMPLETE") completePoints += 25;
  else if (discStatus === "PARTIAL") completePoints += 12;

  const completenessPct = Math.min(100, completePoints);
  const overallStatus: CoverageStatus =
    completenessPct >= 80 ? "COMPLETE" : completenessPct >= 40 ? "PARTIAL" : "INSUFFICIENT_DATA";

  return {
    status: overallStatus,
    coverageLabel: `Research Coverage: ${overallStatus}`,
    completenessPct,
    warnings,
    dimensions: {
      financials: { status: finStatus, periodsCount: finCount, notes: finNotes },
      valuation: { status: valStatus, hasPe, peerCount, notes: valNotes },
      governance: { status: govStatus, promoterHoldingTotal: totalPromoterHolding, notes: govNotes },
      disclosures: { status: discStatus, risksCount, strengthsCount, notes: discNotes },
    },
  };
}
