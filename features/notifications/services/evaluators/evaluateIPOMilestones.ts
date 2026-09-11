/**
 * features/notifications/services/evaluators/evaluateIPOMilestones.ts
 *
 * Phase 7B: Time-Based IPO Milestone Evaluator
 * Evaluates published IPOs against current Indian Standard Time (IST) calendar dates:
 * - ipo_bidding_opened (open_date = today_ist, status = 'open')
 * - ipo_closing_soon   (close_date = today_ist, status = 'open' - cutoff alert)
 * - ipo_allotment_finalized (allotment_date = today_ist)
 * - ipo_listing_today  (listing_date = today_ist)
 *
 * Stale Rule: Milestones older than 24h past are marked stale and discarded.
 */

export interface IPOMilestoneCandidate {
  id: string;
  slug: string;
  companyName: string;
  symbol: string | null;
  status: string;
  openDate: string | null;      // YYYY-MM-DD
  closeDate: string | null;     // YYYY-MM-DD
  allotmentDate: string | null; // YYYY-MM-DD
  listingDate: string | null;   // YYYY-MM-DD
  priceBandLow?: number | null;
  priceBandHigh?: number | null;
}

export interface IngestableNotificationEvent {
  eventType: string;
  eventClass: 'condition_driven';
  idempotencyKey: string;
  aggregateType: 'ipos';
  aggregateId: string;
  payload: Record<string, unknown>;
}

export class IPOMilestoneEvaluator {
  /**
   * Helper to format any JS Date into Indian Standard Time YYYY-MM-DD.
   */
  static getTodayIST(date: Date = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date); // Returns "YYYY-MM-DD"
  }

  /**
   * Evaluates an array of published IPOs against the reference IST date.
   */
  static evaluateCandidates(
    candidates: IPOMilestoneCandidate[],
    referenceDate: Date = new Date()
  ): IngestableNotificationEvent[] {
    const todayIST = this.getTodayIST(referenceDate);
    const events: IngestableNotificationEvent[] = [];

    for (const ipo of candidates) {
      // 1. Bidding Opened
      if (ipo.openDate === todayIST && ipo.status === 'open') {
        events.push({
          eventType: 'ipo_bidding_opened',
          eventClass: 'condition_driven',
          idempotencyKey: `ipo:milestone:opened:${ipo.id}:${ipo.openDate}`,
          aggregateType: 'ipos',
          aggregateId: ipo.id,
          payload: {
            ipo_id: ipo.id,
            company_name: ipo.companyName,
            symbol: ipo.symbol,
            slug: ipo.slug,
            price_band_low: ipo.priceBandLow,
            price_band_high: ipo.priceBandHigh,
            open_date: ipo.openDate,
            close_date: ipo.closeDate,
          },
        });
      }

      // 2. Closing Soon (Cutoff day reminder)
      if (ipo.closeDate === todayIST && ipo.status === 'open') {
        events.push({
          eventType: 'ipo_closing_soon',
          eventClass: 'condition_driven',
          idempotencyKey: `ipo:milestone:closing:${ipo.id}:${ipo.closeDate}`,
          aggregateType: 'ipos',
          aggregateId: ipo.id,
          payload: {
            ipo_id: ipo.id,
            company_name: ipo.companyName,
            symbol: ipo.symbol,
            slug: ipo.slug,
            close_date: ipo.closeDate,
            reminder_text: 'Bidding closes today by 5:00 PM IST.',
          },
        });
      }

      // 3. Allotment Finalized
      if (ipo.allotmentDate === todayIST) {
        events.push({
          eventType: 'ipo_allotment_finalized',
          eventClass: 'condition_driven',
          idempotencyKey: `ipo:milestone:allotment:${ipo.id}:${ipo.allotmentDate}`,
          aggregateType: 'ipos',
          aggregateId: ipo.id,
          payload: {
            ipo_id: ipo.id,
            company_name: ipo.companyName,
            symbol: ipo.symbol,
            slug: ipo.slug,
            allotment_date: ipo.allotmentDate,
          },
        });
      }

      // 4. Listing Today
      if (ipo.listingDate === todayIST) {
        events.push({
          eventType: 'ipo_listing_today',
          eventClass: 'condition_driven',
          idempotencyKey: `ipo:milestone:listing:${ipo.id}:${ipo.listingDate}`,
          aggregateType: 'ipos',
          aggregateId: ipo.id,
          payload: {
            ipo_id: ipo.id,
            company_name: ipo.companyName,
            symbol: ipo.symbol,
            slug: ipo.slug,
            listing_date: ipo.listingDate,
            trading_hours: '10:00 AM IST on NSE/BSE',
          },
        });
      }
    }

    return events;
  }

  /**
   * Evaluates if a past milestone is stale (> 24 hours past reference date).
   */
  static isMilestoneStale(milestoneDateStr: string, referenceDate: Date = new Date()): boolean {
    const todayIST = this.getTodayIST(referenceDate);
    const [tY, tM, tD] = todayIST.split('-').map(Number);
    const [mY, mM, mD] = milestoneDateStr.split('-').map(Number);

    const todayVal = new Date(Date.UTC(tY, tM - 1, tD)).getTime();
    const milestoneVal = new Date(Date.UTC(mY, mM - 1, mD)).getTime();

    const diffDays = (todayVal - milestoneVal) / (1000 * 60 * 60 * 24);
    return diffDays > 1; // Stale if more than 1 calendar day past
  }
}
