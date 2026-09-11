/**
 * Financial Calculation Utilities for IPO Research
 * Strict numeric handling without silent zeroing of missing data.
 */

/**
 * Calculates Year-over-Year (YoY) growth percentage.
 * Formula: ((current - previous) / abs(previous)) * 100
 */
export function calculateYoYGrowth(
  current?: number | null,
  previous?: number | null
): number | null {
  if (
    current === null ||
    current === undefined ||
    previous === null ||
    previous === undefined ||
    previous === 0
  ) {
    return null;
  }
  const growth = ((current - previous) / Math.abs(previous)) * 100;
  return Math.round(growth * 100) / 100;
}

/**
 * Calculates percentage margin (e.g. EBITDA margin, PAT margin).
 * Formula: (numerator / denominator) * 100
 */
export function calculateMargin(
  numerator?: number | null,
  denominator?: number | null
): number | null {
  if (
    numerator === null ||
    numerator === undefined ||
    denominator === null ||
    denominator === undefined ||
    denominator <= 0
  ) {
    return null;
  }
  const margin = (numerator / denominator) * 100;
  return Math.round(margin * 100) / 100;
}

/**
 * Calculates Compound Annual Growth Rate (CAGR).
 * Formula: ((endValue / startValue) ^ (1 / years) - 1) * 100
 */
export function calculateCAGR(
  endValue?: number | null,
  startValue?: number | null,
  years: number = 3
): number | null {
  if (
    endValue === null ||
    endValue === undefined ||
    startValue === null ||
    startValue === undefined ||
    startValue <= 0 ||
    endValue <= 0 ||
    years <= 0
  ) {
    return null;
  }
  const cagr = (Math.pow(endValue / startValue, 1 / years) - 1) * 100;
  return Math.round(cagr * 100) / 100;
}

/**
 * Calculates Return on Equity (ROE) %.
 * Formula: (PAT / Net Worth) * 100
 */
export function calculateROE(
  pat?: number | null,
  netWorth?: number | null
): number | null {
  return calculateMargin(pat, netWorth);
}

/**
 * Calculates Return on Capital Employed (ROCE) %.
 * Formula: (EBIT / (Total Assets - Current Liabilities or Net Worth + Total Debt)) * 100
 */
export function calculateROCE(
  ebit?: number | null,
  capitalEmployed?: number | null
): number | null {
  return calculateMargin(ebit, capitalEmployed);
}

/**
 * Calculates Debt-to-Equity ratio.
 * Formula: Total Debt / Net Worth
 */
export function calculateDebtToEquity(
  totalDebt?: number | null,
  netWorth?: number | null
): number | null {
  if (
    totalDebt === null ||
    totalDebt === undefined ||
    netWorth === null ||
    netWorth === undefined ||
    netWorth <= 0
  ) {
    return null;
  }
  const ratio = totalDebt / netWorth;
  return Math.round(ratio * 100) / 100;
}
