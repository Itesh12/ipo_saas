/**
 * Application Domain Rules & Financial Calculations
 * Implements Indian IPO book-building rules, lot divisibility, cut-off price eligibility,
 * multi-bid maximum-amount aggregation, and post-allotment financial derivations.
 */

import {
  InvestorCategory,
  validateCategoryAmount,
  isCutoffAllowedForCategory,
  CURRENT_REGULATORY_RULES,
} from "@/config/investorCategories";

export interface BidInput {
  bidNumber: number;
  lotCount: number;
  price: number;
  isCutoff: boolean;
}

export interface CalculatedBid {
  bidNumber: number;
  lotCount: number;
  quantity: number;
  price: number;
  isCutoff: boolean;
  amount: number;
}

export interface ApplicationAggregates {
  totalLots: number;
  totalQuantity: number;
  bidPrice: number;
  isCutoff: boolean;
  applicationAmount: number;
  activeBidNumber: number;
}

export interface AllotmentFinancials {
  sharesApplied: number;
  sharesAllotted: number;
  lotsApplied: number;
  lotsAllotted: number;
  allotmentPrice: number;
  allotmentAmount: number;
  refundAmount: number;
  isFullAllotment: boolean;
  isPartialAllotment: boolean;
  isZeroAllotment: boolean;
}

/**
 * Exact 2-decimal money rounding.
 */
export function roundTo2Decimals(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Validates whether a quantity is an exact multiple of the IPO lot size.
 */
export function validateLotDivisibility(
  quantity: number,
  lotSize: number
): { isValid: boolean; lots: number; error?: string } {
  if (lotSize <= 0) {
    return { isValid: false, lots: 0, error: "Invalid IPO lot size." };
  }
  if (quantity <= 0) {
    return { isValid: false, lots: 0, error: "Quantity must be greater than zero." };
  }
  if (quantity % lotSize !== 0) {
    return {
      isValid: false,
      lots: 0,
      error: `Quantity (${quantity}) must be an exact multiple of IPO lot size (${lotSize}).`,
    };
  }
  return { isValid: true, lots: Math.floor(quantity / lotSize) };
}

/**
 * Evaluates individual bids and computes quantities, prices, and amounts.
 */
export function evaluateBids(
  bids: BidInput[],
  lotSize: number,
  priceBandLow: number,
  priceBandHigh: number,
  category: InvestorCategory
): { success: boolean; calculatedBids?: CalculatedBid[]; error?: string } {
  if (!bids || bids.length === 0) {
    return { success: false, error: "At least one bid must be provided." };
  }
  if (bids.length > 3) {
    return { success: false, error: "A maximum of 3 bids is allowed in book-building." };
  }

  const cutoffPermitted = isCutoffAllowedForCategory(category, CURRENT_REGULATORY_RULES);
  const calculatedBids: CalculatedBid[] = [];

  for (const bid of bids) {
    if (bid.lotCount <= 0) {
      return { success: false, error: `Bid #${bid.bidNumber}: Lots must be at least 1.` };
    }

    const quantity = bid.lotCount * lotSize;

    // Check cut-off eligibility
    if (bid.isCutoff && !cutoffPermitted) {
      return {
        success: false,
        error: `Cut-off price is not permitted for category '${category}'. You must specify a price within the price band.`,
      };
    }

    const effectivePrice = bid.isCutoff ? priceBandHigh : bid.price;

    if (effectivePrice < priceBandLow || effectivePrice > priceBandHigh) {
      return {
        success: false,
        error: `Bid #${bid.bidNumber}: Price ₹${effectivePrice} is outside the allowed price band (₹${priceBandLow} - ₹${priceBandHigh}).`,
      };
    }

    const amount = roundTo2Decimals(quantity * effectivePrice);

    calculatedBids.push({
      bidNumber: bid.bidNumber,
      lotCount: bid.lotCount,
      quantity,
      price: effectivePrice,
      isCutoff: bid.isCutoff,
      amount,
    });
  }

  return { success: true, calculatedBids };
}

/**
 * Computes the parent application aggregates from child bids according to SEBI book-building rules:
 * The application amount is the MAXIMUM bid amount among all entered bids.
 * Total lots and quantity are derived from that highest bid.
 */
export function computeApplicationAggregates(
  calculatedBids: CalculatedBid[],
  category: InvestorCategory
): { success: boolean; aggregates?: ApplicationAggregates; error?: string } {
  if (!calculatedBids || calculatedBids.length === 0) {
    return { success: false, error: "No calculated bids available." };
  }

  // Find the bid with highest amount
  let maxBid = calculatedBids[0];
  for (let i = 1; i < calculatedBids.length; i++) {
    if (calculatedBids[i].amount > maxBid.amount) {
      maxBid = calculatedBids[i];
    }
  }

  // Validate the resulting application amount against investor category rules
  const catValidation = validateCategoryAmount(category, maxBid.amount, CURRENT_REGULATORY_RULES);
  if (!catValidation.isValid) {
    return { success: false, error: catValidation.error };
  }

  return {
    success: true,
    aggregates: {
      totalLots: maxBid.lotCount,
      totalQuantity: maxBid.quantity,
      bidPrice: maxBid.price,
      isCutoff: maxBid.isCutoff,
      applicationAmount: maxBid.amount,
      activeBidNumber: maxBid.bidNumber,
    },
  };
}

/**
 * Calculates allotment financials using the applicable final issue/allotment price.
 * Never assumes bid_price was the allotment price.
 */
export function calculateAllotmentFinancials(params: {
  sharesApplied: number;
  sharesAllotted: number;
  lotSize: number;
  allotmentPrice: number;
  blockedOrApplicationAmount: number;
}): AllotmentFinancials {
  const {
    sharesApplied,
    sharesAllotted,
    lotSize,
    allotmentPrice,
    blockedOrApplicationAmount,
  } = params;

  const lotsApplied = Math.max(0, Math.floor(sharesApplied / (lotSize > 0 ? lotSize : 1)));
  const lotsAllotted = Math.max(0, Math.floor(sharesAllotted / (lotSize > 0 ? lotSize : 1)));

  const allotmentAmount = roundTo2Decimals(sharesAllotted * allotmentPrice);
  const refundAmount = Math.max(0, roundTo2Decimals(blockedOrApplicationAmount - allotmentAmount));

  const isFullAllotment = sharesAllotted > 0 && sharesAllotted === sharesApplied;
  const isPartialAllotment = sharesAllotted > 0 && sharesAllotted < sharesApplied;
  const isZeroAllotment = sharesAllotted === 0;

  return {
    sharesApplied,
    sharesAllotted,
    lotsApplied,
    lotsAllotted,
    allotmentPrice,
    allotmentAmount,
    refundAmount,
    isFullAllotment,
    isPartialAllotment,
    isZeroAllotment,
  };
}
