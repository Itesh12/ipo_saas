/**
 * Grey Market Premium (GMP) Engine
 * Unofficial market sentiment calculation & listing price estimates.
 */

export interface GMPEstimateResult {
  gmpValue: number | null;
  gmpPercentage: number | null;
  estimatedListingPrice: number | null;
  estimatedListingGainPct: number | null;
  hasValidEstimate: boolean;
}

/**
 * Calculates estimated listing price and percentage gain from GMP.
 * Formula:
 * - Estimated Listing Price = Cutoff Price + GMP
 * - Estimated Gain % = (GMP / Cutoff Price) * 100
 */
export function calculateGMPEstimate(
  gmpValue?: number | null,
  cutoffPrice?: number | null
): GMPEstimateResult {
  if (
    gmpValue === null ||
    gmpValue === undefined ||
    cutoffPrice === null ||
    cutoffPrice === undefined ||
    cutoffPrice <= 0
  ) {
    return {
      gmpValue: gmpValue ?? null,
      gmpPercentage: null,
      estimatedListingPrice: null,
      estimatedListingGainPct: null,
      hasValidEstimate: false,
    };
  }

  const estimatedListingPrice = Math.round((cutoffPrice + gmpValue) * 100) / 100;
  const gainPct = Math.round(((gmpValue / cutoffPrice) * 100) * 100) / 100;

  return {
    gmpValue,
    gmpPercentage: gainPct,
    estimatedListingPrice,
    estimatedListingGainPct: gainPct,
    hasValidEstimate: true,
  };
}

export const GMP_DISCLAIMER_TEXT =
  "Grey Market Premium (GMP) is an unofficial, unregulated market sentiment indicator based on non-exchange trades. It does not represent an official NSE/BSE quote and does not guarantee listing price or trading returns.";
