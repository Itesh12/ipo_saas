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

export interface DeriveLifecycleParams {
  open_date?: string | null;
  close_date?: string | null;
  allotment_date?: string | null;
  listing_date?: string | null;
  status?: IPOStatus | string | null;
  listing_price?: number | null;
  is_listing_confirmed?: boolean;
  allotmentFinalizedEvidence?: boolean;
  nowIST?: string; // Formatted YYYY-MM-DD or ISO string
}

export interface LifecycleDerivationResult {
  sourceStatus: string | null;
  derivedStatus: IPOStatus;
  finalStatus: IPOStatus;
  reason: string;
  statusSource: 'explicit_override' | 'authoritative_listing' | 'authoritative_allotment' | 'bidding_window' | 'dates_pending';
}

/**
 * Derives an explainable, deterministic lifecycle status using an explicit IST instant.
 * Does not manufacture allotment completion without authoritative evidence.
 * Protects against premature 'listed' status without confirmed listing evidence.
 */
export function deriveExplainableIPOStatus(params: DeriveLifecycleParams): LifecycleDerivationResult {
  const sourceStatus = params.status ? String(params.status) : null;
  const now = (params.nowIST || getTodayIST()).slice(0, 10);
  const { open_date, close_date, allotment_date, listing_date, allotmentFinalizedEvidence } = params;

  // 1. Respect explicit manual cancellations/withdrawals
  if (sourceStatus === "withdrawn" || sourceStatus === "cancelled") {
    return {
      sourceStatus,
      derivedStatus: sourceStatus as IPOStatus,
      finalStatus: sourceStatus as IPOStatus,
      reason: `issue_${sourceStatus}`,
      statusSource: "explicit_override",
    };
  }

  // 2. Listing Date Elapsed & Confirmation Gate (Mandatory Correction 3)
  const listingDateStr = listing_date ? listing_date.slice(0, 10) : null;
  const isConfirmedListing =
    params.is_listing_confirmed === true ||
    (params.listing_price !== undefined && params.listing_price !== null && params.listing_price > 0) ||
    sourceStatus === "listed" ||
    (params.is_listing_confirmed === undefined && params.listing_price === undefined);

  if (listingDateStr && now >= listingDateStr) {
    if (isConfirmedListing) {
      return {
        sourceStatus,
        derivedStatus: "listed",
        finalStatus: "listed",
        reason: "confirmed_listing_date_elapsed",
        statusSource: "authoritative_listing",
      };
    } else {
      // Expected listing date reached without confirmed price/evidence: fails closed to listing_soon
      return {
        sourceStatus,
        derivedStatus: "listing_soon",
        finalStatus: "listing_soon",
        reason: "expected_listing_date_pending_confirmation",
        statusSource: "authoritative_listing",
      };
    }
  }

  // 3. Allotment Finalized / Listing Soon (respects allotment_date unless evidence explicitly negated)
  const hasAllotment =
    allotmentFinalizedEvidence === true ||
    (allotmentFinalizedEvidence !== false && allotment_date && now >= allotment_date.slice(0, 10));

  if (hasAllotment && (!listing_date || now < listing_date.slice(0, 10))) {
    return {
      sourceStatus,
      derivedStatus: "listing_soon",
      finalStatus: "listing_soon",
      reason: "allotment_finalized_awaiting_listing",
      statusSource: "authoritative_allotment",
    };
  }

  // 4. Bidding Closed (Never manufacture allotment completion without evidence)
  if (close_date && now > close_date.slice(0, 10)) {
    return {
      sourceStatus,
      derivedStatus: "closed",
      finalStatus: "closed",
      reason: "bidding_closed_awaiting_allotment",
      statusSource: "bidding_window",
    };
  }

  // 5. Active Bidding Window
  if (open_date && close_date && now >= open_date.slice(0, 10) && now <= close_date.slice(0, 10)) {
    return {
      sourceStatus,
      derivedStatus: "open",
      finalStatus: "open",
      reason: "bidding_window_active",
      statusSource: "bidding_window",
    };
  }

  // 6. Upcoming Bidding
  if (open_date && now < open_date.slice(0, 10)) {
    return {
      sourceStatus,
      derivedStatus: "upcoming",
      finalStatus: "upcoming",
      reason: "bidding_starts_future",
      statusSource: "bidding_window",
    };
  }

  // 7. Announced (Document filed, dates pending)
  return {
    sourceStatus,
    derivedStatus: "announced",
    finalStatus: "announced",
    reason: "prospectus_filed_dates_pending",
    statusSource: "dates_pending",
  };
}

/**
 * Derives the active business lifecycle status based on IST timeline dates.
 * Preserves explicit manual statuses (e.g. 'withdrawn', 'cancelled') if present.
 */
export function deriveIPOStatus(
  ipo: Pick<IPORow, "open_date" | "close_date" | "allotment_date" | "listing_date" | "status"> & {
    listing_price?: number | null;
    is_listing_confirmed?: boolean;
  },
  referenceDateIST: string = getTodayIST()
): IPOStatus {
  const result = deriveExplainableIPOStatus({
    open_date: ipo.open_date,
    close_date: ipo.close_date,
    allotment_date: ipo.allotment_date,
    listing_date: ipo.listing_date,
    status: ipo.status,
    listing_price: ipo.listing_price,
    is_listing_confirmed: ipo.is_listing_confirmed,
    nowIST: referenceDateIST,
  });
  return result.finalStatus;
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
