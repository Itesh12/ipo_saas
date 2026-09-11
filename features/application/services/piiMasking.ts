/**
 * PII Masking Utilities
 * Enforces zero unmasked financial identifier exposure across applications and applicant registries.
 */

/**
 * Masks a standard 10-character Indian Permanent Account Number (PAN).
 * Example: 'ABCDE1234F' -> 'ABCDE****F'
 */
export function maskPAN(pan: string | null | undefined): string {
  if (!pan) return "—";
  const clean = pan.trim().toUpperCase();
  if (clean.includes("*")) {
    return clean; // already masked
  }
  if (clean.length === 10) {
    return `${clean.substring(0, 5)}****${clean.substring(9)}`;
  }
  // Fallback if formatting differs
  if (clean.length > 4) {
    return `${clean.substring(0, 2)}****${clean.substring(clean.length - 2)}`;
  }
  return "****";
}

/**
 * Masks a 16-character Demat BOID or DP ID + Client ID.
 * Example: '1208160012345678' -> '****5678'
 */
export function maskDematAccount(demat: string | null | undefined): string {
  if (!demat) return "—";
  const clean = demat.trim();
  if (clean.includes("*")) {
    return clean; // already masked
  }
  if (clean.length >= 4) {
    return `****${clean.substring(clean.length - 4)}`;
  }
  return "****";
}

/**
 * Masks a UPI handle without exposing the full username.
 * Example: 'rahulsharma@okaxis' -> 'ra***@okaxis'
 */
export function maskUPI(upi: string | null | undefined): string {
  if (!upi) return "—";
  const clean = upi.trim();
  if (clean.includes("***")) {
    return clean; // already masked
  }
  const parts = clean.split("@");
  if (parts.length === 2) {
    const user = parts[0];
    const domain = parts[1];
    const prefix = user.length > 2 ? user.substring(0, 2) : user.substring(0, 1);
    return `${prefix}***@${domain}`;
  }
  if (clean.length > 3) {
    return `${clean.substring(0, 2)}***`;
  }
  return "***";
}
