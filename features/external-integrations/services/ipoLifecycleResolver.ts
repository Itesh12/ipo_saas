/**
 * features/external-integrations/services/ipoLifecycleResolver.ts
 *
 * Phase 9 Stage 3A.3: Deterministic IST Lifecycle & Timeline Resolver.
 *
 * Incorporates:
 * - Mandatory Correction 1: Authoritative bidding timestamps when available;
 *   explicitly versioned documented convention when date-only, tagging `is_derived_time: true`.
 * - Mandatory Correction 3: Confirmed listing evidence required for 'listed' state.
 *   Expected listing date alone fails closed to 'listing_soon', never blindly 'listed'.
 * - Historical Protection: Past listed records are never resurrected to upcoming/open.
 */

import { IPOStatus } from '@/features/ipo/types/ipo.types';

export interface AuthoritativeTimelineInput {
  open_date?: string | null;       // YYYY-MM-DD or full ISO
  close_date?: string | null;      // YYYY-MM-DD or full ISO
  allotment_date?: string | null;  // YYYY-MM-DD or full ISO
  listing_date?: string | null;    // YYYY-MM-DD or full ISO
  bidding_start_time?: string | null; // e.g. "10:00:00" or ISO
  bidding_end_time?: string | null;   // e.g. "17:00:00" or ISO
  listing_price?: number | null;
  is_listing_confirmed?: boolean;
  explicit_status?: string | null;
  nowIST?: string; // Optional deterministic clock override (ISO string)
}

export interface LifecycleResolutionOutcome {
  status: IPOStatus;
  isDerivedTime: boolean;
  timeConventionVersion?: string;
  evaluatedAtIST: string;
  explanation: string;
  timeline: {
    startInstantIST?: string;
    endInstantIST?: string;
    allotmentDateIST?: string;
    listingDateIST?: string;
  };
}

export class IpoLifecycleResolver {
  // Documented, versioned market hours fallback when source provides dates without exact time
  public static readonly CONVENTION_VERSION = 'v1.0-standard-ist-session';
  public static readonly DEFAULT_SESSION_START_TIME = '10:00:00';
  public static readonly DEFAULT_SESSION_END_TIME = '17:00:00';

  /**
   * Evaluates the explainable lifecycle state of an IPO strictly in Asia/Kolkata (IST).
   */
  public static resolveLifecycle(input: AuthoritativeTimelineInput): LifecycleResolutionOutcome {
    const now = input.nowIST ? new Date(input.nowIST) : new Date();
    const evaluatedAtIST = this.formatToIST(now);

    // 1. Explicit override priority: Withdrawn or Cancelled issues stay unchanged
    if (input.explicit_status === 'withdrawn' || input.explicit_status === 'cancelled') {
      return {
        status: input.explicit_status as IPOStatus,
        isDerivedTime: false,
        evaluatedAtIST,
        explanation: `Issue was explicitly flagged as ${input.explicit_status} by regulatory notice.`,
        timeline: {},
      };
    }

    // 2. Listing Verification Gate (Mandatory Correction 3)
    // Distinguishes confirmed listing from expected listing date
    const hasConfirmedListingEvidence =
      input.is_listing_confirmed === true ||
      (input.listing_price !== undefined && input.listing_price !== null && input.listing_price > 0) ||
      input.explicit_status === 'listed';

    const listingDateStr = input.listing_date ? input.listing_date.split('T')[0] : null;
    const todayDateStr = evaluatedAtIST.split('T')[0];

    if (listingDateStr && todayDateStr >= listingDateStr) {
      if (hasConfirmedListingEvidence) {
        return {
          status: 'listed',
          isDerivedTime: false,
          evaluatedAtIST,
          explanation: `Issue listing date (${listingDateStr}) has arrived with confirmed listing evidence.`,
          timeline: { listingDateIST: listingDateStr },
        };
      } else {
        // Postponed or unconfirmed listing fails closed to listing_soon
        return {
          status: 'listing_soon',
          isDerivedTime: false,
          evaluatedAtIST,
          explanation: `Expected listing date (${listingDateStr}) has arrived but listing confirmation/price is pending. Retained in listing_soon.`,
          timeline: { listingDateIST: listingDateStr },
        };
      }
    }

    // 3. Pre-Bidding: Missing Bidding Dates -> Announced
    if (!input.open_date || !input.close_date) {
      return {
        status: 'announced',
        isDerivedTime: false,
        evaluatedAtIST,
        explanation: 'Filing has been registered but authoritative bidding window is unannounced.',
        timeline: {},
      };
    }

    // 4. Resolve exact start & end instants (Mandatory Correction 1)
    const { startInstant, endInstant, isDerivedTime } = this.resolveBiddingInstants(
      input.open_date,
      input.close_date,
      input.bidding_start_time,
      input.bidding_end_time
    );

    const nowEpoch = now.getTime();
    const startEpoch = startInstant.getTime();
    const endEpoch = endInstant.getTime();

    // 5. Lifecycle Waterfall
    // 5A. Before Bidding Window -> Upcoming
    if (nowEpoch < startEpoch) {
      return {
        status: 'upcoming',
        isDerivedTime,
        timeConventionVersion: isDerivedTime ? this.CONVENTION_VERSION : undefined,
        evaluatedAtIST,
        explanation: `Bidding opens on ${startInstant.toISOString()} (IST). Currently in upcoming state.`,
        timeline: {
          startInstantIST: this.formatToIST(startInstant),
          endInstantIST: this.formatToIST(endInstant),
        },
      };
    }

    // 5B. Inside Active Bidding Window -> Open
    if (nowEpoch >= startEpoch && nowEpoch <= endEpoch) {
      return {
        status: 'open',
        isDerivedTime,
        timeConventionVersion: isDerivedTime ? this.CONVENTION_VERSION : undefined,
        evaluatedAtIST,
        explanation: `Bidding is actively open between ${startInstant.toISOString()} and ${endInstant.toISOString()} (IST).`,
        timeline: {
          startInstantIST: this.formatToIST(startInstant),
          endInstantIST: this.formatToIST(endInstant),
        },
      };
    }

    // 5C. After Close Instant -> Closed / Allotment Pending / Listing Soon
    const allotmentDateStr = input.allotment_date ? input.allotment_date.split('T')[0] : null;

    if (listingDateStr && todayDateStr < listingDateStr) {
      if (allotmentDateStr && todayDateStr >= allotmentDateStr) {
        return {
          status: 'listing_soon',
          isDerivedTime,
          timeConventionVersion: isDerivedTime ? this.CONVENTION_VERSION : undefined,
          evaluatedAtIST,
          explanation: `Allotment date (${allotmentDateStr}) has passed. Issue is awaiting listing on ${listingDateStr}.`,
          timeline: {
            startInstantIST: this.formatToIST(startInstant),
            endInstantIST: this.formatToIST(endInstant),
            allotmentDateIST: allotmentDateStr,
            listingDateIST: listingDateStr,
          },
        };
      }
      return {
        status: 'allotment_pending',
        isDerivedTime,
        timeConventionVersion: isDerivedTime ? this.CONVENTION_VERSION : undefined,
        evaluatedAtIST,
        explanation: `Bidding closed on ${endInstant.toISOString()} (IST). Allotment is pending.`,
        timeline: {
          startInstantIST: this.formatToIST(startInstant),
          endInstantIST: this.formatToIST(endInstant),
          allotmentDateIST: allotmentDateStr || undefined,
          listingDateIST: listingDateStr,
        },
      };
    }

    return {
      status: 'closed',
      isDerivedTime,
      timeConventionVersion: isDerivedTime ? this.CONVENTION_VERSION : undefined,
      evaluatedAtIST,
      explanation: `Bidding concluded at ${endInstant.toISOString()} (IST). Issue is closed.`,
      timeline: {
        startInstantIST: this.formatToIST(startInstant),
        endInstantIST: this.formatToIST(endInstant),
      },
    };
  }

  /**
   * Resolves exact start and end instants in IST without hardcoding.
   */
  private static resolveBiddingInstants(
    openDateRaw: string,
    closeDateRaw: string,
    startTimeRaw?: string | null,
    endTimeRaw?: string | null
  ): { startInstant: Date; endInstant: Date; isDerivedTime: boolean } {
    let isDerivedTime = false;

    // Check if openDate itself is already a full ISO timestamp
    let startInstant: Date;
    if (openDateRaw.includes('T') && openDateRaw.length > 10) {
      startInstant = new Date(openDateRaw);
    } else {
      const openDateOnly = openDateRaw.split('T')[0];
      const startTime = startTimeRaw || this.DEFAULT_SESSION_START_TIME;
      if (!startTimeRaw) isDerivedTime = true;
      startInstant = new Date(`${openDateOnly}T${startTime}+05:30`);
    }

    // Check if closeDate itself is a full ISO timestamp
    let endInstant: Date;
    if (closeDateRaw.includes('T') && closeDateRaw.length > 10) {
      endInstant = new Date(closeDateRaw);
    } else {
      const closeDateOnly = closeDateRaw.split('T')[0];
      const endTime = endTimeRaw || this.DEFAULT_SESSION_END_TIME;
      if (!endTimeRaw) isDerivedTime = true;
      endInstant = new Date(`${closeDateOnly}T${endTime}+05:30`);
    }

    return { startInstant, endInstant, isDerivedTime };
  }

  /**
   * Formats Date to ISO string representing IST (UTC+5:30) offset.
   */
  public static formatToIST(date: Date): string {
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(date.getTime() + istOffsetMs);
    return istTime.toISOString().replace('Z', '+05:30');
  }
}
