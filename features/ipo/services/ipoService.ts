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

    // Sorting
    const sortField = filters.sortBy || "open_date";
    const isAscending = filters.sortOrder === "asc";
    query = query.order(sortField, { ascending: isAscending, nullsFirst: false });

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

    // Dynamic IST Status / Tab filtering (Hard Gate 4 & 5)
    if (filters.status && filters.status !== "all") {
      if (filters.status === "current") {
        ipos = ipos.filter((i) => ["open", "closed", "allotment_pending", "listing_soon"].includes(i.status));
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

    const totalCount = ipos.length;

    // In-memory pagination on derived records
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
 * Hard Gate 5: Dynamically derives exact universe counts across Current, Upcoming, Announced, and Past
 * directly from canonical database records. Zero hardcoded counts or static fixtures.
 */
export async function getIPOUniverseCounts(): Promise<{
  all: number;
  current: number;
  upcoming: number;
  announced: number;
  past: number;
}> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("ipos")
      .select("status, open_date, close_date, allotment_date, listing_date, is_listing_confirmed, provenance")
      .eq("publication_status", "published");

    if (error || !data) {
      return { all: 0, current: 0, upcoming: 0, announced: 0, past: 0 };
    }

    let all = 0;
    let current = 0;
    let upcoming = 0;
    let announced = 0;
    let past = 0;

    for (const row of (data as unknown as IPORow[])) {
      const prov = (row.provenance || {}) as Record<string, unknown>;
      const instType = (prov.instrument_type as string) || ((row as unknown as Record<string, unknown>).instrument_type as string) || 'IPO';
      if (instType !== 'IPO' && instType !== 'SME_IPO') continue;

      const derived = deriveIPOStatus(row as unknown as IPORow);
      all++;

      if (['open', 'closed', 'allotment_pending', 'listing_soon'].includes(derived)) {
        current++;
      } else if (derived === 'upcoming') {
        upcoming++;
      } else if (derived === 'announced') {
        announced++;
      } else if (derived === 'listed') {
        past++;
      }
    }

    return { all, current, upcoming, announced, past };
  } catch (err) {
    console.error("Failed to derive IPO universe counts:", err);
    return { all: 0, current: 0, upcoming: 0, announced: 0, past: 0 };
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
