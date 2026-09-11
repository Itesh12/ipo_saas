/**
 * scripts/verify-live-phase8.ts
 *
 * Phase 8 Admin Intelligence, Work Queue, Audit Explorer & Hardened Governance
 * Live Supabase Verification Suite
 */

import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { sanitizeAuditPayload } from "../features/admin/services/auditLoggingService";
import { sanitizeWorkItemMetadata } from "../features/admin/services/adminWorkQueueService";

const envContent = fs.readFileSync(".env.local", "utf-8");
const envVars: Record<string, string> = {};
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith("#")) {
    const idx = trimmed.indexOf("=");
    if (idx > -1) {
      envVars[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
  }
}

const supabaseUrl = envVars["NEXT_PUBLIC_SUPABASE_URL"];
const anonKey = envVars["NEXT_PUBLIC_SUPABASE_ANON_KEY"];
const serviceKey = envVars["SUPABASE_SERVICE_ROLE_KEY"];

const adminClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
const anonClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });

let passedChecks = 0;
let totalChecks = 0;

function assertCheck(name: string, condition: boolean, detail?: string) {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  ✅ PASS: ${name}`);
    if (detail) console.log(`     └─ ${detail}`);
  } else {
    console.error(`  ❌ FAIL: ${name}`);
    if (detail) console.error(`     └─ ${detail}`);
    process.exitCode = 1;
  }
}

async function runVerification() {
  console.log("==============================================================================");
  console.log("PHASE 8 LIVE SUPABASE DEEP VERIFICATION REPORT");
  console.log("Supabase Host:", supabaseUrl);
  console.log("Timestamp:", new Date().toISOString());
  console.log("==============================================================================\n");

  // 1. SCHEMA EXISTENCE
  console.log("1. CHECKING PHASE 8 TABLES & SCHEMAS ON LIVE DATABASE:");
  const { error: wiErr } = await adminClient.from("admin_work_items").select("id").limit(1);
  assertCheck("admin_work_items table exists and accessible", !wiErr, wiErr?.message);

  const { error: histErr } = await adminClient.from("admin_work_item_history").select("id").limit(1);
  assertCheck("admin_work_item_history table exists and accessible", !histErr, histErr?.message);

  const { error: auditErr } = await adminClient.from("audit_logs").select("id").limit(1);
  assertCheck("audit_logs table exists and accessible", !auditErr, auditErr?.message);

  // 2. AUDIT LOG IMMUTABILITY & ACCESS RESTRICTION
  console.log("\n2. VERIFYING AUDIT LOG IMMUTABILITY & PRIVILEGE ENFORCEMENT:");
  // Anon client direct insert must be rejected
  const { error: anonInsertErr } = await anonClient.from("audit_logs").insert({
    action: "hacker_tamper",
    resource_type: "ipos",
    resource_id: "00000000-0000-0000-0000-000000000000",
  } as any);
  assertCheck(
    "Direct INSERT on audit_logs by anonymous client is strictly rejected",
    !!anonInsertErr,
    `Rejected with code: ${anonInsertErr?.code} (${anonInsertErr?.message})`
  );

  // Attempt to UPDATE or DELETE an audit log row must be rejected by trigger
  const testAuditId = crypto.randomUUID();
  const { error: adminInsertAuditErr } = await adminClient.from("audit_logs").insert({
    id: testAuditId,
    action: "system_verification_test",
    resource_type: "system",
    resource_id: "test",
    actor_type: "system",
  } as any);

  if (!adminInsertAuditErr) {
    const { error: updateAuditErr } = await adminClient
      .from("audit_logs")
      .update({ action: "tampered_action" } as any)
      .eq("id", testAuditId);
    assertCheck(
      "UPDATE on audit_logs is rejected by DB trigger trg_audit_logs_immutable",
      !!updateAuditErr,
      `Trigger blocked with: ${updateAuditErr?.message}`
    );

    const { error: deleteAuditErr } = await adminClient
      .from("audit_logs")
      .delete()
      .eq("id", testAuditId);
    assertCheck(
      "DELETE on audit_logs is rejected by DB trigger trg_audit_logs_immutable",
      !!deleteAuditErr,
      `Trigger blocked with: ${deleteAuditErr?.message}`
    );
  } else {
    console.log("  ⚠️ Note: Audit insert restricted:", adminInsertAuditErr.message);
  }

  // 3. WORK ITEM CREATION & AUTO-HISTORY GENERATION
  console.log("\n3. VERIFYING WORK ITEM LIFECYCLE, TRIGGER STATE MACHINE & AUTO-HISTORY:");
  const testFingerprint = `live_verify_test_${Date.now()}`;
  const { data: createdItem, error: createWiErr } = await adminClient
    .from("admin_work_items")
    .insert({
      fingerprint: testFingerprint,
      severity: "medium",
      category: "system_health",
      entity_type: "system",
      entity_id: "node_1",
      title: "Live Verification Work Item",
      description: "Testing state machine and automatic history tracking",
      metadata: { live_test: true },
      status: "open",
    } as any)
    .select("*")
    .single();

  assertCheck("admin_work_items INSERT succeeds", !!createdItem && !createWiErr, createWiErr?.message);

  if (createdItem) {
    const workItemId = (createdItem as any).id;

    // Verify auto-history created on INSERT
    const { data: histOnCreate } = await adminClient
      .from("admin_work_item_history")
      .select("*")
      .eq("work_item_id", workItemId);

    assertCheck(
      "Automatic history entry generated on work-item creation (action = 'created')",
      Boolean(histOnCreate && histOnCreate.length > 0 && histOnCreate[0].action === "created"),
      `Entries found: ${histOnCreate?.length}, Action: ${histOnCreate?.[0]?.action}`
    );

    // Transition: open -> investigating
    const { data: investigatingItem, error: invErr } = await adminClient
      .from("admin_work_items")
      .update({
        status: "investigating",
      } as any)
      .eq("id", workItemId)
      .select("*")
      .single();

    assertCheck(
      "Transition open -> investigating succeeds",
      !invErr && (investigatingItem as any)?.status === "investigating",
      invErr?.message
    );

    // Transition: investigating -> resolved (terminal)
    const { data: resolvedItem, error: resErr } = await adminClient
      .from("admin_work_items")
      .update({
        status: "resolved",
        resolution_notes: "Resolved cleanly during live verification",
      } as any)
      .eq("id", workItemId)
      .select("*")
      .single();

    assertCheck(
      "Transition investigating -> resolved succeeds and manages resolved_at",
      !resErr && (resolvedItem as any)?.status === "resolved" && !!(resolvedItem as any)?.resolved_at,
      resErr?.message
    );

    // Attempt illegal transition: resolved -> investigating (terminal can only reopen to open!)
    const { error: illegalTransitionErr } = await adminClient
      .from("admin_work_items")
      .update({
        status: "investigating",
      } as any)
      .eq("id", workItemId);

    assertCheck(
      "Illegal transition resolved -> investigating is rejected by DB trigger",
      !!illegalTransitionErr,
      `Rejected with: ${illegalTransitionErr?.message}`
    );

    // Attempt reopening without notes: resolved -> open (must be rejected!)
    const { error: reopenNoNotesErr } = await adminClient
      .from("admin_work_items")
      .update({
        status: "open",
        resolution_notes: "Resolved cleanly during live verification", // unchanged notes
      } as any)
      .eq("id", workItemId);

    assertCheck(
      "Reopening resolved item without updated notes is rejected by DB trigger",
      !!reopenNoNotesErr,
      `Rejected with: ${reopenNoNotesErr?.message}`
    );

    // Valid reopening: resolved -> open with new notes
    const { data: reopenedItem, error: reopenOkErr } = await adminClient
      .from("admin_work_items")
      .update({
        status: "open",
        resolution_notes: "Reopened due to verification check",
      } as any)
      .eq("id", workItemId)
      .select("*")
      .single();

    assertCheck(
      "Reopening resolved -> open with explicit notes succeeds and clears resolved_at",
      !reopenOkErr && (reopenedItem as any)?.status === "open" && (reopenedItem as any)?.resolved_at === null,
      reopenOkErr?.message
    );

    // Verify history recorded 'reopened'
    const { data: allHistory } = await adminClient
      .from("admin_work_item_history")
      .select("*")
      .eq("work_item_id", workItemId)
      .order("created_at", { ascending: true });

    const reopenedHistoryEntry = allHistory?.find((h: any) => h.action === "reopened");
    assertCheck(
      "Work-item reopening generated unmistakable immutable 'reopened' history event",
      !!reopenedHistoryEntry,
      `History entries: ${allHistory?.map((h: any) => h.action).join(" -> ")}`
    );

    // 4. HISTORY IMMUTABILITY & DELETION PROTECTION
    console.log("\n4. VERIFYING WORK ITEM & HISTORY DELETION GUARDS (GUARDRAIL 2 & 4):");
    // Attempt physical deletion on work item
    const { error: deleteWiErr } = await adminClient
      .from("admin_work_items")
      .delete()
      .eq("id", workItemId);

    assertCheck(
      "Physical DELETE on admin_work_items is permanently rejected by DB trigger",
      !!deleteWiErr,
      `Trigger blocked with: ${deleteWiErr?.message}`
    );

    // Attempt UPDATE or DELETE on history
    if (allHistory && allHistory.length > 0) {
      const histId = allHistory[0].id;
      const { error: updateHistErr } = await adminClient
        .from("admin_work_item_history")
        .update({ notes: "tampered note" } as any)
        .eq("id", histId);

      assertCheck(
        "UPDATE on admin_work_item_history is rejected by DB trigger trg_work_item_history_immutable",
        !!updateHistErr,
        `Trigger blocked with: ${updateHistErr?.message}`
      );

      const { error: deleteHistErr } = await adminClient
        .from("admin_work_item_history")
        .delete()
        .eq("id", histId);

      assertCheck(
        "DELETE on admin_work_item_history is rejected by DB trigger trg_work_item_history_immutable",
        !!deleteHistErr,
        `Trigger blocked with: ${deleteHistErr?.message}`
      );
    }

    // 5. ACTIVE-ANOMALY DEDUPLICATION & RECURRENCE
    console.log("\n5. VERIFYING ACTIVE FINGERPRINT PARTIAL UNIQUE INDEX & RECURRENCE:");
    // Work item is currently 'open'. Attempt to insert ANOTHER active work item with identical fingerprint
    const { error: dupActiveErr } = await adminClient
      .from("admin_work_items")
      .insert({
        fingerprint: testFingerprint,
        severity: "high",
        category: "system_health",
        entity_type: "system",
        entity_id: "node_1",
        title: "Duplicate Active Item",
        description: "Should violate active partial index",
        status: "open",
      } as any);

    assertCheck(
      "Active-anomaly partial unique index (idx_admin_work_items_active_fingerprint) blocks duplicate active item",
      !!dupActiveErr,
      `Index prevented duplicate with: ${dupActiveErr?.code} (${dupActiveErr?.message})`
    );

    // Resolve the item
    await adminClient
      .from("admin_work_items")
      .update({
        status: "resolved",
        resolution_notes: "Permanently resolved for recurrence test",
      } as any)
      .eq("id", workItemId);

    // Once resolved, inserting a NEW work item with the same fingerprint MUST succeed (anomaly recurrence!)
    const { data: recurredItem, error: recurErr } = await adminClient
      .from("admin_work_items")
      .insert({
        fingerprint: testFingerprint,
        severity: "high",
        category: "system_health",
        entity_type: "system",
        entity_id: "node_1",
        title: "Recurring Anomaly Item",
        description: "Created after prior item resolved",
        status: "open",
      } as any)
      .select("*")
      .single();

    assertCheck(
      "Anomaly recurrence after resolution successfully creates a new work item with same fingerprint",
      !recurErr && !!recurredItem,
      recurErr?.message || `New Item ID: ${(recurredItem as any)?.id}`
    );

    // Clean up recurrence item by resolving it
    if (recurredItem) {
      await adminClient
        .from("admin_work_items")
        .update({
          status: "resolved",
          resolution_notes: "Cleanup verification test item",
        } as any)
        .eq("id", (recurredItem as any).id);
    }
  }

  // 6. CONTROLLED RPC ACCESS & ROLE ISOLATION
  console.log("\n6. VERIFYING CONTROLLED ADMINISTRATIVE RPC SECURITY & ISOLATION:");
  // Anonymous caller must be rejected from get_admin_system_health
  const { error: anonHealthErr } = await anonClient.rpc("get_admin_system_health");
  assertCheck(
    "Anonymous caller is rejected from get_admin_system_health()",
    !!anonHealthErr,
    `Blocked with: ${anonHealthErr?.message}`
  );

  // Anonymous caller must be rejected from get_ipo_data_quality_report
  const { error: anonDqErr } = await anonClient.rpc("get_ipo_data_quality_report");
  assertCheck(
    "Anonymous caller is rejected from get_ipo_data_quality_report()",
    !!anonDqErr,
    `Blocked with: ${anonDqErr?.message}`
  );

  // 7. PII & METADATA SANITIZATION VERIFICATION
  console.log("\n7. VERIFYING STRICT PII & DIAGNOSTIC METADATA SANITIZATION (GUARDRAIL 10):");
  const samplePayload = {
    pan: "ABCDE1234F",
    account_number: "987654321098",
    upi_id: "trader@okaxis",
    password: "CleartextPassword999",
    otp: "654321",
    api_key: "ak_live_supersecretkey",
    metadata: {
      client_secret: "secret_value",
      nested_pan: "XYZAB5678C",
    },
  };

  const sanitizedAudit = sanitizeAuditPayload(samplePayload) as any;
  assertCheck("sanitizeAuditPayload masks PAN", sanitizedAudit.pan === "XXXXX1234F", sanitizedAudit.pan);
  assertCheck("sanitizeAuditPayload masks Bank Account", sanitizedAudit.account_number === "XXXXXXXX1098", sanitizedAudit.account_number);
  assertCheck("sanitizeAuditPayload masks UPI", sanitizedAudit.upi_id === "tr***@okaxis", sanitizedAudit.upi_id);
  assertCheck("sanitizeAuditPayload redacts Password", sanitizedAudit.password === "[REDACTED]", sanitizedAudit.password);
  assertCheck("sanitizeAuditPayload redacts OTP", sanitizedAudit.otp === "[REDACTED]", sanitizedAudit.otp);
  assertCheck("sanitizeAuditPayload redacts API Key", sanitizedAudit.api_key === "[REDACTED]", sanitizedAudit.api_key);
  assertCheck("sanitizeAuditPayload redacts Nested Secret", sanitizedAudit.metadata.client_secret === "[REDACTED]", sanitizedAudit.metadata.client_secret);
  assertCheck("sanitizeAuditPayload masks Nested PAN", sanitizedAudit.metadata.nested_pan === "XXXXX5678C", sanitizedAudit.metadata.nested_pan);

  const cleanMeta = sanitizeWorkItemMetadata({
    api_key: "prohibited_key",
    otp: "123456",
    pan: "ABCDE1234F",
    safe_stat: 100,
  });
  assertCheck("sanitizeWorkItemMetadata redacts API Key", cleanMeta.api_key === "[PROHIBITED_CREDENTIAL_REDACTED]", cleanMeta.api_key as string);
  assertCheck("sanitizeWorkItemMetadata redacts OTP", cleanMeta.otp === "[PROHIBITED_CREDENTIAL_REDACTED]", cleanMeta.otp as string);
  assertCheck("sanitizeWorkItemMetadata masks PAN", cleanMeta.pan === "XXXXX1234F", cleanMeta.pan as string);
  assertCheck("sanitizeWorkItemMetadata preserves safe telemetry", cleanMeta.safe_stat === 100, String(cleanMeta.safe_stat));

  // 8. ZERO PHASE 9 EXTERNAL DEPENDENCY CHECK
  console.log("\n8. VERIFYING ZERO PHASE 9 EXTERNAL INTEGRATION LEAKS:");
  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf-8"));
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
  const prohibitedPhase9Libs = ["twilio", "@sendgrid/mail", "@aws-sdk/client-ses", "firebase-admin", "whatsapp", "upstox", "zerodha"];
  const leaked = prohibitedPhase9Libs.filter((lib) => !!deps[lib]);
  assertCheck(
    "Zero Phase 9 external provider SDKs or broker APIs in dependencies",
    leaked.length === 0,
    leaked.length === 0 ? "Strictly isolated" : `Leaked: ${leaked.join(", ")}`
  );

  console.log("\n==============================================================================");
  console.log(`PHASE 8 LIVE VERIFICATION COMPLETE: ${passedChecks}/${totalChecks} CHECKS PASSED`);
  console.log("==============================================================================");

  process.exit(passedChecks === totalChecks ? 0 : 1);
}

runVerification().catch((err) => {
  console.error("Live verification fatal error:", err);
  process.exit(1);
});
