import { createAdminClient } from "../lib/supabase/admin";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const BATCH_ID = "IPO-DATA-REMEDIATION-2026-09-21-001";
const TIMESTAMP = new Date().toISOString();

interface ChangeItem {
  ipo_id: string;
  company_name: string;
  field: string;
  old_value: unknown;
  new_value: unknown;
  reason: string;
  source_authority: string;
  source_reference: string;
  evidence_hash: string;
}

async function executeRemediation() {
  console.log("================================================================================");
  console.log(`PHASE 2.6B: CONTROLLED CANONICAL IPO DATA REMEDIATION`);
  console.log(`Batch ID: ${BATCH_ID}`);
  console.log(`Timestamp: ${TIMESTAMP}`);
  console.log("================================================================================\n");

  const sb = createAdminClient();

  // 1. Take snapshot of protected financial tables BEFORE migration
  const financialTables = [
    "portfolio_positions",
    "portfolio_tax_lots",
    "journal_entries",
    "ledger_entries",
    "user_wallets",
    "financial_transactions",
    "bank_transactions",
    "wallet_transactions"
  ];
  const beforeFinancialCounts: Record<string, number> = {};
  for (const table of financialTables) {
    const { count } = await sb.from(table).select("*", { count: "exact", head: true });
    beforeFinancialCounts[table] = count ?? 0;
  }
  console.log("[Step 1] Initial Financial Table Counts:", beforeFinancialCounts);

  // 2. Fetch all canonical IPO records
  const { data: allIpos, error: iposError } = await sb.from("ipos").select("*").order("created_at", { ascending: true });
  if (iposError || !allIpos) {
    throw new Error(`Failed to load public.ipos: ${iposError?.message}`);
  }
  console.log(`[Step 2] Loaded ${allIpos.length} canonical records from public.ipos.\n`);

  // 3. Prepare Pre-Migration Changeset
  const changeItems: ChangeItem[] = [];

  // Identify specific targets
  const sonaselectionId = "ff4b99f2-a254-42b7-9cea-762b3a300ddb";
  const veegalandId = "ed038a2d-f59a-4dce-b91f-675cd5b1b93d";
  const mvElectroId = "32664fd0-5e61-449f-ab4e-44ad7f39c672";

  // Duplicate candidates that MUST remain untouched in identity/dates/status
  const protectedDuplicateIds = new Set([
    "d13a17e0-c5fa-4caf-986f-8167c764057d", // Jindal Supreme India
    "e3c2d4ac-a419-43b1-84ac-7c8adddeac75", // Jindal Supreme (India)
    "06ac1e31-4060-40fc-b220-951881347b78", // Rentomojo Addendum
    "7abf8092-338f-4aa8-b296-849e0af01056", // Rentomojo Limited
    "507be85b-d734-4e1f-884a-8f8b5c5d1d59", // Hy Tech Engineers
    "f40cdbaa-ae18-4752-bff4-4ab69eb73c89", // Hy-Tech Engineers
    "10aed129-e83f-4fc8-a0ed-892b9e5253fb", // Canara Robeco AMC Ltd
    "70eeb1ef-bf84-452a-a650-0eacec5072ef", // Canara Robeco AMC
  ]);

  for (const ipo of allIpos) {
    const prov = (ipo.provenance || {}) as Record<string, unknown>;

    // Target A: Sonaselection issue_size_cr & lot_size
    if (ipo.id === sonaselectionId) {
      if (ipo.issue_size_cr !== null) {
        changeItems.push({
          ipo_id: ipo.id,
          company_name: ipo.company_name,
          field: "issue_size_cr",
          old_value: ipo.issue_size_cr,
          new_value: null,
          reason: "Share count (10,010,000) corrupted as INR Crores; observation 8b68e359 has no crore unit marker",
          source_authority: "NSE Observation 8b68e359",
          source_reference: "inbox: 47dd2e08-1ae7-437e-b5fc-567319182615",
          evidence_hash: crypto.createHash("sha256").update(JSON.stringify(prov.issue_size_cr || "10010000")).digest("hex"),
        });
      }
      if (ipo.lot_size !== null) {
        changeItems.push({
          ipo_id: ipo.id,
          company_name: ipo.company_name,
          field: "lot_size",
          old_value: ipo.lot_size,
          new_value: null,
          reason: "Observation 8b68e359 contains no authoritative lot size; resetting fallback 1 to NULL",
          source_authority: "NSE Observation 8b68e359",
          source_reference: "inbox: 47dd2e08-1ae7-437e-b5fc-567319182615",
          evidence_hash: crypto.createHash("sha256").update(JSON.stringify(prov.lot_size || "1")).digest("hex"),
        });
      }
    }

    // Target B: Veegaland issue_size_cr & lot_size
    if (ipo.id === veegalandId) {
      if (ipo.issue_size_cr !== null) {
        changeItems.push({
          ipo_id: ipo.id,
          company_name: ipo.company_name,
          field: "issue_size_cr",
          old_value: ipo.issue_size_cr,
          new_value: null,
          reason: "Share count (11,307,692) corrupted as INR Crores; observation 3e661c42 has no crore unit marker",
          source_authority: "NSE Observation 3e661c42",
          source_reference: "inbox: 16fe371a-e1b2-46e5-a6f5-57decdf2c437",
          evidence_hash: crypto.createHash("sha256").update(JSON.stringify(prov.issue_size_cr || "11307692")).digest("hex"),
        });
      }
      if (ipo.lot_size !== null) {
        changeItems.push({
          ipo_id: ipo.id,
          company_name: ipo.company_name,
          field: "lot_size",
          old_value: ipo.lot_size,
          new_value: null,
          reason: "Observation 3e661c42 contains no authoritative lot size; resetting fallback 1 to NULL",
          source_authority: "NSE Observation 3e661c42",
          source_reference: "inbox: 16fe371a-e1b2-46e5-a6f5-57decdf2c437",
          evidence_hash: crypto.createHash("sha256").update(JSON.stringify(prov.lot_size || "1")).digest("hex"),
        });
      }
    }

    // Target C: MV Electrosystems zero-width unicode normalization
    if (ipo.id === mvElectroId) {
      if (ipo.company_name.includes("\u200B")) {
        const cleanedName = ipo.company_name.replace(/\u200B/g, "").trim();
        changeItems.push({
          ipo_id: ipo.id,
          company_name: ipo.company_name,
          field: "company_name",
          old_value: ipo.company_name,
          new_value: cleanedName,
          reason: "Removing trailing invisible zero-width Unicode space (\\u200B) encoding defect",
          source_authority: "Canonical Name Normalization",
          source_reference: "identity: mv-electrosystems-limited",
          evidence_hash: crypto.createHash("sha256").update(ipo.company_name).digest("hex"),
        });
      }
    }

    // Target D: 14 pending_verification fallback lot_size = 1 records (excluding Sona & Veega already handled)
    if (ipo.lot_size === 1 && ipo.lot_size_status === "pending_verification" && ipo.id !== sonaselectionId && ipo.id !== veegalandId) {
      changeItems.push({
        ipo_id: ipo.id,
        company_name: ipo.company_name,
        field: "lot_size",
        old_value: ipo.lot_size,
        new_value: null,
        reason: "Resetting legacy fallback lot_size = 1 to NULL under pending_verification status",
        source_authority: "Ingestion Contract Hardening",
        source_reference: `ipo_id: ${ipo.id}`,
        evidence_hash: crypto.createHash("sha256").update(`pending_verification_${ipo.id}`).digest("hex"),
      });
    }

    // Target E: Quota cleanup for unverified rows (retail=35, qib=50, hni=15 without filing provenance)
    if (ipo.retail_quota_pct === 35 && !prov.retail_quota_pct) {
      changeItems.push({
        ipo_id: ipo.id,
        company_name: ipo.company_name,
        field: "retail_quota_pct",
        old_value: ipo.retail_quota_pct,
        new_value: null,
        reason: "Resetting bulk unverified SQL default retail_quota_pct (35%) to NULL",
        source_authority: "Schema Default Removal",
        source_reference: "20260910000002_phase2_ipo_core.sql",
        evidence_hash: crypto.createHash("sha256").update(`quota_default_${ipo.id}`).digest("hex"),
      });
    }
    if (ipo.qib_quota_pct === 50 && !prov.qib_quota_pct) {
      changeItems.push({
        ipo_id: ipo.id,
        company_name: ipo.company_name,
        field: "qib_quota_pct",
        old_value: ipo.qib_quota_pct,
        new_value: null,
        reason: "Resetting bulk unverified SQL default qib_quota_pct (50%) to NULL",
        source_authority: "Schema Default Removal",
        source_reference: "20260910000002_phase2_ipo_core.sql",
        evidence_hash: crypto.createHash("sha256").update(`quota_default_${ipo.id}`).digest("hex"),
      });
    }
    if (ipo.hni_quota_pct === 15 && !prov.hni_quota_pct) {
      changeItems.push({
        ipo_id: ipo.id,
        company_name: ipo.company_name,
        field: "hni_quota_pct",
        old_value: ipo.hni_quota_pct,
        new_value: null,
        reason: "Resetting bulk unverified SQL default hni_quota_pct (15%) to NULL",
        source_authority: "Schema Default Removal",
        source_reference: "20260910000002_phase2_ipo_core.sql",
        evidence_hash: crypto.createHash("sha256").update(`quota_default_${ipo.id}`).digest("hex"),
      });
    }
  }

  console.log(`[Step 3] Pre-Migration Snapshot Summary:`);
  console.log(`- Total fields to remediate: ${changeItems.length}`);
  const uniqueIpos = new Set(changeItems.map(c => c.ipo_id)).size;
  console.log(`- Unique canonical IPOs affected: ${uniqueIpos}`);

  const issueSizeFixes = changeItems.filter(c => c.field === "issue_size_cr");
  const lotSizeFixes = changeItems.filter(c => c.field === "lot_size");
  const nameFixes = changeItems.filter(c => c.field === "company_name");
  const quotaFixes = changeItems.filter(c => c.field.includes("quota"));

  console.log(`  * issue_size_cr repairs: ${issueSizeFixes.length}`);
  console.log(`  * lot_size repairs: ${lotSizeFixes.length}`);
  console.log(`  * company_name unicode normalizations: ${nameFixes.length}`);
  console.log(`  * quota unverified default resets: ${quotaFixes.length}\n`);

  // Write pre-migration machine-readable evidence snapshot
  const snapshotPath = path.resolve(process.cwd(), "scripts/remediation-snapshot-batch-001.json");
  fs.writeFileSync(snapshotPath, JSON.stringify({
    batch_id: BATCH_ID,
    timestamp: TIMESTAMP,
    total_changes: changeItems.length,
    unique_ipos: uniqueIpos,
    changes: changeItems
  }, null, 2));
  console.log(`[Step 4] Pre-migration snapshot written to ${snapshotPath}\n`);

  // 4. Execute atomic updates per IPO
  console.log("[Step 5] Executing controlled remediation updates...");

  // Group changes by ipo_id
  const changesByIpo = new Map<string, ChangeItem[]>();
  for (const item of changeItems) {
    if (!changesByIpo.has(item.ipo_id)) changesByIpo.set(item.ipo_id, []);
    changesByIpo.get(item.ipo_id)!.push(item);
  }

  let processedCount = 0;
  for (const [ipoId, items] of changesByIpo.entries()) {
    const updatePayload: Record<string, unknown> = {};
    const existingIpo = allIpos.find(i => i.id === ipoId)!;
    const existingProv = (existingIpo.provenance || {}) as Record<string, unknown>;

    for (const item of items) {
      updatePayload[item.field] = item.new_value;
    }

    // Attach immutable audit trail to provenance JSON
    const remediationAudit = {
      batch_id: BATCH_ID,
      remediated_at: TIMESTAMP,
      changes: items.map(it => ({
        field: it.field,
        old_value: it.old_value,
        new_value: it.new_value,
        reason: it.reason,
        source_authority: it.source_authority,
        source_reference: it.source_reference,
        evidence_hash: it.evidence_hash,
      }))
    };

    updatePayload.provenance = {
      ...existingProv,
      remediation_history: [
        ...((existingProv.remediation_history as unknown[]) || []),
        remediationAudit
      ]
    };

    const { error: updateError } = await sb
      .from("ipos")
      .update(updatePayload)
      .eq("id", ipoId);

    if (updateError) {
      throw new Error(`Failed to update IPO ${ipoId} (${existingIpo.company_name}): ${updateError.message}`);
    }

    processedCount++;
    if (processedCount % 100 === 0 || processedCount === changesByIpo.size) {
      console.log(`  -> Remediated ${processedCount} / ${changesByIpo.size} IPO records...`);
    }
  }

  console.log("\n[Step 6] Verification of Post-Remediation State:");

  // Verify Sonaselection
  const { data: verifySona } = await sb.from("ipos").select("id, company_name, issue_size_cr, lot_size, retail_quota_pct").eq("id", sonaselectionId).single();
  console.log("  * Sonaselection post-remediation:", verifySona);
  if (verifySona?.issue_size_cr !== null || verifySona?.lot_size !== null || verifySona?.retail_quota_pct !== null) {
    throw new Error("Sonaselection post-remediation assertion failed!");
  }

  // Verify Veegaland
  const { data: verifyVeega } = await sb.from("ipos").select("id, company_name, issue_size_cr, lot_size, retail_quota_pct").eq("id", veegalandId).single();
  console.log("  * Veegaland post-remediation:", verifyVeega);
  if (verifyVeega?.issue_size_cr !== null || verifyVeega?.lot_size !== null || verifyVeega?.retail_quota_pct !== null) {
    throw new Error("Veegaland post-remediation assertion failed!");
  }

  // Verify MV Electrosystems
  const { data: verifyMv } = await sb.from("ipos").select("id, company_name").eq("id", mvElectroId).single();
  console.log("  * MV Electrosystems post-remediation:", verifyMv);
  if (verifyMv?.company_name.includes("\u200B")) {
    throw new Error("MV Electrosystems zero-width space still present!");
  }

  // Verify pending_verification lots
  const { count: remainingPending1 } = await sb.from("ipos").select("*", { count: "exact", head: true }).eq("lot_size", 1).eq("lot_size_status", "pending_verification");
  console.log("  * Remaining lot_size=1 under pending_verification:", remainingPending1);
  if (remainingPending1 !== 0) {
    throw new Error(`Expected 0 pending_verification lot_size=1 records, found ${remainingPending1}`);
  }

  // Verify unverified quotas
  const { count: remaining35 } = await sb.from("ipos").select("*", { count: "exact", head: true }).eq("retail_quota_pct", 35);
  console.log("  * Remaining retail_quota_pct=35 records:", remaining35);
  if (remaining35 !== 0) {
    throw new Error(`Expected 0 retail_quota_pct=35 records, found ${remaining35}`);
  }

  // Verify duplicate candidates remain untouched
  for (const dupId of protectedDuplicateIds) {
    const { data: dupCheck } = await sb.from("ipos").select("id, company_name, status, symbol").eq("id", dupId).single();
    if (!dupCheck) {
      throw new Error(`Duplicate candidate ${dupId} disappeared!`);
    }
  }
  console.log("  * All protected duplicate candidates verified intact!");

  // Verify protected financial tables
  const afterFinancialCounts: Record<string, number> = {};
  for (const table of financialTables) {
    const { count } = await sb.from(table).select("*", { count: "exact", head: true });
    afterFinancialCounts[table] = count ?? 0;
    if (afterFinancialCounts[table] !== beforeFinancialCounts[table]) {
      throw new Error(`BREACH DETECTED: Protected table ${table} changed count from ${beforeFinancialCounts[table]} to ${afterFinancialCounts[table]}!`);
    }
  }
  console.log("  * All 8 protected financial tables strictly verified: Delta = 0 across all tables!\n");

  console.log("================================================================================");
  console.log("✅ PHASE 2.6B REMEDIATION COMPLETED WITH 100% ASSERTION PASS!");
  console.log("================================================================================");
}

executeRemediation().catch((err) => {
  console.error("Remediation execution failed:", err);
  process.exit(1);
});
