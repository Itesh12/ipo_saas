/**
 * IPO Lifecycle Projection Synchronization Service
 *
 * Enforces the core architectural invariant:
 * - Canonical Dates (open_date, close_date, listing_date) evaluated against the live IST clock
 *   via deriveIPOStatus() are the SOLE authoritative source of truth.
 * - public.ipos.status is a query/indexing projection.
 * - This service idempotently updates public.ipos.status to match derived truth without EVER
 *   mutating or modifying canonical dates.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { deriveIPOStatus, getTodayIST } from "./ipoLifecycle";
import { IPORow, IPOStatus } from "../types/ipo.types";

export interface LifecycleDriftRecord {
  id: string;
  slug: string;
  fromStatus: string;
  toStatus: IPOStatus;
}

export interface LifecycleSyncSummary {
  totalChecked: number;
  driftsDetected: number;
  recordsUpdated: number;
  isDryRun: boolean;
  executedAt: string;
  drifts: LifecycleDriftRecord[];
}

/**
 * Idempotently reconciles public.ipos.status with deriveIPOStatus().
 * Never touches open_date, close_date, or listing_date.
 */
export async function syncStoredIPOStatuses(options?: {
  dryRun?: boolean;
  nowIST?: string;
}): Promise<LifecycleSyncSummary> {
  const isDryRun = options?.dryRun ?? false;
  const nowIST = options?.nowIST || getTodayIST();
  const supabase = createAdminClient();

  // Fetch all published candidates with their canonical date columns
  const { data: rows, error } = await supabase
    .from("ipos")
    .select(
      "id, slug, open_date, close_date, allotment_date, listing_date, status, listing_price, created_at, updated_at"
    );

  if (error) {
    console.error("[syncStoredIPOStatuses] Failed to query ipos table:", error);
    throw new Error(`Failed to query ipos for lifecycle sync: ${error.message}`);
  }

  const ipos = (rows || []) as IPORow[];
  const drifts: LifecycleDriftRecord[] = [];

  for (const ipo of ipos) {
    const currentStoredStatus = ipo.status;
    const derivedStatus = deriveIPOStatus(ipo, nowIST);

    if (currentStoredStatus !== derivedStatus) {
      drifts.push({
        id: ipo.id,
        slug: ipo.slug,
        fromStatus: currentStoredStatus,
        toStatus: derivedStatus,
      });
    }
  }

  let recordsUpdated = 0;

  if (!isDryRun && drifts.length > 0) {
    // Perform batched updates strictly targeting the status column
    for (const drift of drifts) {
      const { error: updateErr } = await supabase
        .from("ipos")
        .update({
          status: drift.toStatus,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", drift.id);

      if (updateErr) {
        console.error(
          `[syncStoredIPOStatuses] Failed updating status for ${drift.slug} (${drift.id}):`,
          updateErr
        );
      } else {
        recordsUpdated++;
      }
    }
  }

  return {
    totalChecked: ipos.length,
    driftsDetected: drifts.length,
    recordsUpdated: isDryRun ? 0 : recordsUpdated,
    isDryRun,
    executedAt: new Date().toISOString(),
    drifts,
  };
}
