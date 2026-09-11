/**
 * Subscription Demand Analytics Engine
 * Period-aware bidding multiples and quota progression tracking.
 */

export interface SubscriptionSummary {
  qib_x: number | null;
  nii_x: number | null;
  retail_x: number | null;
  employee_x: number | null;
  overall_x: number | null;
  day_number: number | null;
  as_of: string | null;
  source: string;
}

/**
 * Formats a subscription multiple for UI display (e.g. 14.50x or '—' if unavailable).
 */
export function formatSubscriptionMultiple(value?: number | null): string {
  if (value === null || value === undefined || isNaN(value)) {
    return "—";
  }
  return `${value.toFixed(2)}x`;
}

/**
 * Computes weighted overall subscription if not directly provided by exchange.
 */
export function calculateWeightedSubscription(
  qib_x?: number | null,
  nii_x?: number | null,
  retail_x?: number | null,
  qibQuotaPct: number = 50,
  niiQuotaPct: number = 15,
  retailQuotaPct: number = 35
): number | null {
  const qib = qib_x ?? 0;
  const nii = nii_x ?? 0;
  const retail = retail_x ?? 0;

  if (qib_x === null && nii_x === null && retail_x === null) {
    return null;
  }

  const weightedTotal =
    (qib * (qibQuotaPct / 100)) +
    (nii * (niiQuotaPct / 100)) +
    (retail * (retailQuotaPct / 100));

  return Math.round(weightedTotal * 100) / 100;
}
