/**
 * Investor Category Rules Configuration & Versioning
 * Version: v1.0-sebi
 *
 * Implements SEBI book-building bidding parameters and investor category thresholds.
 * Thresholds are versioned and configurable to permit regulatory updates without rewriting code.
 */

export type InvestorCategory =
  | "retail"
  | "s_hni"
  | "b_hni"
  | "employee"
  | "shareholder";

export interface CategoryRule {
  key: InvestorCategory;
  displayName: string;
  shortName: string;
  description: string;
  minAmount: number;
  maxAmount: number | null; // null represents uncapped (e.g. bHNI)
  allowCutoff: boolean;
  minLotsMultiplier?: number;
}

export interface RegulatoryRuleSet {
  version: string;
  lastUpdated: string;
  categories: Record<InvestorCategory, CategoryRule>;
}

export const CURRENT_REGULATORY_RULES: RegulatoryRuleSet = {
  version: "v1.0-sebi",
  lastUpdated: "2026-09-10",
  categories: {
    retail: {
      key: "retail",
      displayName: "Retail Individual Investor (RII)",
      shortName: "Retail",
      description: "Resident Indian individuals, NRIs, and HUFs applying up to ₹2,00,000.",
      minAmount: 0,
      maxAmount: 200000,
      allowCutoff: true,
    },
    s_hni: {
      key: "s_hni",
      displayName: "Small Non-Institutional Investor (sHNI / NII)",
      shortName: "sHNI",
      description: "Non-institutional bidders applying between ₹2,00,000 and ₹10,00,000.",
      minAmount: 200000.01,
      maxAmount: 1000000,
      allowCutoff: false, // SEBI mandate: HNIs cannot bid at cut-off price
    },
    b_hni: {
      key: "b_hni",
      displayName: "Big Non-Institutional Investor (bHNI / NII)",
      shortName: "bHNI",
      description: "Non-institutional bidders and corporate entities applying above ₹10,00,000.",
      minAmount: 1000000.01,
      maxAmount: null, // Uncapped
      allowCutoff: false, // SEBI mandate: HNIs cannot bid at cut-off price
    },
    employee: {
      key: "employee",
      displayName: "Eligible Employee Quota",
      shortName: "Employee",
      description: "Confirmed permanent employees applying under reserved employee quota (up to ₹5,00,000).",
      minAmount: 0,
      maxAmount: 500000,
      allowCutoff: true,
    },
    shareholder: {
      key: "shareholder",
      displayName: "Eligible Shareholder Quota",
      shortName: "Shareholder",
      description: "Existing equity shareholders of the promoter/parent group (up to ₹2,00,000).",
      minAmount: 0,
      maxAmount: 200000,
      allowCutoff: true,
    },
  },
};

/**
 * Validates whether an application amount matches the rules of the selected category.
 */
export function validateCategoryAmount(
  category: InvestorCategory,
  amount: number,
  ruleSet: RegulatoryRuleSet = CURRENT_REGULATORY_RULES
): { isValid: boolean; error?: string } {
  const rule = ruleSet.categories[category];
  if (!rule) {
    return { isValid: false, error: `Unrecognized investor category: ${category}` };
  }

  if (amount < rule.minAmount) {
    return {
      isValid: false,
      error: `Minimum amount for ${rule.shortName} is ₹${rule.minAmount.toLocaleString("en-IN")}. Current bid amount is ₹${amount.toLocaleString("en-IN")}.`,
    };
  }

  if (rule.maxAmount !== null && amount > rule.maxAmount) {
    return {
      isValid: false,
      error: `Maximum amount for ${rule.shortName} is ₹${rule.maxAmount.toLocaleString("en-IN")}. Current bid amount is ₹${amount.toLocaleString("en-IN")}.`,
    };
  }

  return { isValid: true };
}

/**
 * Validates whether cut-off price is permitted for the given category.
 */
export function isCutoffAllowedForCategory(
  category: InvestorCategory,
  ruleSet: RegulatoryRuleSet = CURRENT_REGULATORY_RULES
): boolean {
  return ruleSet.categories[category]?.allowCutoff ?? false;
}
