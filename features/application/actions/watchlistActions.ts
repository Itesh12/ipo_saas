"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/security/auth-guards";
import { toggleWatchlist } from "../services/watchlistService";

export async function toggleWatchlistAction(ipoId: string, currentPath = "/watchlist") {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Please log in to manage your watchlist." };
  }

  const result = await toggleWatchlist(user.id, ipoId);
  if (result.success) {
    revalidatePath("/watchlist");
    revalidatePath("/dashboard");
    if (currentPath) {
      revalidatePath(currentPath);
    }
  }
  return result;
}
