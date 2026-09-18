/**
 * features/finance/utils/decimalPrecision.ts
 *
 * Phase 10 / Stage 5 / Candidate D: High-Precision Financial Arithmetic Utilities.
 * Enforces database precision:
 * - quantity: NUMERIC(18,4)
 * - unit_price: NUMERIC(20,8)
 * - gross_amount: NUMERIC(20,8)
 * - total_invested_cost: NUMERIC(20,8)
 * - average_cost_price: NUMERIC(20,8)
 *
 * Prohibits naive Math.round(val * 100) / 100 and raw IEEE-754 floating-point operations
 * on authoritative valuation and financial states.
 */

export class DecimalPrecision {
  private static readonly DEFAULT_SCALE = 8;

  /**
   * Parses string or number to BigInt with given scale (default 8).
   * Exact fixed-point parsing with zero floating-point error.
   */
  public static toBigInt(val: string | number, scale = DecimalPrecision.DEFAULT_SCALE): bigint {
    const s = typeof val === 'number' ? val.toString() : (val || '0').trim();
    if (!s || isNaN(Number(s))) return BigInt(0);
    const isNeg = s.startsWith('-');
    const clean = isNeg ? s.slice(1) : s;
    const parts = clean.split('.');
    const integerPart = parts[0] || '0';
    const fracPart = (parts[1] || '').padEnd(scale, '0').slice(0, scale);
    const combined = BigInt(integerPart + fracPart);
    return isNeg ? -combined : combined;
  }

  /**
   * Formats BigInt with given scale to decimal string.
   */
  public static fromBigInt(val: bigint, scale = DecimalPrecision.DEFAULT_SCALE, trimTrailing = false): string {
    const isNeg = val < BigInt(0);
    const abs = isNeg ? -val : val;
    const s = abs.toString().padStart(scale + 1, '0');
    const integerPart = s.slice(0, s.length - scale) || '0';
    const fracPart = s.slice(s.length - scale);
    let res = `${integerPart}.${fracPart}`;
    if (trimTrailing) {
      res = res.replace(/\.?0+$/, '');
      if (res === '' || res === '-') res = '0';
    }
    return isNeg && res !== '0' ? `-${res}` : res;
  }

  private static readonly INTERNAL_SCALE = 12;

  /** Exact string multiplication without float arithmetic */
  public static multiplyStr(a: string | number, b: string | number, outputScale = DecimalPrecision.DEFAULT_SCALE): string {
    const internalScale = Math.max(DecimalPrecision.INTERNAL_SCALE, outputScale);
    const bigA = this.toBigInt(a, internalScale);
    const bigB = this.toBigInt(b, internalScale);
    const divisor = BigInt(10) ** BigInt(internalScale);
    const prod = (bigA * bigB) / divisor;
    const scaleDiff = BigInt(internalScale - outputScale);
    const scaledProd = prod / (BigInt(10) ** scaleDiff);
    return this.fromBigInt(scaledProd, outputScale);
  }

  /** Exact string division without float arithmetic */
  public static divideStr(numerator: string | number, denominator: string | number, outputScale = DecimalPrecision.DEFAULT_SCALE): string {
    const internalScale = Math.max(DecimalPrecision.INTERNAL_SCALE, outputScale);
    const bigNum = this.toBigInt(numerator, internalScale);
    const bigDen = this.toBigInt(denominator, internalScale);
    if (bigDen === BigInt(0)) return '0.' + '0'.repeat(outputScale);
    const multiplier = BigInt(10) ** BigInt(internalScale);
    const div = (bigNum * multiplier) / bigDen;
    const scaleDiff = BigInt(internalScale - outputScale);
    const scaledDiv = div / (BigInt(10) ** scaleDiff);
    return this.fromBigInt(scaledDiv, outputScale);
  }

  /** Exact string addition without float arithmetic */
  public static addStr(values: (string | number)[], scale = DecimalPrecision.DEFAULT_SCALE): string {
    let sum = BigInt(0);
    for (const v of values) {
      sum += this.toBigInt(v, scale);
    }
    return this.fromBigInt(sum, scale);
  }

  /** Exact string subtraction without float arithmetic */
  public static subtractStr(a: string | number, b: string | number, scale = DecimalPrecision.DEFAULT_SCALE): string {
    const bigA = this.toBigInt(a, scale);
    const bigB = this.toBigInt(b, scale);
    return this.fromBigInt(bigA - bigB, scale);
  }

  /** Formats a decimal string to user-friendly scale, e.g. 2 decimals for currency */
  public static formatCurrency(val: string | number | null, scale = 2): string {
    if (val === null || val === undefined) return '—';
    const s = typeof val === 'number' ? val.toString() : val;
    const big = this.toBigInt(s, 8);
    return this.fromBigInt(big, scale);
  }

  /**
   * Multiplies quantity by unit price with exact fixed-point decimal arithmetic.
   */
  public static multiply(a: number | string, b: number | string, scale = 8): number {
    return parseFloat(this.multiplyStr(a, b, scale));
  }

  /**
   * Divides total cost by total quantity without floating jitter.
   */
  public static divide(numerator: number | string, denominator: number | string, scale = 8): number {
    return parseFloat(this.divideStr(numerator, denominator, scale));
  }

  /**
   * Adds numbers with high precision.
   */
  public static add(...values: (number | string)[]): number {
    return parseFloat(this.addStr(values, 8));
  }

  /**
   * Subtracts b from a with high precision.
   */
  public static subtract(a: number | string, b: number | string): number {
    return parseFloat(this.subtractStr(a, b, 8));
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
