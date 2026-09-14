/**
 * features/external-integrations/subscription/subscriptionTaxonomy.ts
 *
 * Phase 9 Stage 3C: Unified Investor Taxonomy & Alias Mapping (Revision 2.2).
 *
 * Rules:
 * 1. Unified with Phase 4 investor categories (RETAIL, S_HNI, B_HNI, QIB, EMPLOYEE, SHAREHOLDER).
 * 2. Invariant: ANCHOR is strictly quarantined to pre-issue allocation metadata and
 *    MUST NEVER be mapped as a cumulative bidding participant or included in overall_x.
 */

import {
  CanonicalInvestorCategory,
  CategoryBidMetrics,
  RawExchangeCategoryRow,
} from './subscriptionTypes';

interface CategoryMatchRule {
  category: CanonicalInvestorCategory;
  patterns: RegExp[];
  isAnchor?: boolean;
}

const CATEGORY_RULES: CategoryMatchRule[] = [
  {
    category: 'ANCHOR',
    patterns: [
      /anchor/i,
      /pre[- ]?ipo/i,
    ],
    isAnchor: true,
  },
  {
    category: 'S_HNI',
    patterns: [
      /bids (?:above|from) 2 lakhs? (?:to|upto) 10 lakhs?/i,
      /bids between 2 lakhs? and 10 lakhs?/i,
      /s[- ]?hni/i,
      /snii/i,
      /nii_small/i,
      /nii.*2.*10/i,
    ],
  },
  {
    category: 'B_HNI',
    patterns: [
      /bids above 10 lakhs?/i,
      /b[- ]?hni/i,
      /bnii/i,
      /nii_big/i,
      /nii.*(?:>|above).*10/i,
    ],
  },
  {
    category: 'RETAIL',
    patterns: [
      /retail individual/i,
      /retail/i,
      /rii/i,
      /individual investors/i,
    ],
  },
  {
    category: 'QIB',
    patterns: [
      /qualified institutional/i,
      /qib/i,
      /institutional buyers/i,
      /fii/i,
      /mutual funds/i,
      /financial institutions/i,
    ],
  },
  {
    category: 'EMPLOYEE',
    patterns: [
      /employee/i,
      /emp reservation/i,
      /staff/i,
    ],
  },
  {
    category: 'SHAREHOLDER',
    patterns: [
      /shareholder/i,
      /eligible shareholder/i,
      /parent.*shareholder/i,
    ],
  },
];

export class SubscriptionTaxonomy {
  /**
   * Resolves raw exchange category label to canonical category.
   * Returns null if unrecognized or if it represents an unreserved/miscellaneous header.
   */
  public static resolveCategory(rawLabel: string): CanonicalInvestorCategory | null {
    const cleaned = rawLabel.trim();
    if (!cleaned) return null;

    // Special catch: if generic NII without size distinction, map to B_HNI or general HNI based on context
    for (const rule of CATEGORY_RULES) {
      if (rule.patterns.some((p) => p.test(cleaned))) {
        return rule.category;
      }
    }

    // Fallback for generic NII / Non-Institutional
    if (/non[- ]?institutional/i.test(cleaned) || /\bnii\b/i.test(cleaned)) {
      return 'B_HNI';
    }

    return null;
  }

  /**
   * Checks if a category is Anchor allocation (quarantined from cumulative bidding).
   */
  public static isAnchor(category: CanonicalInvestorCategory | string): boolean {
    return category === 'ANCHOR' || /anchor/i.test(category);
  }

  /**
   * Safely parses numeric value from exchange feed string or number.
   */
  public static parseNumber(val: number | string | undefined | null): number {
    if (val === undefined || val === null) return 0;
    if (typeof val === 'number') {
      return isNaN(val) ? 0 : val;
    }
    const sanitized = val.toString().replace(/,/g, '').trim();
    const parsed = parseFloat(sanitized);
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Calculates times subscribed: shares_bid / shares_offered (rounded to 2 decimals).
   */
  public static computeMultiple(sharesBid: number, sharesOffered: number): number {
    if (sharesOffered <= 0 || sharesBid <= 0) return 0;
    return Math.round((sharesBid / sharesOffered) * 100) / 100;
  }

  /**
   * Parses and normalizes an array of raw category rows into canonical CategoryBidMetrics.
   */
  public static parseCategories(rows: RawExchangeCategoryRow[]): Record<string, CategoryBidMetrics> {
    const categoriesMap: Record<string, CategoryBidMetrics> = {};
    for (const row of rows) {
      const canonicalCategory = this.resolveCategory(row.categoryName);
      if (!canonicalCategory) continue;

      const sharesOffered = this.parseNumber(row.sharesOffered);
      const sharesBid = this.parseNumber(row.sharesBid);
      const bidsCount = this.parseNumber(row.bidsCount);
      const multiple =
        row.subscriptionMultiple !== undefined
          ? this.parseNumber(row.subscriptionMultiple)
          : this.computeMultiple(sharesBid, sharesOffered);
      const amountBidCr = row.amountBidCr ? this.parseNumber(row.amountBidCr) : undefined;

      categoriesMap[canonicalCategory] = {
        category: canonicalCategory,
        shares_offered: sharesOffered,
        shares_bid: sharesBid,
        bids_count: bidsCount,
        subscription_x: multiple,
        amount_bid_cr: amountBidCr,
      };
    }
    return categoriesMap;
  }
}
