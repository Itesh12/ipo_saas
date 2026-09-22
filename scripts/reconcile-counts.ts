import { createAdminClient } from "../lib/supabase/admin";
import * as fs from "fs";

async function reconcile() {
  const sb = createAdminClient();

  // 1. Total row count in public.ipos
  const { count: exactCount, error: countErr } = await sb
    .from("ipos")
    .select("*", { count: "exact", head: true });

  console.log("Exact count in public.ipos (head: true):", exactCount);

  // Fetch all rows
  const { data: allRows, error: fetchErr } = await sb
    .from("ipos")
    .select("id, symbol, company_name, publication_status, lot_size, lot_size_status, retail_quota_pct, created_at, updated_at")
    .order("created_at", { ascending: true });

  if (fetchErr || !allRows) {
    console.error("Fetch error:", fetchErr);
    return;
  }

  console.log("Fetched row count:", allRows.length);

  // Status breakdown
  const byPubStatus: Record<string, number> = {};
  for (const r of allRows) {
    const s = r.publication_status || "NULL";
    byPubStatus[s] = (byPubStatus[s] || 0) + 1;
  }
  console.log("Breakdown by publication_status:", byPubStatus);

  // Read remediation snapshot
  const snapshotRaw = fs.readFileSync("scripts/remediation-snapshot-batch-001.json", "utf-8");
  const snapshot = JSON.parse(snapshotRaw);
  console.log("Snapshot total changes:", snapshot.total_changes);
  console.log("Snapshot unique ipos:", snapshot.unique_ipos);

  // Check the lot_size modifications in snapshot
  const lotSizeChanges = snapshot.changes.filter((c: any) => c.field === "lot_size");
  console.log("Lot size changes in snapshot:", lotSizeChanges.length);
  console.log("Lot size changed records:");
  lotSizeChanges.forEach((c: any, idx: number) => {
    const row = allRows.find(r => r.id === c.ipo_id);
    console.log(`  ${idx + 1}. ID: ${c.ipo_id} | Name: "${row?.company_name}" | Old: ${c.old_value} -> New: ${c.new_value} | CreatedAt: ${row?.created_at}`);
  });

  // Check all rows created_at dates distribution
  const dateCounts: Record<string, number> = {};
  allRows.forEach(r => {
    const d = (r.created_at || "").slice(0, 10);
    dateCounts[d] = (dateCounts[d] || 0) + 1;
  });
  console.log("\nRows by created_at date:", dateCounts);

  // Check the newest rows
  const sortedDesc = [...allRows].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  console.log("\n10 most recently created rows in public.ipos:");
  sortedDesc.slice(0, 10).forEach((r, idx) => {
    console.log(`  ${idx + 1}. ID: ${r.id} | Name: "${r.company_name}" | Symbol: ${r.symbol} | PubStatus: ${r.publication_status} | CreatedAt: ${r.created_at}`);
  });

  // Check what IPOs have open_date <= '2026-09-22' and close_date >= '2026-09-22'
  const today = "2026-09-22";
  const { data: openRows } = await sb.from("ipos").select("*")
    .lte("open_date", today)
    .gte("close_date", today);
  console.log(`\nIPOs open on ${today}:`, (openRows || []).length);
  (openRows || []).forEach(r => {
    console.log(`  Name: "${r.company_name}" | Symbol: ${r.symbol} | Dates: [${r.open_date} -> ${r.close_date}] | Lot: ${r.lot_size} | PriceHigh: ${r.price_band_high} | Status: ${r.status}`);
  });
}

reconcile().catch(console.error);
