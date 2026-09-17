/**
 * Lot Size & Application Amount Calculator Engine
 * Authoritative mathematical engine for Indian IPO book-building applications.
 *
 * Core Invariants:
 * 1. Server Authority: All calculations derive from canonical IPO terms (lotSize, priceBandLow, priceBandHigh).
 * 2. SEBI Maximum Bid Rule: Application amount is strictly MAX(bid_1.amount, bid_2.amount, bid_3.amount), NOT the sum.
 * 3. Cut-off Rule: Cut-off allowed ONLY for Retail, Employee, Shareholder; price forced to priceBandHigh.
 * 4. Maximum 3 bids per application.
 */

import { InvestorCategory, isCutoffAllowedForCategory } from "@/config/investorCategories";

export interface CanonicalBiddingTerms {
  lotSize: number;
  priceBandLow: number;
  priceBandHigh: number;
  isBookBuilding?: boolean;
}

export interface BidRequestInput {
  bidNumber: number;
  lotCount: number;
  price?: number;
  isCutoff?: boolean;
}

export interface EvaluatedBid {
  bidNumber: number;
  lotCount: number;
  quantity: number;
  price: number;
  isCutoff: boolean;
  amount: number;
}

export interface ApplicationCalculationSummary {
  bids: EvaluatedBid[];
  activeBidNumber: number;
  totalLots: number;
  totalQuantity: number;
  bidPrice: number;
  isCutoff: boolean;
  applicationAmount: number;
  category: InvestorCategory;
  isValid: boolean;
  validationError?: string;
}

export interface CategoryLotBounds {
  category: InvestorCategory;
  minLots: number;
  maxLots: number;
  minQuantity: number;
  maxQuantity: number;
  minAmount: number;
  maxAmount: number;
  cutoffPermitted: boolean;
}

/**
 * Exact 2-decimal money rounding.
 */
export function roundTo2Decimals(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Derives minimum and maximum lot limits for any investor category based on canonical IPO terms.
 */
export function getCategoryLotBounds(
  terms: CanonicalBiddingTerms,
  category: InvestorCategory
): CategoryLotBounds {
  const { lotSize, priceBandLow, priceBandHigh } = terms;
  const safeLotSize = Math.max(1, lotSize);
  const safeLow = Math.max(1, priceBandLow);
  const safeHigh = Math.max(safeLow, priceBandHigh);

  const cutoffPermitted = isCutoffAllowedForCategory(category);

  switch (category) {
    case "retail": {
      // Retail: Maximum ₹2,00,000, Minimum 1 lot
      const minLots = 1;
      const maxLots = Math.max(1, Math.floor(200000 / (safeLotSize * safeHigh)));
      return {
        category,
        minLots,
        maxLots,
        minQuantity: minLots * safeLotSize,
        maxQuantity: maxLots * safeLotSize,
        minAmount: roundTo2Decimals(minLots * safeLotSize * safeLow),
        maxAmount: 200000,
        cutoffPermitted,
      };
    }

    case "s_hni": {
      // sNII / sHNI: Strictly > ₹2,00,000 up to ₹10,00,000. Cut-off NOT permitted.
      // Minimum lots: first lot count where (lots * lotSize * priceBandLow) > 200,000
      const minLots = Math.floor(200000 / (safeLotSize * safeHigh)) + 1;
      const maxLots = Math.max(minLots, Math.floor(1000000 / (safeLotSize * safeLow)));
      return {
        category,
        minLots,
        maxLots,
        minQuantity: minLots * safeLotSize,
        maxQuantity: maxLots * safeLotSize,
        minAmount: 200000.01,
        maxAmount: 1000000,
        cutoffPermitted: false,
      };
    }

    case "b_hni": {
      // bNII / bHNI: Strictly > ₹10,00,000. Cut-off NOT permitted.
      const minLots = Math.floor(1000000 / (safeLotSize * safeHigh)) + 1;
      const maxLots = Math.max(minLots, 10000); // Practical upper bound
      return {
        category,
        minLots,
        maxLots,
        minQuantity: minLots * safeLotSize,
        maxQuantity: maxLots * safeLotSize,
        minAmount: 1000000.01,
        maxAmount: Number.MAX_SAFE_INTEGER,
        cutoffPermitted: false,
      };
    }

    case "employee": {
      // Employee: Maximum ₹5,00,000, Minimum 1 lot
      const minLots = 1;
      const maxLots = Math.max(1, Math.floor(500000 / (safeLotSize * safeHigh)));
      return {
        category,
        minLots,
        maxLots,
        minQuantity: minLots * safeLotSize,
        maxQuantity: maxLots * safeLotSize,
        minAmount: roundTo2Decimals(minLots * safeLotSize * safeLow),
        maxAmount: 500000,
        cutoffPermitted,
      };
    }

    case "shareholder": {
      // Shareholder: Maximum ₹2,00,000, Minimum 1 lot
      const minLots = 1;
      const maxLots = Math.max(1, Math.floor(200000 / (safeLotSize * safeHigh)));
      return {
        category,
        minLots,
        maxLots,
        minQuantity: minLots * safeLotSize,
        maxQuantity: maxLots * safeLotSize,
        minAmount: roundTo2Decimals(minLots * safeLotSize * safeLow),
        maxAmount: 200000,
        cutoffPermitted,
      };
    }
  }
}

/**
 * Evaluates individual bids and computes quantities, prices, and amounts.
 * Server recalculates all values and enforces SEBI constraints.
 */
export function calculateAndValidateBids(
  terms: CanonicalBiddingTerms,
  bids: BidRequestInput[],
  category: InvestorCategory
): ApplicationCalculationSummary {
  const { lotSize, priceBandLow, priceBandHigh } = terms;
  const isBookBuilding = terms.isBookBuilding ?? (priceBandLow !== priceBandHigh);

  if (!bids || bids.length === 0) {
    return {
      bids: [],
      activeBidNumber: 0,
      totalLots: 0,
      totalQuantity: 0,
      bidPrice: 0,
      isCutoff: false,
      applicationAmount: 0,
      category,
      isValid: false,
      validationError: "At least one bid must be provided.",
    };
  }

  if (bids.length > 3) {
    return {
      bids: [],
      activeBidNumber: 0,
      totalLots: 0,
      totalQuantity: 0,
      bidPrice: 0,
      isCutoff: false,
      applicationAmount: 0,
      category,
      isValid: false,
      validationError: "A maximum of 3 bids is allowed in book-building.",
    };
  }

  if (!isBookBuilding && bids.length > 1) {
    return {
      bids: [],
      activeBidNumber: 0,
      totalLots: 0,
      totalQuantity: 0,
      bidPrice: 0,
      isCutoff: false,
      applicationAmount: 0,
      category,
      isValid: false,
      validationError: "Fixed-price IPOs support exactly 1 bid at the fixed issue price.",
    };
  }

  const cutoffPermitted = isCutoffAllowedForCategory(category);
  const evaluatedBids: EvaluatedBid[] = [];

  for (const b of bids) {
    if (b.lotCount <= 0) {
      return {
        bids: [],
        activeBidNumber: b.bidNumber,
        totalLots: 0,
        totalQuantity: 0,
        bidPrice: 0,
        isCutoff: false,
        applicationAmount: 0,
        category,
        isValid: false,
        validationError: `Bid #${b.bidNumber}: Lot count must be at least 1.`,
      };
    }

    const isCutoff = Boolean(b.isCutoff);

    // Guard cut-off eligibility
    if (isCutoff && !cutoffPermitted) {
      return {
        bids: [],
        activeBidNumber: b.bidNumber,
        totalLots: 0,
        totalQuantity: 0,
        bidPrice: 0,
        isCutoff: false,
        applicationAmount: 0,
        category,
        isValid: false,
        validationError: `Cut-off price is not permitted for category '${category}'. A discrete price within the price band must be specified.`,
      };
    }

    // Determine effective price
    let effectivePrice: number;
    if (isCutoff) {
      effectivePrice = priceBandHigh;
    } else if (!isBookBuilding) {
      effectivePrice = priceBandHigh; // Fixed price
    } else {
      effectivePrice = b.price !== undefined ? roundTo2Decimals(b.price) : priceBandHigh;
    }

    // Validate price band bounds
    if (effectivePrice < priceBandLow || effectivePrice > priceBandHigh) {
      return {
        bids: [],
        activeBidNumber: b.bidNumber,
        totalLots: 0,
        totalQuantity: 0,
        bidPrice: 0,
        isCutoff: false,
        applicationAmount: 0,
        category,
        isValid: false,
        validationError: `Bid #${b.bidNumber}: Price ₹${effectivePrice} is outside the allowed price band (₹${priceBandLow} - ₹${priceBandHigh}).`,
      };
    }

    const quantity = b.lotCount * lotSize;
    const amount = roundTo2Decimals(quantity * effectivePrice);

    evaluatedBids.push({
      bidNumber: b.bidNumber,
      lotCount: b.lotCount,
      quantity,
      price: effectivePrice,
      isCutoff,
      amount,
    });
  }

  // Find the bid with the HIGHEST amount (SEBI Max-Amount Invariant)
  let maxBid = evaluatedBids[0];
  for (let i = 1; i < evaluatedBids.length; i++) {
    if (evaluatedBids[i].amount > maxBid.amount) {
      maxBid = evaluatedBids[i];
    }
  }

  // Validate the resulting application amount against investor category boundaries
  const bounds = getCategoryLotBounds(terms, category);
  if (category === "retail" && maxBid.amount > 200000) {
    return {
      bids: evaluatedBids,
      activeBidNumber: maxBid.bidNumber,
      totalLots: maxBid.lotCount,
      totalQuantity: maxBid.quantity,
      bidPrice: maxBid.price,
      isCutoff: maxBid.isCutoff,
      applicationAmount: maxBid.amount,
      category,
      isValid: false,
      validationError: `Retail application amount (₹${maxBid.amount.toLocaleString("en-IN")}) exceeds the SEBI regulatory limit of ₹2,00,000.`,
    };
  }

  if (category === "s_hni") {
    if (maxBid.amount <= 200000) {
      return {
        bids: evaluatedBids,
        activeBidNumber: maxBid.bidNumber,
        totalLots: maxBid.lotCount,
        totalQuantity: maxBid.quantity,
        bidPrice: maxBid.price,
        isCutoff: maxBid.isCutoff,
        applicationAmount: maxBid.amount,
        category,
        isValid: false,
        validationError: `Small NII (sHNI) application amount (₹${maxBid.amount.toLocaleString("en-IN")}) must be strictly greater than ₹2,00,000.`,
      };
    }
    if (maxBid.amount > 1000000) {
      return {
        bids: evaluatedBids,
        activeBidNumber: maxBid.bidNumber,
        totalLots: maxBid.lotCount,
        totalQuantity: maxBid.quantity,
        bidPrice: maxBid.price,
        isCutoff: maxBid.isCutoff,
        applicationAmount: maxBid.amount,
        category,
        isValid: false,
        validationError: `Small NII (sHNI) application amount (₹${maxBid.amount.toLocaleString("en-IN")}) cannot exceed ₹10,00,000. For amounts > ₹10,00,000, please select Big NII (bHNI).`,
      };
    }
  }

  if (category === "b_hni" && maxBid.amount <= 1000000) {
    return {
      bids: evaluatedBids,
      activeBidNumber: maxBid.bidNumber,
      totalLots: maxBid.lotCount,
      totalQuantity: maxBid.quantity,
      bidPrice: maxBid.price,
      isCutoff: maxBid.isCutoff,
      applicationAmount: maxBid.amount,
      category,
      isValid: false,
      validationError: `Big NII (bHNI) application amount (₹${maxBid.amount.toLocaleString("en-IN")}) must be strictly greater than ₹10,00,000.`,
    };
  }

  if (category === "employee" && maxBid.amount > 500000) {
    return {
      bids: evaluatedBids,
      activeBidNumber: maxBid.bidNumber,
      totalLots: maxBid.lotCount,
      totalQuantity: maxBid.quantity,
      bidPrice: maxBid.price,
      isCutoff: maxBid.isCutoff,
      applicationAmount: maxBid.amount,
      category,
      isValid: false,
      validationError: `Employee quota application amount (₹${maxBid.amount.toLocaleString("en-IN")}) exceeds the regulatory limit of ₹5,00,000.`,
    };
  }

  if (category === "shareholder" && maxBid.amount > 200000) {
    return {
      bids: evaluatedBids,
      activeBidNumber: maxBid.bidNumber,
      totalLots: maxBid.lotCount,
      totalQuantity: maxBid.quantity,
      bidPrice: maxBid.price,
      isCutoff: maxBid.isCutoff,
      applicationAmount: maxBid.amount,
      category,
      isValid: false,
      validationError: `Shareholder quota application amount (₹${maxBid.amount.toLocaleString("en-IN")}) exceeds the regulatory limit of ₹2,00,000.`,
    };
  }

  return {
    bids: evaluatedBids,
    activeBidNumber: maxBid.bidNumber,
    totalLots: maxBid.lotCount,
    totalQuantity: maxBid.quantity,
    bidPrice: maxBid.price,
    isCutoff: maxBid.isCutoff,
    applicationAmount: maxBid.amount,
    category,
    isValid: true,
  };
}
