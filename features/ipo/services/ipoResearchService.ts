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
  IPOAllotmentFactRow,
  IPOAllotmentEstimateRow,
  IPORegistrarPortalStatusRow,
  IPOAllotmentEventRow,
  GMPTrackerItem,
  SubscriptionTrackerItem,
} from "../types/ipo.types";

import { IPOTieredCacheService } from "./ipoTieredCacheService";

/**
 * Fetches the entire research bundle for a published IPO.
 * Implements Phase E tiered caching:
 * - Static research cached for 24h under ipo:research:${ipo.id}
 * - Dynamic GMP cached for 60s under ipo:gmp:${ipo.id}
 * - Dynamic Subscription cached for 60s under ipo:subscription:${ipo.id}
 * - Allotment milestones cached for 300s under ipo:allotment:${ipo.id}
 */
export async function getIPOResearchBundle(slug: string): Promise<IPOResearchBundle | null> {
  const ipo = await getIPOBySlug(slug);
  if (!ipo) return null;

  try {
    const supabase = await createClient();
    const tags = IPOTieredCacheService.getTags(ipo.id);

    // Tier 1: Static Prospectus Research (24h TTL)
    const staticResearch = await IPOTieredCacheService.getOrSet(
      `research:${ipo.id}`,
      [tags.research],
      86400,
      async () => {
        const [
          businessRes,
          financialsRes,
          valuationRes,
          peersRes,
          promotersRes,
          strengthsRes,
          risksRes,
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
          supabase.from("ipo_scores").select("*").eq("ipo_id", ipo.id).maybeSingle(),
          supabase.from("ipo_documents").select("*").eq("ipo_id", ipo.id),
          supabase.from("ipo_news").select("*").eq("ipo_id", ipo.id).order("published_at", { ascending: false }),
        ]);

        return {
          businessProfile: (businessRes.data as unknown as IPOBusinessProfileRow) || null,
          financials: (financialsRes.data as unknown as IPOFinancialRow[]) || [],
          valuation: (valuationRes.data as unknown as IPOValuationRow) || null,
          peers: (peersRes.data as unknown as IPOPeerRow[]) || [],
          promoters: (promotersRes.data as unknown as IPOPromoterRow[]) || [],
          strengths: (strengthsRes.data as unknown as IPOStrengthRow[]) || [],
          risks: (risksRes.data as unknown as IPORiskRow[]) || [],
          score: (scoreRes.data as unknown as IPOScoreRow) || null,
          documents: (docsRes.data as unknown as IPODocumentRow[]) || [],
          news: (newsRes.data as unknown as IPONewsRow[]) || [],
        };
      }
    );

    // Tier 2: Dynamic Grey Market Premium (60s TTL)
    const gmpList = await IPOTieredCacheService.getOrSet(
      `gmp:${ipo.id}`,
      [tags.gmp],
      60,
      async () => {
        const { data } = await supabase
          .from("ipo_gmp_entries")
          .select("*")
          .eq("ipo_id", ipo.id)
          .order("observed_at", { ascending: false });
        return (data || []) as unknown as IPOGMPEntryRow[];
      }
    );

    // Tier 3: Dynamic Subscription Demand (60s TTL)
    const subList = await IPOTieredCacheService.getOrSet(
      `sub:${ipo.id}`,
      [tags.subscription],
      60,
      async () => {
        const { data } = await supabase
          .from("ipo_subscription_snapshots")
          .select("*")
          .eq("ipo_id", ipo.id)
          .order("day_number", { ascending: true });
        return (data || []) as unknown as IPOSubscriptionSnapshotRow[];
      }
    );

    // Tier 4: Event-Driven Allotment Milestones (300s TTL)
    const allotmentData = await IPOTieredCacheService.getOrSet(
      `allotment:${ipo.id}`,
      [tags.allotment],
      300,
      async () => {
        const [factsRes, estimatesRes, portalRes, eventsRes] = await Promise.all([
          supabase.from("ipo_allotment_facts").select("*").eq("ipo_id", ipo.id).maybeSingle(),
          supabase.from("ipo_allotment_estimates").select("*").eq("ipo_id", ipo.id).maybeSingle(),
          supabase.from("ipo_registrar_portal_status").select("*").eq("ipo_id", ipo.id).maybeSingle(),
          supabase.from("ipo_allotment_events").select("*").eq("ipo_id", ipo.id).order("event_time", { ascending: true }),
        ]);

        return {
          allotmentFacts: (factsRes?.data as unknown as IPOAllotmentFactRow) || null,
          allotmentEstimates: (estimatesRes?.data as unknown as IPOAllotmentEstimateRow) || null,
          registrarPortalStatus: (portalRes?.data as unknown as IPORegistrarPortalStatusRow) || null,
          allotmentEvents: (eventsRes?.data as unknown as IPOAllotmentEventRow[]) || [],
        };
      }
    );

    return {
      ipo,
      businessProfile: staticResearch.businessProfile,
      financials: staticResearch.financials,
      valuation: staticResearch.valuation,
      peers: staticResearch.peers,
      promoters: staticResearch.promoters,
      strengths: staticResearch.strengths,
      risks: staticResearch.risks,
      latestGmp: gmpList.length > 0 ? gmpList[0] : null,
      gmpHistory: gmpList,
      latestSubscription: subList.length > 0 ? subList[subList.length - 1] : null,
      subscriptionSnapshots: subList,
      score: staticResearch.score,
      documents: staticResearch.documents,
      news: staticResearch.news,
      allotmentFacts: allotmentData.allotmentFacts,
      allotmentEstimates: allotmentData.allotmentEstimates,
      registrarPortalStatus: allotmentData.registrarPortalStatus,
      allotmentEvents: allotmentData.allotmentEvents,
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
      allotmentFacts: null,
      allotmentEstimates: null,
      registrarPortalStatus: null,
      allotmentEvents: [],
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
          source,
          source_count,
          source_spread_pct,
          kostak_rate,
          subject_to_sauda_rate,
          trend_direction,
          day_change_value,
          day_change_pct,
          freshness_state,
          policy_version,
          is_post_listing_frozen
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
          b_hni_x,
          s_hni_x,
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
