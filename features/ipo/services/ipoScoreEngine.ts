/**
 * Explainable IPO Scoring Engine
 * Versioned, deterministic algorithm evaluating 6 core investment dimensions.
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
} from "../types/ipo.types";

export const SCORE_METHODOLOGY_VERSION = "v1.0-standard";

export const IPO_SCORE_DISCLAIMER =
  "The IPO Score is an objective analytical indicator based on historical financials, peer valuation multiples, market sentiment, and bidding demand. It is not financial advice, an investment recommendation, or a guarantee of returns.";

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
 * Calculates a versioned, explainable IPO Score (0–100).
 * Handles missing data safely without false penalties.
 */
export function calculateIPOScore(input: IPOScoreInput): IPOScoreBreakdown {
  const missingCategories: string[] = [];

  // 1. Financial Health (Max 25 pts)
  let financialHealthScore = 0;
  const financialNotes: string[] = [];
  const validFinancials = input.financials && input.financials.length > 0;

  if (validFinancials && input.financials) {
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
      financialHealthScore += 4; // neutral fallback
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
  } else {
    missingCategories.push("Financial Statements");
    financialHealthScore = 12; // Neutral baseline
    financialNotes.push("Detailed multi-year financials pending official disclosure");
  }

  // 2. Valuation Attractiveness (Max 20 pts)
  let valuationScore = 0;
  const valuationNotes: string[] = [];
  if (input.valuation && input.valuation.pe_ratio_high !== null && input.valuation.pe_ratio_high !== undefined) {
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
  } else {
    missingCategories.push("Valuation Multiples");
    valuationScore = 10;
    valuationNotes.push("P/E and peer comparisons pending RHP price discovery");
  }

  // 3. Issue Structure & Promoters (Max 15 pts)
  let issueScore = 0;
  const issueNotes: string[] = [];
  const freshCr = input.ipo.fresh_issue_cr ?? 0;
  const totalCr = input.ipo.issue_size_cr ?? (freshCr + (input.ipo.ofs_cr ?? 0));

  if (totalCr > 0) {
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
  } else {
    issueScore += 5;
  }

  if (input.promoters && input.promoters.length > 0) {
    const totalPost = input.promoters.reduce((acc, p) => acc + (p.holding_post_pct ?? 0), 0);
    if (totalPost >= 50) {
      issueScore += 6;
      issueNotes.push(`Strong post-issue promoter skin-in-the-game (~${Math.round(totalPost)}%)`);
    } else if (totalPost >= 30) {
      issueScore += 4;
    } else {
      issueScore += 2;
    }
  } else {
    issueScore += 3;
  }

  // 4. Market Sentiment & GMP (Max 15 pts)
  let sentimentScore = 0;
  const sentimentNotes: string[] = [];
  if (input.latestGmp && input.latestGmp.gmp_percentage !== null && input.latestGmp.gmp_percentage !== undefined) {
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
  } else {
    missingCategories.push("Grey Market Sentiment");
    sentimentScore = 8;
    sentimentNotes.push("No active unofficial grey market premium recorded");
  }

  // 5. Subscription Demand (Max 15 pts)
  let demandScore = 0;
  const demandNotes: string[] = [];
  if (input.latestSubscription && input.latestSubscription.overall_x !== null && input.latestSubscription.overall_x !== undefined) {
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
  } else {
    missingCategories.push("Subscription Bidding Data");
    demandScore = 7;
    demandNotes.push("Subscription window has not commenced yet");
  }

  // 6. Industry Tailwinds & Risk Profile (Max 10 pts)
  let riskScore = 8;
  const riskNotes: string[] = [];
  const highRisks = input.risks?.filter((r) => r.severity === "high").length ?? 0;
  if (highRisks >= 3) {
    riskScore = 4;
    riskNotes.push("Multiple critical operational / regulatory risk factors identified");
  } else if (highRisks === 1 || highRisks === 2) {
    riskScore = 7;
    riskNotes.push("Moderate risk profile consistent with sector peers");
  } else {
    riskScore = 9;
    riskNotes.push("Clean risk disclosure profile");
  }

  const overall = Math.min(
    100,
    Math.round(
      financialHealthScore +
        valuationScore +
        issueScore +
        sentimentScore +
        demandScore +
        riskScore
    )
  );

  const isInsufficientData = missingCategories.length >= 3;

  return {
    financialHealth: { score: financialHealthScore, max: 25, notes: financialNotes },
    valuation: { score: valuationScore, max: 20, notes: valuationNotes },
    issueStructure: { score: issueScore, max: 15, notes: issueNotes },
    marketSentiment: { score: sentimentScore, max: 15, notes: sentimentNotes },
    subscriptionDemand: { score: demandScore, max: 15, notes: demandNotes },
    industryRisk: { score: riskScore, max: 10, notes: riskNotes },
    overall,
    maxOverall: 100,
    isInsufficientData,
    missingCategories,
    version: SCORE_METHODOLOGY_VERSION,
  };
}
