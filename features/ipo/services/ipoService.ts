import { createClient } from "@/lib/supabase/server";
import { IPORow, IPOFilterParams, IPOCalendarEvent, IPOWithEvents } from "../types/ipo.types";
import { deriveIPOStatus } from "./ipoLifecycle";

// Development Test Fixtures (Strictly for testing/offline fixtures, not used for production query fallback)
export const DEV_SEED_IPOS: IPORow[] = [
  {
    id: "a1111111-1111-1111-1111-111111111111",
    slug: "premier-energies-limited",
    company_name: "Premier Energies Limited",
    symbol: "PREMIERENE",
    company_logo: null,
    category: "mainboard",
    issue_type: "book_building",
    status: "open",
    publication_status: "published",
    price_band_low: 427.0,
    price_band_high: 450.0,
    face_value: 1.0,
    lot_size: 33,
    min_investment: 14850.0,
    issue_size_cr: 2830.4,
    fresh_issue_cr: 1291.4,
    ofs_cr: 1539.0,
    shares_offered: 62897777,
    retail_quota_pct: 35.0,
    qib_quota_pct: 50.0,
    hni_quota_pct: 15.0,
    exchange: "NSE, BSE",
    lead_managers: ["Kotak Mahindra Capital", "J.P. Morgan India", "ICICI Securities"],
    registrar_name: "KFin Technologies Limited",
    announcement_date: "2026-08-20",
    open_date: "2026-09-08",
    close_date: "2026-09-12",
    allotment_date: "2026-09-15",
    refund_date: "2026-09-16",
    listing_date: "2026-09-18",
    listing_price: null,
    about_company:
      "Premier Energies Limited is a leading integrated solar cell and solar module manufacturing company in India with over two decades of operating track record, providing clean renewable energy solutions.",
    created_by: null,
    approved_by: null,
    published_at: "2026-08-25T10:00:00Z",
    created_at: "2026-08-25T10:00:00Z",
    updated_at: "2026-08-25T10:00:00Z",
  },
  {
    id: "b2222222-2222-2222-2222-222222222222",
    slug: "bajaj-housing-finance-limited",
    company_name: "Bajaj Housing Finance Limited",
    symbol: "BAJAJHFL",
    company_logo: null,
    category: "mainboard",
    issue_type: "book_building",
    status: "upcoming",
    publication_status: "published",
    price_band_low: 66.0,
    price_band_high: 70.0,
    face_value: 10.0,
    lot_size: 214,
    min_investment: 14980.0,
    issue_size_cr: 6560.0,
    fresh_issue_cr: 3560.0,
    ofs_cr: 3000.0,
    shares_offered: 937142857,
    retail_quota_pct: 35.0,
    qib_quota_pct: 50.0,
    hni_quota_pct: 15.0,
    exchange: "NSE, BSE",
    lead_managers: ["Kotak Mahindra Capital", "BofA Securities", "Axis Capital", "JM Financial", "SBI Capital"],
    registrar_name: "KFin Technologies Limited",
    announcement_date: "2026-08-28",
    open_date: "2026-09-14",
    close_date: "2026-09-18",
    allotment_date: "2026-09-21",
    refund_date: "2026-09-22",
    listing_date: "2026-09-24",
    listing_price: null,
    about_company:
      "Bajaj Housing Finance Limited is a non-deposit taking Housing Finance Company (HFC) offering retail finance to individuals and corporate entities for home purchases and construction.",
    created_by: null,
    approved_by: null,
    published_at: "2026-09-01T10:00:00Z",
    created_at: "2026-09-01T10:00:00Z",
    updated_at: "2026-09-01T10:00:00Z",
  },
  {
    id: "c3333333-3333-3333-3333-333333333333",
    slug: "paramount-specialty-forgings-limited",
    company_name: "Paramount Speciality Forgings Limited",
    symbol: "PARAMOUNT",
    company_logo: null,
    category: "sme_nse",
    issue_type: "book_building",
    status: "listed",
    publication_status: "published",
    price_band_low: 57.0,
    price_band_high: 59.0,
    face_value: 10.0,
    lot_size: 2000,
    min_investment: 118000.0,
    issue_size_cr: 32.34,
    fresh_issue_cr: 32.34,
    ofs_cr: 0.0,
    shares_offered: 5480000,
    retail_quota_pct: 35.0,
    qib_quota_pct: 50.0,
    hni_quota_pct: 15.0,
    exchange: "NSE SME",
    lead_managers: ["Swaraj Shares and Securities"],
    registrar_name: "Purva Sharegistry (India) Pvt Ltd",
    announcement_date: "2026-07-15",
    open_date: "2026-08-10",
    close_date: "2026-08-14",
    allotment_date: "2026-08-17",
    refund_date: "2026-08-18",
    listing_date: "2026-08-20",
    listing_price: 68.0,
    about_company:
      "Paramount Speciality Forgings is a leading Indian manufacturer of forged products offering closed die forgings and forged rings for petrochemical, oil & gas and heavy engineering sectors.",
    created_by: null,
    approved_by: null,
    published_at: "2026-08-01T10:00:00Z",
    created_at: "2026-08-01T10:00:00Z",
    updated_at: "2026-08-01T10:00:00Z",
  },
];

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

    // Status / Tab filtering
    if (filters.status && filters.status !== "all") {
      if (filters.status === "current") {
        query = query.eq("status", "open");
      } else if (filters.status === "upcoming") {
        query = query.in("status", ["announced", "upcoming"]);
      } else if (filters.status === "past") {
        query = query.in("status", ["closed", "allotment_pending", "listing_soon", "listed"]);
      } else if (filters.status === "active_universe") {
        query = query.in("status", ["upcoming", "open", "closed", "allotment_pending", "listing_soon"]);
      } else {
        query = query.eq("status", filters.status);
      }
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

    // Pagination
    const page = filters.page || 1;
    const pageSize = filters.pageSize || 20;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data, count, error } = await query;

    if (error || !data || data.length === 0) {
      return {
        ipos: [],
        totalCount: count ?? 0,
      };
    }

    // Dynamically derive current status based on IST date for freshly fetched records
    const ipos = (data as IPORow[]).map((ipo) => ({
      ...ipo,
      status: deriveIPOStatus(ipo),
    }));

    return {
      ipos,
      totalCount: count ?? ipos.length,
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

/**
 * Test utility: Filter helper for development seed fixtures
 */
export function getFilteredDevSeed(filters: IPOFilterParams): {
  ipos: IPORow[];
  totalCount: number;
} {
  let result = [...DEV_SEED_IPOS];

  if (filters.category && filters.category !== "all") {
    result = result.filter((i) => i.category === filters.category);
  }

  if (filters.status && filters.status !== "all") {
    if (filters.status === "current") {
      result = result.filter((i) => deriveIPOStatus(i) === "open");
    } else if (filters.status === "upcoming") {
      result = result.filter((i) => ["announced", "upcoming"].includes(deriveIPOStatus(i)));
    } else if (filters.status === "past") {
      result = result.filter((i) => ["closed", "allotment_pending", "listing_soon", "listed"].includes(deriveIPOStatus(i)));
    } else {
      result = result.filter((i) => deriveIPOStatus(i) === filters.status);
    }
  }

  if (filters.searchQuery) {
    const q = filters.searchQuery.toLowerCase();
    result = result.filter(
      (i) => i.company_name.toLowerCase().includes(q) || (i.symbol && i.symbol.toLowerCase().includes(q))
    );
  }

  return {
    ipos: result.map((i) => ({ ...i, status: deriveIPOStatus(i) })),
    totalCount: result.length,
  };
}
