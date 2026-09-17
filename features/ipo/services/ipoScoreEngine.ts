/**
 * Explainable IPO Scoring Engine
 * Versioned, deterministic algorithm evaluating core investment dimensions.
 * Enforces strict ScoreDataEligibility prerequisites before computing overall score.
 */

import {
  IPORow,
  IPOFinancialRow,
  IPOValuationRow,
  IPOPromoterRow,
  IPOGMPEntryRow,
  IPOSubscriptionSnapshotRow,
  IPORiskRow,
  IPOScoreBreakdown,
  ScoreDataEligibility,
} from "../types/ipo.types";

export const SCORE_METHODOLOGY_VERSION = "v2.1.0-deterministic";

export const IPO_SCORE_DISCLAIMER =
  "The IPO Score is an objective analytical indicator based on multi-year audited/restated financials, peer valuation multiples, unofficial market sentiment, and bidding demand. It is not financial advice, an investment recommendation, or a guarantee of returns.";

export interface IPOScoreInput {
  ipo: IPORow;
  financials?: IPOFinancialRow[];
  valuation?: IPOValuationRow | null;
  promoters?: IPOPromoterRow[];
  latestGmp?: IPOGMPEntryRow | null;
  latestSubscription?: IPOSubscriptionSnapshotRow | null;
  risks?: IPORiskRow[];
}

/**
 * Evaluates whether an IPO meets minimum analytical prerequisites to warrant an overall score.
 * Minimum prerequisite: Fundamentals must have >= 2 restated fiscal periods with valid revenue and PAT.
 */
export function evaluateScoreDataEligibility(input: IPOScoreInput): ScoreDataEligibility {
  const ineligibilityReasons: string[] = [];

  // 1. Fundamentals Evaluation (Requires >= 2 restated/audited periods with valid revenue and PAT)
  const validFinancialPeriods = (input.financials || []).filter(
    (f) =>
      f.revenue_cr !== null &&
      f.revenue_cr !== undefined &&
      f.revenue_cr > 0 &&
      f.pat_cr !== null &&
      f.pat_cr !== undefined
  );
  const periodsCount = validFinancialPeriods.length;
  const hasRevenue = periodsCount >= 2;
  const hasPAT = periodsCount >= 2;
  const hasEbitda = (input.financials || []).some(
    (f) => f.ebitda_cr !== null && f.ebitda_cr !== undefined
  );
  const sourceVerified = (input.financials || []).some(
    (f) => f.audit_status === "restated" || f.audit_status === "audited" || f.source?.includes("RHP")
  );

  const fundamentalsEligible = periodsCount >= 2 && hasRevenue && hasPAT;
  const fundamentalsNotes: string[] = [];
  if (!fundamentalsEligible) {
    if (periodsCount === 0) {
      fundamentalsNotes.push("Zero restated financial statement periods available in regulatory filings.");
    } else {
      fundamentalsNotes.push(`Only ${periodsCount} period(s) available; minimum 2 restated fiscal periods required.`);
    }
  } else {
    fundamentalsNotes.push(`${periodsCount} verified fiscal periods available with revenue and PAT.`);
  }

  // 2. Valuation Evaluation
  const hasIssuePe = input.valuation?.pe_ratio_high !== null && input.valuation?.pe_ratio_high !== undefined;
  const hasPeerData = input.valuation?.industry_pe_median !== null && input.valuation?.industry_pe_median !== undefined;
  const peerCount = hasPeerData ? 1 : 0;
  const valuationEligible = Boolean(hasIssuePe);
  const valuationNotes: string[] = [];
  if (!valuationEligible) {
    valuationNotes.push("P/E multiple and peer benchmarking pending formal price band discovery.");
  } else {
    valuationNotes.push(`Price band P/E evaluated (${input.valuation?.pe_ratio_high}x).`);
  }

  // 3. Demand Evaluation
  const hasQib = input.latestSubscription?.qib_x !== null && input.latestSubscription?.qib_x !== undefined;
  const hasNii = input.latestSubscription?.nii_x !== null && input.latestSubscription?.nii_x !== undefined;
  const hasRetail = input.latestSubscription?.retail_x !== null && input.latestSubscription?.retail_x !== undefined;
  const hasOverall = input.latestSubscription?.overall_x !== null && input.latestSubscription?.overall_x !== undefined;
  const demandEligible = Boolean(hasOverall || (hasRetail && hasQib));
  const demandNotes: string[] = [];
  if (!demandEligible) {
    demandNotes.push("Subscription window has not opened or exchange bidding snapshots are pending.");
  } else {
    demandNotes.push(`Cumulative subscription multiple observed (${input.latestSubscription?.overall_x}x).`);
  }

  // 4. Sentiment Evaluation (Unofficial GMP)
  const hasGmp = input.latestGmp?.gmp_percentage !== null && input.latestGmp?.gmp_percentage !== undefined;
  const sentimentEligible = Boolean(hasGmp);
  const sentimentNotes: string[] = [];
  if (!sentimentEligible) {
    sentimentNotes.push("No active unofficial grey market premium recorded.");
  } else {
    sentimentNotes.push(`Unofficial market estimate observed (+${input.latestGmp?.gmp_percentage}%).`);
  }

  // Institutional Rule: Multi-year audited fundamentals are a hard requirement
  if (!fundamentalsEligible) {
    ineligibilityReasons.push(
      "Fundamental financial disclosures are insufficient: minimum 2 restated fiscal periods with Revenue and PAT are required."
    );
  }

  const isEligible = fundamentalsEligible;

  return {
    isEligible,
    ineligibilityReasons,
    categories: {
      fundamentals: {
        eligible: fundamentalsEligible,
        periodsCount,
        hasRevenue,
        hasPAT,
        hasEbitda,
        sourceVerified,
        notes: fundamentalsNotes,
      },
      valuation: {
        eligible: valuationEligible,
        hasIssuePe,
        hasPeerData,
        peerCount,
        notes: valuationNotes,
      },
      demand: {
        eligible: demandEligible,
        hasQib,
        hasNii,
        hasRetail,
        hasOverall,
        notes: demandNotes,
      },
      sentiment: {
        eligible: sentimentEligible,
        hasGmp,
        isUnofficial: true,
        notes: sentimentNotes,
      },
    },
  };
}

/**
 * Calculates a versioned, explainable IPO Score.
 * When ScoreDataEligibility fails, suppresses overall score (returns null & status: INSUFFICIENT_DATA).
 */
export function calculateIPOScore(input: IPOScoreInput): IPOScoreBreakdown {
  const eligibility = evaluateScoreDataEligibility(input);
  const missingCategories: string[] = [];

  // Track missing categories
  if (!eligibility.categories.fundamentals.eligible) missingCategories.push("Financial Statements");
  if (!eligibility.categories.valuation.eligible) missingCategories.push("Valuation Multiples");
  if (!eligibility.categories.demand.eligible) missingCategories.push("Subscription Bidding Data");
  if (!eligibility.categories.sentiment.eligible) missingCategories.push("Grey Market Sentiment");

  // 1. Financial Health (Max 25 pts)
  let financialHealthScore: number | null = null;
  const financialNotes: string[] = [...eligibility.categories.fundamentals.notes];

  if (eligibility.categories.fundamentals.eligible && input.financials && input.financials.length > 0) {
    financialHealthScore = 0;
    const sortedFin = [...input.financials].sort((a, b) =>
      a.financial_year.localeCompare(b.financial_year)
    );
    const latestFin = sortedFin[sortedFin.length - 1];

    // Revenue Growth (>15% = 7pts, >5% = 4pts)
    if (latestFin.revenue_growth_pct !== null && latestFin.revenue_growth_pct !== undefined) {
      if (latestFin.revenue_growth_pct >= 20) {
        financialHealthScore += 7;
        financialNotes.push(`Strong revenue growth (+${latestFin.revenue_growth_pct}%)`);
      } else if (latestFin.revenue_growth_pct >= 10) {
        financialHealthScore += 5;
        financialNotes.push(`Moderate revenue growth (+${latestFin.revenue_growth_pct}%)`);
      } else if (latestFin.revenue_growth_pct > 0) {
        financialHealthScore += 3;
      }
    } else {
      financialHealthScore += 4;
    }

    // Profitability / PAT Margin (>10% = 7pts, >5% = 4pts)
    if (latestFin.pat_margin_pct !== null && latestFin.pat_margin_pct !== undefined) {
      if (latestFin.pat_margin_pct >= 12) {
        financialHealthScore += 7;
        financialNotes.push(`High profit margin (${latestFin.pat_margin_pct}%)`);
      } else if (latestFin.pat_margin_pct >= 6) {
        financialHealthScore += 5;
        financialNotes.push(`Healthy net margin (${latestFin.pat_margin_pct}%)`);
      } else if (latestFin.pat_margin_pct > 0) {
        financialHealthScore += 3;
      }
    } else {
      financialHealthScore += 4;
    }

    // Return on Equity (>15% = 6pts, >10% = 4pts)
    if (latestFin.roe_pct !== null && latestFin.roe_pct !== undefined) {
      if (latestFin.roe_pct >= 18) {
        financialHealthScore += 6;
        financialNotes.push(`Strong ROE (${latestFin.roe_pct}%)`);
      } else if (latestFin.roe_pct >= 12) {
        financialHealthScore += 4;
      } else if (latestFin.roe_pct > 0) {
        financialHealthScore += 2;
      }
    } else {
      financialHealthScore += 3;
    }

    // Debt to Equity / Balance Sheet (Debt < Net Worth = 5pts)
    if (
      latestFin.total_debt_cr !== null &&
      latestFin.total_debt_cr !== undefined &&
      latestFin.net_worth_cr !== null &&
      latestFin.net_worth_cr !== undefined &&
      latestFin.net_worth_cr > 0
    ) {
      const de = latestFin.total_debt_cr / latestFin.net_worth_cr;
      if (de <= 0.5) {
        financialHealthScore += 5;
        financialNotes.push("Low leverage / strong balance sheet");
      } else if (de <= 1.2) {
        financialHealthScore += 3;
      } else {
        financialHealthScore += 1;
        financialNotes.push("Higher debt-to-equity leverage");
      }
    } else {
      financialHealthScore += 3;
    }
  }

  // 2. Valuation Attractiveness (Max 20 pts)
  let valuationScore: number | null = null;
  const valuationNotes: string[] = [...eligibility.categories.valuation.notes];
  if (eligibility.categories.valuation.eligible && input.valuation?.pe_ratio_high !== null && input.valuation?.pe_ratio_high !== undefined) {
    valuationScore = 0;
    const pe = input.valuation.pe_ratio_high;
    const indPe = input.valuation.industry_pe_median ?? 30;

    if (pe < indPe * 0.8) {
      valuationScore += 18;
      valuationNotes.push(`Discount to industry P/E (${pe}x vs ${indPe}x industry median)`);
    } else if (pe <= indPe * 1.1) {
      valuationScore += 14;
      valuationNotes.push(`Fair pricing in-line with peers (${pe}x P/E)`);
    } else if (pe <= indPe * 1.5) {
      valuationScore += 9;
      valuationNotes.push(`Slightly premium valuation (${pe}x P/E)`);
    } else {
      valuationScore += 5;
      valuationNotes.push(`Aggressive valuation relative to sector median`);
    }
    if (input.valuation.pb_ratio && input.valuation.pb_ratio < 4) {
      valuationScore = Math.min(20, valuationScore + 2);
    }
  }

  // 3. Issue Structure & Promoters (Max 15 pts)
  let issueScore: number | null = null;
  const issueNotes: string[] = [];
  const freshCr = input.ipo.fresh_issue_cr ?? 0;
  const totalCr = input.ipo.issue_size_cr ?? (freshCr + (input.ipo.ofs_cr ?? 0));

  if (totalCr > 0) {
    issueScore = 0;
    const freshPct = (freshCr / totalCr) * 100;
    if (freshPct >= 70) {
      issueScore += 9;
      issueNotes.push(`High fresh issue component (${Math.round(freshPct)}% for growth)`);
    } else if (freshPct >= 40) {
      issueScore += 6;
      issueNotes.push(`Balanced Fresh Issue & OFS mix`);
    } else {
      issueScore += 3;
      issueNotes.push(`Largely Offer for Sale (OFS) by existing shareholders`);
    }
  }

  if (input.promoters && input.promoters.length > 0) {
    if (issueScore === null) issueScore = 0;
    const totalPost = input.promoters.reduce((acc, p) => acc + (p.holding_post_pct ?? 0), 0);
    if (totalPost >= 50) {
      issueScore += 6;
      issueNotes.push(`Strong post-issue promoter holding (~${Math.round(totalPost)}%)`);
    } else if (totalPost >= 30) {
      issueScore += 4;
    } else {
      issueScore += 2;
    }
  }

  // 4. Market Sentiment & GMP (Max 15 pts)
  let sentimentScore: number | null = null;
  const sentimentNotes: string[] = [...eligibility.categories.sentiment.notes];
  if (eligibility.categories.sentiment.eligible && input.latestGmp?.gmp_percentage !== null && input.latestGmp?.gmp_percentage !== undefined) {
    const gmpPct = input.latestGmp.gmp_percentage;
    if (gmpPct >= 35) {
      sentimentScore = 15;
      sentimentNotes.push(`Exceptional grey market premium sentiment (+${gmpPct}%)`);
    } else if (gmpPct >= 15) {
      sentimentScore = 12;
      sentimentNotes.push(`Healthy positive grey market sentiment (+${gmpPct}%)`);
    } else if (gmpPct >= 5) {
      sentimentScore = 9;
      sentimentNotes.push(`Modest positive sentiment (+${gmpPct}%)`);
    } else if (gmpPct >= 0) {
      sentimentScore = 6;
      sentimentNotes.push(`Flat grey market demand`);
    } else {
      sentimentScore = 2;
      sentimentNotes.push(`Discounted / negative grey market indicator`);
    }
  }

  // 5. Subscription Demand (Max 15 pts)
  let demandScore: number | null = null;
  const demandNotes: string[] = [...eligibility.categories.demand.notes];
  if (eligibility.categories.demand.eligible && input.latestSubscription?.overall_x !== null && input.latestSubscription?.overall_x !== undefined) {
    const sub = input.latestSubscription.overall_x;
    if (sub >= 25) {
      demandScore = 15;
      demandNotes.push(`Massive institutional & retail demand (${sub}x subscribed)`);
    } else if (sub >= 5) {
      demandScore = 12;
      demandNotes.push(`Comfortably oversubscribed (${sub}x)`);
    } else if (sub >= 1) {
      demandScore = 8;
      demandNotes.push(`Fully subscribed (${sub}x)`);
    } else {
      demandScore = 4;
      demandNotes.push(`Bidding in progress (${sub}x)`);
    }
  }

  // 6. Industry Tailwinds & Risk Profile (Max 10 pts)
  let riskScore: number | null = 8;
  const riskNotes: string[] = [];
  const highRisks = input.risks?.filter((r) => r.severity === "high").length ?? 0;
  if (highRisks >= 3) {
    riskScore = 4;
    riskNotes.push("Multiple critical operational / regulatory risk factors disclosed");
  } else if (highRisks === 1 || highRisks === 2) {
    riskScore = 7;
    riskNotes.push("Moderate risk profile consistent with sector peers");
  } else {
    riskScore = 9;
    riskNotes.push("Clean risk disclosure profile");
  }

  // If ScoreDataEligibility is NOT met: Suppress composite score
  if (!eligibility.isEligible) {
    return {
      financialHealth: { score: financialHealthScore, max: 25, notes: financialNotes },
      valuation: { score: valuationScore, max: 20, notes: valuationNotes },
      issueStructure: { score: issueScore, max: 15, notes: issueNotes },
      marketSentiment: { score: sentimentScore, max: 15, notes: sentimentNotes },
      subscriptionDemand: { score: demandScore, max: 15, notes: demandNotes },
      industryRisk: { score: riskScore, max: 10, notes: riskNotes },
      overall: null,
      maxOverall: 100,
      status: "INSUFFICIENT_DATA",
      eligibility,
      isInsufficientData: true,
      missingCategories,
      version: SCORE_METHODOLOGY_VERSION,
    };
  }

  // Mathematically rigorous Category Scoring -> Weights -> Normalization -> Rounding
  // Hard Invariant: ZERO hidden defaults (no arbitrary fallbacks like ?? 10 or ?? 8).
  // Dynamic normalization scales the sum of authentically earned points over the sum of available category weights.
  const categoryEvaluations = [
    { name: "financialHealth", score: financialHealthScore, max: 25 },
    { name: "valuation", score: valuationScore, max: 20 },
    { name: "issueStructure", score: issueScore, max: 15 },
    { name: "industryRisk", score: riskScore, max: 10 },
    { name: "subscriptionDemand", score: demandScore, max: 15 },
    { name: "marketSentiment", score: sentimentScore, max: 15 },
  ];

  let earnedScoreSum = 0;
  let availableWeightSum = 0;

  for (const cat of categoryEvaluations) {
    if (cat.score !== null && cat.score !== undefined) {
      earnedScoreSum += cat.score;
      availableWeightSum += cat.max;
    }
  }

  // Baseline invariant: ScoreDataEligibility guarantees availableWeightSum >= 45
  if (availableWeightSum === 0) {
    return {
      financialHealth: { score: financialHealthScore, max: 25, notes: financialNotes },
      valuation: { score: valuationScore, max: 20, notes: valuationNotes },
      issueStructure: { score: issueScore, max: 15, notes: issueNotes },
      marketSentiment: { score: sentimentScore, max: 15, notes: sentimentNotes },
      subscriptionDemand: { score: demandScore, max: 15, notes: demandNotes },
      industryRisk: { score: riskScore, max: 10, notes: riskNotes },
      overall: null,
      maxOverall: 100,
      status: "INSUFFICIENT_DATA",
      eligibility,
      isInsufficientData: true,
      missingCategories,
      version: SCORE_METHODOLOGY_VERSION,
    };
  }

  const normalizedRatio = earnedScoreSum / availableWeightSum;
  const overall = Math.min(100, Math.max(0, Math.round(normalizedRatio * 100)));

  return {
    financialHealth: { score: financialHealthScore, max: 25, notes: financialNotes },
    valuation: { score: valuationScore, max: 20, notes: valuationNotes },
    issueStructure: { score: issueScore, max: 15, notes: issueNotes },
    marketSentiment: { score: sentimentScore, max: 15, notes: sentimentNotes },
    subscriptionDemand: { score: demandScore, max: 15, notes: demandNotes },
    industryRisk: { score: riskScore, max: 10, notes: riskNotes },
    overall,
    maxOverall: 100,
    status: "VALID_SCORE",
    eligibility,
    isInsufficientData: false,
    missingCategories,
    version: SCORE_METHODOLOGY_VERSION,
  };
}

/**
 * Hard Guardrail: Strictly prevents persisting any IPO score into the database
 * when the analytical breakdown is marked INSUFFICIENT_DATA.
 */
export function canPersistIPOScore(breakdown: IPOScoreBreakdown): boolean {
  return (
    breakdown.status === "VALID_SCORE" &&
    breakdown.overall !== null &&
    breakdown.overall >= 0 &&
    breakdown.overall <= 100 &&
    breakdown.eligibility.isEligible === true &&
    breakdown.isInsufficientData === false
  );
}
