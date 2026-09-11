/**
 * Watchlist Service
 * Manages private user watchlists with unofficial GMP insights and bidding schedule alerts.
 */

import { createClient } from "@/lib/supabase/server";
import { WatchlistIPOItem } from "../types/application.types";

/**
 * Toggles an IPO in the user's private watchlist.
 * Returns true if now in watchlist, false if removed.
 */
export async function toggleWatchlist(
  userId: string,
  ipoId: string
): Promise<{ success: boolean; isWatched?: boolean; error?: string }> {
  const supabase = await createClient();

  // Check if exists
  const { data: existingRaw } = await supabase
    .from("watchlist_items")
    .select("id")
    .eq("user_id", userId)
    .eq("ipo_id", ipoId)
    .maybeSingle();

  const existing = existingRaw as unknown as { id: string } | null;

  if (existing) {
    const { error: delErr } = await supabase
      .from("watchlist_items")
      .delete()
      .eq("id", existing.id);

    if (delErr) return { success: false, error: delErr.message };
    return { success: true, isWatched: false };
  } else {
    const { error: insErr } = await supabase
      .from("watchlist_items")
      .insert({ user_id: userId, ipo_id: ipoId } as never);

    if (insErr) return { success: false, error: insErr.message };
    return { success: true, isWatched: true };
  }
}

/**
 * Checks if a specific IPO is on the user's watchlist.
 */
export async function isIPOInWatchlist(
  userId: string,
  ipoId: string
): Promise<boolean> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("watchlist_items")
    .select("id")
    .eq("user_id", userId)
    .eq("ipo_id", ipoId)
    .maybeSingle();

  return Boolean(data);
}

/**
 * Retrieves all watched IPOs for a user, joined with latest unofficial GMP quotes.
 */
export async function getUserWatchlist(userId: string): Promise<WatchlistIPOItem[]> {
  const supabase = await createClient();

  const { data: rawItems, error } = await supabase
    .from("watchlist_items")
    .select(`
      id,
      user_id,
      ipo_id,
      created_at,
      ipos (
        id,
        company_name,
        symbol,
        slug,
        company_logo,
        status,
        price_band_low,
        price_band_high,
        lot_size,
        min_investment,
        open_date,
        close_date,
        listing_date
      )
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error || !rawItems) {
    return [];
  }

  const items = rawItems as unknown as Array<{
    id: string;
    user_id: string;
    ipo_id: string;
    created_at: string;
    ipos: WatchlistIPOItem["ipo"];
  }>;

  // Fetch latest unofficial GMP for each watched IPO
  const ipoIds = items.map((i) => i.ipo_id);
  const gmpMap: Record<string, WatchlistIPOItem["latest_gmp"]> = {};

  if (ipoIds.length > 0) {
    const { data: rawGmps } = await supabase
      .from("ipo_gmp_entries")
      .select("ipo_id, gmp_amount, gmp_percentage, estimated_listing_price, source, observed_at")
      .in("ipo_id", ipoIds)
      .order("observed_at", { ascending: false });

    if (rawGmps) {
      const gmps = rawGmps as unknown as Array<{
        ipo_id: string;
        gmp_amount: number;
        gmp_percentage: number | null;
        estimated_listing_price: number | null;
        source: string;
        observed_at: string;
      }>;

      for (const g of gmps) {
        if (!gmpMap[g.ipo_id]) {
          gmpMap[g.ipo_id] = {
            gmp_amount: g.gmp_amount,
            gmp_percentage: g.gmp_percentage,
            estimated_listing_price: g.estimated_listing_price,
            source: g.source,
            observed_at: g.observed_at,
          };
        }
      }
    }
  }

  return items.map((item) => ({
    id: item.id,
    user_id: item.user_id,
    ipo_id: item.ipo_id,
    created_at: item.created_at,
    ipo: item.ipos,
    latest_gmp: gmpMap[item.ipo_id] || null,
  }));
}
