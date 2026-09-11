import { IPORow, IPOStatus, IPOTimelineMilestone } from "../types/ipo.types";

/**
 * Calculates the minimum investment required for 1 retail lot.
 * Uses price_band_high * lot_size (or price_band_low if single price).
 */
export function calculateMinimumInvestment(
  priceBandHigh?: number | null,
  lotSize?: number | null,
  priceBandLow?: number | null
): number | null {
  const price = priceBandHigh ?? priceBandLow;
  const lots = lotSize ?? 1;
  if (!price || price <= 0 || !lots || lots <= 0) {
    return null;
  }
  return Math.round(price * lots * 100) / 100;
}

/**
 * Gets the current date string in Indian Standard Time (IST, UTC+5:30).
 * Format: YYYY-MM-DD
 */
export function getTodayIST(): string {
  const now = new Date();
  const istFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return istFormatter.format(now);
}

/**
 * Derives the active business lifecycle status based on IST timeline dates.
 * Preserves explicit manual statuses (e.g. 'withdrawn', 'cancelled') if present.
 */
export function deriveIPOStatus(
  ipo: Pick<IPORow, "open_date" | "close_date" | "allotment_date" | "listing_date" | "status">,
  referenceDateIST: string = getTodayIST()
): IPOStatus {
  // Respect manual override statuses
  if (ipo.status === "withdrawn" || ipo.status === "cancelled") {
    return ipo.status;
  }

  const today = referenceDateIST;
  const { open_date, close_date, allotment_date, listing_date } = ipo;

  if (listing_date && today >= listing_date) {
    return "listed";
  }

  if (allotment_date && listing_date && today > allotment_date && today < listing_date) {
    return "listing_soon";
  }

  if (close_date && today > close_date) {
    return "closed";
  }

  if (open_date && close_date && today >= open_date && today <= close_date) {
    return "open";
  }

  if (open_date && today < open_date) {
    return "upcoming";
  }

  return "announced";
}

/**
 * Calculates number of days remaining until IPO bidding closes.
 * Returns null if close_date is not set or in the past.
 */
export function calculateDaysRemaining(
  closeDate?: string | null,
  referenceDateIST: string = getTodayIST()
): number | null {
  if (!closeDate) return null;
  const close = new Date(closeDate);
  const ref = new Date(referenceDateIST);

  const diffTime = close.getTime() - ref.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays >= 0 ? diffDays : null;
}

export function buildIPOTimeline(
  ipo: Partial<IPORow>,
  referenceDateIST: string = getTodayIST()
): IPOTimelineMilestone[] {
  const today = referenceDateIST;

  const getMilestoneState = (date?: string | null, nextDate?: string | null): "completed" | "active" | "upcoming" => {
    if (!date) return "upcoming";
    if (today > date && (!nextDate || today > nextDate)) return "completed";
    if (today === date || (nextDate && today >= date && today <= nextDate)) return "active";
    return "upcoming";
  };

  return [
    {
      type: "announcement",
      title: "RHP / Announcement",
      date: ipo.announcement_date ?? null,
      status: ipo.announcement_date && today >= ipo.announcement_date ? "completed" : "upcoming",
      description: "Draft Red Herring Prospectus filed with SEBI",
    },
    {
      type: "open",
      title: "Issue Opens",
      date: ipo.open_date ?? null,
      status: getMilestoneState(ipo.open_date, ipo.close_date),
      description: "Bidding window opens for retail, QIB, and NII investors",
    },
    {
      type: "close",
      title: "Issue Closes",
      date: ipo.close_date ?? null,
      status: getMilestoneState(ipo.close_date, ipo.allotment_date),
      description: "UPI mandate authorization cutoff at 5:00 PM IST",
    },
    {
      type: "allotment",
      title: "Basis of Allotment",
      date: ipo.allotment_date ?? null,
      status: getMilestoneState(ipo.allotment_date, ipo.refund_date),
      description: "Registrar finalizes share allotment basis",
    },
    {
      type: "refund",
      title: "Refunds / Unblocking",
      date: ipo.refund_date ?? null,
      status: getMilestoneState(ipo.refund_date, ipo.listing_date),
      description: "UPI mandate liens released for unallotted applications",
    },
    {
      type: "listing",
      title: "Stock Exchange Listing",
      date: ipo.listing_date ?? null,
      status: ipo.listing_date && today >= ipo.listing_date ? "completed" : "upcoming",
      description: `Trading commences on ${ipo.exchange || "NSE / BSE"} at 10:00 AM IST`,
    },
  ];
}

/**
 * Returns integer progress percentage (0 - 100) based on current IPO status.
 */
export function getIPOProgressPercentage(status: IPOStatus): number {
  switch (status) {
    case "announced":
      return 10;
    case "upcoming":
      return 25;
    case "open":
      return 50;
    case "closed":
      return 65;
    case "allotment_pending":
      return 75;
    case "listing_soon":
      return 85;
    case "listed":
      return 100;
    case "withdrawn":
    case "cancelled":
      return 0;
    default:
      return 0;
  }
}
