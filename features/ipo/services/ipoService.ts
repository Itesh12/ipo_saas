import { createClient } from "@/lib/supabase/server";
import { IPORow, IPOFilterParams, IPOCalendarEvent, IPOWithEvents } from "../types/ipo.types";
import { deriveIPOStatus } from "./ipoLifecycle";

// Canonical production service queries public.ipos exclusively.
// All offline test fixtures have been quarantined to tests/fixtures/devSeedIpos.ts.


/**
 * Fetches published IPOs matching filters for the public website.
 */
export async function getPublishedIPOs(filters: IPOFilterParams = {}): Promise<{
  ipos: IPORow[];
  totalCount: number;
}> {
  try {
    const supabase = await createClient();
    let query = supabase
      .from("ipos")
      .select("*", { count: "exact" })
      .eq("publication_status", "published");

    // Category filtering
    if (filters.category && filters.category !== "all") {
      query = query.eq("category", filters.category);
    }

    // Search query
    if (filters.searchQuery) {
      const term = `%${filters.searchQuery}%`;
      query = query.or(`company_name.ilike.${term},symbol.ilike.${term}`);
    }

    // Default fetch from database (deterministic baseline order)
    query = query.order("created_at", { ascending: true, nullsFirst: false });

    // Fetch published candidates
    const { data, error } = await query;

    if (error || !data || data.length === 0) {
      return {
        ipos: [],
        totalCount: 0,
      };
    }

    // Dynamically derive current status based on IST date for freshly fetched records
    let ipos = (data as IPORow[]).map((ipo) => ({
      ...ipo,
      status: deriveIPOStatus(ipo),
      lot_size: ipo.lot_size_status === "pending_verification" ? null : ipo.lot_size,
      min_investment: ipo.lot_size_status === "pending_verification" ? null : ipo.min_investment,
    }));

    // Filter out non-equity instruments from primary IPO catalog (Hard Gate 2)
    ipos = ipos.filter((i) => {
      const prov = (i.provenance || {}) as Record<string, unknown>;
      const instType = (prov.instrument_type as string) || ((i as unknown as Record<string, unknown>).instrument_type as string) || 'IPO';
      return instType === 'IPO' || instType === 'SME_IPO';
    });

    // Dynamic IST Status / Tab filtering (using authoritative derived lifecycle status)
    if (filters.status && filters.status !== "all") {
      if (filters.status === "current") {
        ipos = ipos.filter((i) => i.status === "open");
      } else if (filters.status === "upcoming") {
        ipos = ipos.filter((i) => i.status === "upcoming");
      } else if (filters.status === "announced") {
        ipos = ipos.filter((i) => i.status === "announced");
      } else if (filters.status === "past") {
        ipos = ipos.filter((i) => i.status === "listed");
      } else {
        ipos = ipos.filter((i) => i.status === filters.status);
      }
    }

    // Market Segment filtering (Stage 3A.6)
    if (filters.market_segment && filters.market_segment !== "all") {
      ipos = ipos.filter((i) => {
        const seg =
          ((i as unknown as Record<string, unknown>).market_segment as string) ||
          (i.category === 'sme_nse' || (i.category as string) === 'sme' ? 'NSE_SME' : (i.category === 'sme_bse' ? 'BSE_SME' : 'MAINBOARD'));
        return seg === filters.market_segment;
      });
    }

    // Year filtering (Stage 3A.6)
    if (filters.year && filters.year !== "all") {
      const targetYear = parseInt(String(filters.year), 10);
      ipos = ipos.filter((i) => {
        const rowYear =
          ((i as unknown as Record<string, unknown>).offering_year as number) ||
          (i.listing_date ? parseInt(i.listing_date.slice(0, 4), 10) : null) ||
          (i.open_date ? parseInt(i.open_date.slice(0, 4), 10) : null) ||
          new Date().getFullYear();
        return rowYear === targetYear;
      });
    }

    // Deterministic in-memory sorting BEFORE pagination
    const compareTieBreakers = (a: IPORow, b: IPORow): number => {
      const createdA = a.created_at || "";
      const createdB = b.created_at || "";
      if (createdA !== createdB) {
        return createdA.localeCompare(createdB);
      }
      return (a.id || "").localeCompare(b.id || "");
    };

    const compareAsc = (a?: string | number | null, b?: string | number | null): number => {
      if (a === b) return 0;
      if (a === null || a === undefined) return 1;
      if (b === null || b === undefined) return -1;
      if (typeof a === "number" && typeof b === "number") return a - b;
      return String(a).localeCompare(String(b));
    };

    const compareDesc = (a?: string | number | null, b?: string | number | null): number => {
      if (a === b) return 0;
      if (a === null || a === undefined) return 1;
      if (b === null || b === undefined) return -1;
      if (typeof a === "number" && typeof b === "number") return b - a;
      return String(b).localeCompare(String(a));
    };

    const getLifecyclePriority = (status: string): number => {
      switch (status) {
        case "open":
          return 1;
        case "upcoming":
          return 2;
        case "allotment_pending":
        case "closed":
          return 3;
        case "listing_soon":
          return 4;
        case "announced":
          return 5;
        case "listed":
          return 6;
        default:
          return 7;
      }
    };

    if (!filters.sortBy) {
      if (filters.status === "upcoming") {
        ipos.sort((a, b) => {
          const cmp = compareAsc(a.open_date, b.open_date);
          if (cmp !== 0) return cmp;
          return compareTieBreakers(a, b);
        });
      } else if (filters.status === "current") {
        ipos.sort((a, b) => {
          const cmp = compareAsc(a.close_date, b.close_date);
          if (cmp !== 0) return cmp;
          return compareTieBreakers(a, b);
        });
      } else if (filters.status === "past") {
        ipos.sort((a, b) => {
          const cmp = compareDesc(a.listing_date, b.listing_date);
          if (cmp !== 0) return cmp;
          return compareTieBreakers(a, b);
        });
      } else {
        // Default Catalog: 6 explicit lifecycle priority tiers
        ipos.sort((a, b) => {
          const prioA = getLifecyclePriority(a.status);
          const prioB = getLifecyclePriority(b.status);
          if (prioA !== prioB) {
            return prioA - prioB;
          }
          if (prioA === 1) {
            // OPEN: earliest close_date first
            const cmp = compareAsc(a.close_date, b.close_date);
            if (cmp !== 0) return cmp;
          } else if (prioA === 2) {
            // UPCOMING: earliest open_date first
            const cmp = compareAsc(a.open_date, b.open_date);
            if (cmp !== 0) return cmp;
          } else if (prioA === 3) {
            // ALLOTMENT_PENDING / CLOSED: close_date ASC
            const cmp = compareAsc(a.close_date, b.close_date);
            if (cmp !== 0) return cmp;
          } else if (prioA === 4) {
            // LISTING_SOON: listing_date ASC
            const cmp = compareAsc(a.listing_date, b.listing_date);
            if (cmp !== 0) return cmp;
          } else if (prioA === 5) {
            // ANNOUNCED: created_at DESC
            const cmp = compareDesc(a.created_at, b.created_at);
            if (cmp !== 0) return cmp;
          } else if (prioA === 6) {
            // LISTED: listing_date DESC
            const cmp = compareDesc(a.listing_date, b.listing_date);
            if (cmp !== 0) return cmp;
          }
          return compareTieBreakers(a, b);
        });
      }
    } else {
      let sortField = filters.sortBy as string;
      if (sortField === "issue_size") sortField = "issue_size_cr";
      const isAsc = filters.sortOrder === "asc";
      ipos.sort((a, b) => {
        const valA = (a as unknown as Record<string, unknown>)[sortField] as string | number | null | undefined;
        const valB = (b as unknown as Record<string, unknown>)[sortField] as string | number | null | undefined;
        const cmp = isAsc ? compareAsc(valA, valB) : compareDesc(valA, valB);
        if (cmp !== 0) return cmp;
        return compareTieBreakers(a, b);
      });
    }

    const totalCount = ipos.length;

    // In-memory pagination on derived, filtered, and deterministically sorted records
    const page = filters.page || 1;
    const pageSize = filters.pageSize || 20;
    const from = (page - 1) * pageSize;
    const paginated = ipos.slice(from, from + pageSize);

    return {
      ipos: paginated,
      totalCount,
    };
  } catch (err) {
    console.error("Failed to query published IPOs:", err);
    return {
      ipos: [],
      totalCount: 0,
    };
  }
}

/**
 * Hard Gate 5 & Stage 3A.6: Dynamically derives exact universe counts across Current, Upcoming, Announced, Past,
 * Market Segments (Mainboard, NSE SME, BSE SME), and Years directly from canonical database records.
 */
export async function getIPOUniverseCounts(): Promise<{
  all: number;
  current: number;
  upcoming: number;
  announced: number;
  past: number;
  mainboard: number;
  nse_sme: number;
  bse_sme: number;
  byYear: Record<number, number>;
}> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("ipos")
      .select("status, open_date, close_date, allotment_date, listing_date, is_listing_confirmed, provenance, market_segment, offering_year, category")
      .eq("publication_status", "published");

    const defaultCounts = {
      all: 0,
      current: 0,
      upcoming: 0,
      announced: 0,
      past: 0,
      mainboard: 0,
      nse_sme: 0,
      bse_sme: 0,
      byYear: {},
    };

    if (error || !data) {
      return defaultCounts;
    }

    let all = 0;
    let current = 0;
    let upcoming = 0;
    let announced = 0;
    let past = 0;
    let mainboard = 0;
    let nse_sme = 0;
    let bse_sme = 0;
    const byYear: Record<number, number> = {};

    for (const row of (data as unknown as (IPORow & { market_segment?: string; offering_year?: number })[])) {
      const prov = (row.provenance || {}) as Record<string, unknown>;
      const instType = (prov.instrument_type as string) || ((row as unknown as Record<string, unknown>).instrument_type as string) || 'IPO';
      if (instType !== 'IPO' && instType !== 'SME_IPO') continue;

      const derived = deriveIPOStatus(row as unknown as IPORow);
      all++;

      if (derived === 'open') {
        current++;
      } else if (derived === 'upcoming') {
        upcoming++;
      } else if (derived === 'announced') {
        announced++;
      } else if (derived === 'listed') {
        past++;
      }

      // Segment counts
      const seg = row.market_segment || (row.category === 'sme_nse' || (row.category as string) === 'sme' ? 'NSE_SME' : (row.category === 'sme_bse' ? 'BSE_SME' : 'MAINBOARD'));
      if (seg === 'MAINBOARD') mainboard++;
      else if (seg === 'NSE_SME') nse_sme++;
      else if (seg === 'BSE_SME') bse_sme++;

      // Year counts
      const yr =
        row.offering_year ||
        (row.listing_date ? parseInt(row.listing_date.slice(0, 4), 10) : null) ||
        (row.open_date ? parseInt(row.open_date.slice(0, 4), 10) : null) ||
        new Date().getFullYear();
      byYear[yr] = (byYear[yr] || 0) + 1;
    }

    return { all, current, upcoming, announced, past, mainboard, nse_sme, bse_sme, byYear };
  } catch (err) {
    console.error("Failed to derive IPO universe counts:", err);
    return {
      all: 0,
      current: 0,
      upcoming: 0,
      announced: 0,
      past: 0,
      mainboard: 0,
      nse_sme: 0,
      bse_sme: 0,
      byYear: {},
    };
  }
}

/**
 * Fetches a single published IPO by its unique URL slug.
 */
export async function getIPOBySlug(slug: string): Promise<IPOWithEvents | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("ipos")
      .select("*, ipo_events(*)")
      .eq("slug", slug)
      .eq("publication_status", "published")
      .single();

    if (error || !data) {
      return null;
    }

    const ipo = data as unknown as IPOWithEvents;
    return {
      ...ipo,
      status: deriveIPOStatus(ipo),
      lot_size: ipo.lot_size_status === "pending_verification" ? null : ipo.lot_size,
      min_investment: ipo.lot_size_status === "pending_verification" ? null : ipo.min_investment,
    };
  } catch {
    return null;
  }
}

/**
 * Retrieves IPO event milestones for the Calendar view.
 */
export async function getIPOCalendarEvents(
  year: number = new Date().getFullYear(),
  month: number = new Date().getMonth() + 1
): Promise<IPOCalendarEvent[]> {
  const { ipos } = await getPublishedIPOs({ pageSize: 100 });
  const events: IPOCalendarEvent[] = [];

  const targetMonthStr = `${year}-${String(month).padStart(2, "0")}`;

  ipos.forEach((ipo) => {
    const priceBandStr = ipo.price_band_high ? `₹${ipo.price_band_low || ipo.price_band_high} - ₹${ipo.price_band_high}` : undefined;

    if (ipo.open_date && ipo.open_date.startsWith(targetMonthStr)) {
      events.push({
        id: `${ipo.id}-open`,
        ipoId: ipo.id,
        slug: ipo.slug,
        companyName: ipo.company_name,
        category: ipo.category,
        eventType: "open",
        eventDate: ipo.open_date,
        title: `${ipo.company_name} Opens for Bidding`,
        priceBand: priceBandStr,
      });
    }

    if (ipo.close_date && ipo.close_date.startsWith(targetMonthStr)) {
      events.push({
        id: `${ipo.id}-close`,
        ipoId: ipo.id,
        slug: ipo.slug,
        companyName: ipo.company_name,
        category: ipo.category,
        eventType: "close",
        eventDate: ipo.close_date,
        title: `${ipo.company_name} Bidding Closes`,
        priceBand: priceBandStr,
      });
    }

    if (ipo.allotment_date && ipo.allotment_date.startsWith(targetMonthStr)) {
      events.push({
        id: `${ipo.id}-allotment`,
        ipoId: ipo.id,
        slug: ipo.slug,
        companyName: ipo.company_name,
        category: ipo.category,
        eventType: "allotment",
        eventDate: ipo.allotment_date,
        title: `${ipo.company_name} Basis of Allotment`,
      });
    }

    if (ipo.listing_date && ipo.listing_date.startsWith(targetMonthStr)) {
      events.push({
        id: `${ipo.id}-listing`,
        ipoId: ipo.id,
        slug: ipo.slug,
        companyName: ipo.company_name,
        category: ipo.category,
        eventType: "listing",
        eventDate: ipo.listing_date,
        title: `${ipo.company_name} Listing on Exchange`,
      });
    }
  });

  return events.sort((a, b) => a.eventDate.localeCompare(b.eventDate));
}

export const ipoService = {
  getPublishedIPOs,
  getIPOBySlug,
  getIPOCalendarEvents,
};
