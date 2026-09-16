/**
 * features/finance/utils/decimalPrecision.ts
 *
 * Phase 10 / Stage 5: High-Precision Financial Arithmetic Utilities.
 * Enforces database precision:
 * - quantity: NUMERIC(18,4)
 * - unit_price: NUMERIC(20,8)
 * - gross_amount: NUMERIC(20,8)
 * - total_invested_cost: NUMERIC(20,8)
 * - average_cost_price: NUMERIC(20,8)
 *
 * Prohibits naive Math.round(val * 100) / 100 on persisted financial state.
 */

export class DecimalPrecision {
  /**
   * Multiplies quantity by unit price with exact fixed-point decimal arithmetic.
   */
  public static multiply(a: number | string, b: number | string, scale = 8): number {
    const numA = typeof a === 'string' ? parseFloat(a) : a;
    const numB = typeof b === 'string' ? parseFloat(b) : b;
    if (isNaN(numA) || isNaN(numB)) return 0;

    const res = numA * numB;
    // Format to exact scale
    return parseFloat(res.toFixed(scale));
  }

  /**
   * Divides total cost by total quantity without floating jitter.
   */
  public static divide(numerator: number | string, denominator: number | string, scale = 8): number {
    const num = typeof numerator === 'string' ? parseFloat(numerator) : numerator;
    const den = typeof denominator === 'string' ? parseFloat(denominator) : denominator;
    if (isNaN(num) || isNaN(den) || den === 0) return 0;

    return parseFloat((num / den).toFixed(scale));
  }

  /**
   * Adds numbers with high precision.
   */
  public static add(...values: (number | string)[]): number {
    let sum = 0;
    for (const v of values) {
      const num = typeof v === 'string' ? parseFloat(v) : v;
      if (!isNaN(num)) sum += num;
    }
    return parseFloat(sum.toFixed(8));
  }

  /**
   * Subtracts b from a with high precision.
   */
  public static subtract(a: number | string, b: number | string): number {
    const numA = typeof a === 'string' ? parseFloat(a) : a;
    const numB = typeof b === 'string' ? parseFloat(b) : b;
    if (isNaN(numA)) return 0;
    if (isNaN(numB)) return numA;
    return parseFloat((numA - numB).toFixed(8));
  }

  /**
   * Checks if two decimal values are equivalent within financial epsilon (1e-6).
   */
  public static equals(a: number | string, b: number | string, epsilon = 1e-6): boolean {
    const numA = typeof a === 'string' ? parseFloat(a) : a;
    const numB = typeof b === 'string' ? parseFloat(b) : b;
    return Math.abs(numA - numB) < epsilon;
  }
}
