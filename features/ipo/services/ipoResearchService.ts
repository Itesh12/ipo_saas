/**
 * Public IPO Research & Intelligence Service
 * Queries published research data with provenance and fallback safety.
 */

import { createClient } from "@/lib/supabase/server";
import { getIPOBySlug } from "./ipoService";
import {
  IPOResearchBundle,
  IPOBusinessProfileRow,
  IPOFinancialRow,
  IPOValuationRow,
  IPOPeerRow,
  IPOPromoterRow,
  IPOStrengthRow,
  IPORiskRow,
  IPOGMPEntryRow,
  IPOSubscriptionSnapshotRow,
  IPOScoreRow,
  IPODocumentRow,
  IPONewsRow,
  GMPTrackerItem,
  SubscriptionTrackerItem,
} from "../types/ipo.types";

/**
 * Fetches the entire research bundle for a published IPO.
 * Safe against missing tables or missing records.
 */
export async function getIPOResearchBundle(slug: string): Promise<IPOResearchBundle | null> {
  const ipo = await getIPOBySlug(slug);
  if (!ipo) return null;

  try {
    const supabase = await createClient();

    const [
      businessRes,
      financialsRes,
      valuationRes,
      peersRes,
      promotersRes,
      strengthsRes,
      risksRes,
      gmpRes,
      subRes,
      scoreRes,
      docsRes,
      newsRes,
    ] = await Promise.all([
      supabase.from("ipo_business_profiles").select("*").eq("ipo_id", ipo.id).maybeSingle(),
      supabase.from("ipo_financials").select("*").eq("ipo_id", ipo.id).order("financial_year", { ascending: true }),
      supabase.from("ipo_valuations").select("*").eq("ipo_id", ipo.id).maybeSingle(),
      supabase.from("ipo_peers").select("*").eq("ipo_id", ipo.id),
      supabase.from("ipo_promoters").select("*").eq("ipo_id", ipo.id),
      supabase.from("ipo_strengths").select("*").eq("ipo_id", ipo.id).order("display_order", { ascending: true }),
      supabase.from("ipo_risks").select("*").eq("ipo_id", ipo.id).order("display_order", { ascending: true }),
      supabase.from("ipo_gmp_entries").select("*").eq("ipo_id", ipo.id).order("observed_at", { ascending: false }),
      supabase.from("ipo_subscription_snapshots").select("*").eq("ipo_id", ipo.id).order("day_number", { ascending: true }),
      supabase.from("ipo_scores").select("*").eq("ipo_id", ipo.id).maybeSingle(),
      supabase.from("ipo_documents").select("*").eq("ipo_id", ipo.id),
      supabase.from("ipo_news").select("*").eq("ipo_id", ipo.id).order("published_at", { ascending: false }),
    ]);

    const gmpList = (gmpRes.data || []) as unknown as IPOGMPEntryRow[];
    const subList = (subRes.data || []) as unknown as IPOSubscriptionSnapshotRow[];

    return {
      ipo,
      businessProfile: (businessRes.data as unknown as IPOBusinessProfileRow) || null,
      financials: (financialsRes.data as unknown as IPOFinancialRow[]) || [],
      valuation: (valuationRes.data as unknown as IPOValuationRow) || null,
      peers: (peersRes.data as unknown as IPOPeerRow[]) || [],
      promoters: (promotersRes.data as unknown as IPOPromoterRow[]) || [],
      strengths: (strengthsRes.data as unknown as IPOStrengthRow[]) || [],
      risks: (risksRes.data as unknown as IPORiskRow[]) || [],
      latestGmp: gmpList.length > 0 ? gmpList[0] : null,
      gmpHistory: gmpList,
      latestSubscription: subList.length > 0 ? subList[subList.length - 1] : null,
      subscriptionSnapshots: subList,
      score: (scoreRes.data as unknown as IPOScoreRow) || null,
      documents: (docsRes.data as unknown as IPODocumentRow[]) || [],
      news: (newsRes.data as unknown as IPONewsRow[]) || [],
    };
  } catch (error) {
    console.error("Error fetching IPO research bundle:", error);
    // Return graceful partial bundle with just master IPO info
    return {
      ipo,
      businessProfile: null,
      financials: [],
      valuation: null,
      peers: [],
      promoters: [],
      strengths: [],
      risks: [],
      latestGmp: null,
      gmpHistory: [],
      latestSubscription: null,
      subscriptionSnapshots: [],
      score: null,
      documents: [],
      news: [],
    };
  }
}

/**
 * Fetches all active GMP records for the dedicated /ipo-gmp tracker.
 */
export async function getLiveGMPTrackerList(): Promise<GMPTrackerItem[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("ipos")
      .select(`
        id,
        slug,
        company_name,
        symbol,
        category,
        status,
        price_band_low,
        price_band_high,
        open_date,
        close_date,
        listing_date,
        ipo_gmp_entries (
          id,
          gmp_value,
          gmp_percentage,
          estimated_listing_price,
          estimated_listing_gain_pct,
          confidence_level,
          observed_at,
          source
        )
      `)
      .eq("publication_status", "published")
      .in("status", ["announced", "upcoming", "open", "closed", "allotment_pending", "listing_soon"])
      .order("open_date", { ascending: true });

    if (error) throw error;
    return (data || []) as unknown as GMPTrackerItem[];
  } catch (err) {
    console.error("Error querying live GMP tracker:", err);
    return [];
  }
}

/**
 * Fetches all active subscription records for the dedicated /ipo-subscription tracker.
 */
export async function getLiveSubscriptionTrackerList(): Promise<SubscriptionTrackerItem[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("ipos")
      .select(`
        id,
        slug,
        company_name,
        symbol,
        category,
        status,
        issue_size_cr,
        open_date,
        close_date,
        ipo_subscription_snapshots (
          id,
          day_number,
          snapshot_date,
          snapshot_time,
          qib_x,
          nii_x,
          retail_x,
          employee_x,
          overall_x,
          source
        )
      `)
      .eq("publication_status", "published")
      .in("status", ["open", "closed", "allotment_pending", "listing_soon"])
      .order("open_date", { ascending: false });

    if (error) throw error;
    return (data || []) as unknown as SubscriptionTrackerItem[];
  } catch (err) {
    console.error("Error querying live subscription tracker:", err);
    return [];
  }
}
