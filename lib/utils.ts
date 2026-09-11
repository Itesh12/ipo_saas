import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combines class names safely with tailwind merge and clsx.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a number as Indian Rupee (INR) currency.
 * e.g. 150000 -> ₹1,50,000
 */
export function formatINR(amount: number | null | undefined, options?: { showDecimals?: boolean }): string {
  if (amount === null || amount === undefined || isNaN(amount)) return "—";
  const showDecimals = options?.showDecimals ?? false;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: showDecimals ? 2 : 0,
    minimumFractionDigits: showDecimals ? 2 : 0,
  }).format(amount);
}

/**
 * Formats an issue size or value in Indian Crores (Cr).
 * e.g. 2830.4 -> ₹2,830.40 Cr
 */
export function formatCrores(amountInCr: number | null | undefined, options?: { showZeroDecimals?: boolean }): string {
  if (amountInCr === null || amountInCr === undefined || isNaN(amountInCr)) return "—";
  const hasDecimals = amountInCr % 1 !== 0;
  const showDecimals = options?.showZeroDecimals || hasDecimals;

  const formatted = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: showDecimals ? 2 : 0,
  }).format(amountInCr);
  return `₹${formatted} Cr`;
}

/**
 * Formats a percentage value.
 * e.g. 12.5 -> +12.50% or 12.50%
 */
export function formatPercentage(value: number | null | undefined, options?: { showSign?: boolean }): string {
  if (value === null || value === undefined || isNaN(value)) return "—";
  const formatted = value.toFixed(2);
  if (options?.showSign && value > 0) {
    return `+${formatted}%`;
  }
  return `${formatted}%`;
}

/**
 * Formats a date string into Indian Standard format.
 * e.g. '12 Sep 2026'
 */
export function formatDate(
  dateInput: string | Date | null | undefined,
  options?: { includeTime?: boolean }
): string {
  if (!dateInput) return "TBA";
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return "TBA";

  const formatOptions: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  };

  if (options?.includeTime) {
    formatOptions.hour = "2-digit";
    formatOptions.minute = "2-digit";
    formatOptions.hour12 = true;
  }

  return new Intl.DateTimeFormat("en-IN", formatOptions).format(date);
}

/**
 * Generates an SEO-friendly URL slug from a company or IPO name.
 * e.g. "Bajaj Housing Finance Ltd." -> "bajaj-housing-finance-ltd"
 */
export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/&/g, "-and-")
    .replace(/[\s\W-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
