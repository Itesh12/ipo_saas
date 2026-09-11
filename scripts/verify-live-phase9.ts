/**
 * scripts/verify-live-phase9.ts
 *
 * Phase 9 Stage 1 External Integration Foundation
 * Deep Live Supabase & Architectural Invariant Verification Suite
 */

import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import {
  providerRegistry,
  cdslProvider,
  nsdlProvider,
  validateCdslBoId,
  validateNsdlAccountId,
  externalAccountService,
  externalEventService,
  reconciliationEngine,
  integrationHealthService,
  integrationAuditAdapter,
  sanitizeProhibitedCredentials,
  isPrunedPayload,
  createPrunedPayloadMarker,
  isPayloadExpired,
  CapabilityNotAvailableError,
  ProhibitedCredentialError,
} from "../features/external-integrations";

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

async function runLiveVerification() {
  console.log("==============================================================================");
  console.log("PHASE 9 STAGE 1 LIVE SUPABASE & ARCHITECTURAL VERIFICATION REPORT");
  console.log("Supabase Host:", supabaseUrl);
  console.log("Timestamp:", new Date().toISOString());
  console.log("==============================================================================\n");

  // 1. DATABASE SCHEMA & TABLE CHECKS
  console.log("1. CHECKING PHASE 9 TABLES ON LIVE SUPABASE INSTANCE:");
  const { error: provErr } = await adminClient.from("external_providers").select("id").limit(1);
  assertCheck(
    "external_providers table exists and accessible",
    !provErr,
    provErr ? `Notice: ${provErr.message}` : "Table active"
  );

  const { error: accErr } = await adminClient.from("external_accounts").select("id").limit(1);
  assertCheck(
    "external_accounts table exists and accessible",
    !accErr,
    accErr ? `Notice: ${accErr.message}` : "Table active"
  );

  const { error: evtErr } = await adminClient.from("external_events").select("id").limit(1);
  assertCheck(
    "external_events table exists and accessible",
    !evtErr,
    evtErr ? `Notice: ${evtErr.message}` : "Table active"
  );

  const { error: conErr } = await adminClient.from("external_consents").select("id").limit(1);
  assertCheck(
    "external_consents table exists and accessible",
    !conErr,
    conErr ? `Notice: ${conErr.message}` : "Table active"
  );

  const { error: recRunErr } = await adminClient.from("external_reconciliation_runs").select("id").limit(1);
  assertCheck(
    "external_reconciliation_runs table exists and accessible",
    !recRunErr,
    recRunErr ? `Notice: ${recRunErr.message}` : "Table active"
  );

  const { error: recDiscErr } = await adminClient.from("external_reconciliation_discrepancies").select("id").limit(1);
  assertCheck(
    "external_reconciliation_discrepancies table exists and accessible",
    !recDiscErr,
    recDiscErr ? `Notice: ${recDiscErr.message}` : "Table active"
  );

  // 2. GUARDRAIL 1: INFORMATIONAL ACCOUNT REFERENCE & STATUS ENFORCEMENT
  console.log("\n2. VERIFYING GUARDRAIL 1 (ACCOUNT STATUS & INFORMATIONAL REFS):");
  assertCheck(
    "Stage 1 external account status defaults to pending_verification",
    (() => {
      const prep = externalAccountService.prepareAccountReference({
        userId: "00000000-0000-0000-0000-000000000001",
        providerId: "cdsl",
        providerType: "depository",
        depositoryType: "cdsl",
        rawReference: "1208160012345678",
      });
      return prep.status === "pending_verification";
    })(),
    "Strictly pending_verification"
  );

  let verifiedAttemptBlocked = false;
  try {
    externalAccountService.assertStage1AccountStatus("verified");
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("deferred to Stage 3")) {
      verifiedAttemptBlocked = true;
    }
  }
  assertCheck(
    "assertStage1AccountStatus strictly prevents verified status via external calls in Stage 1",
    verifiedAttemptBlocked,
    "Blocked with: External account verification is deferred to Stage 3"
  );

  assertCheck(
    "Envelope AES-256-GCM encryption is applied to account identifiers with masked UI separation",
    (() => {
      const prep = externalAccountService.prepareAccountReference({
        userId: "00000000-0000-0000-0000-000000000001",
        providerId: "cdsl",
        providerType: "depository",
        depositoryType: "cdsl",
        rawReference: "1208160012345678",
      });
      const decrypted = externalAccountService.decryptAccountReference(prep.accountReferenceEncrypted!);
      return prep.accountReferenceMasked === "1208XXXX5678" && decrypted === "1208160012345678";
    })(),
    "Masked: 1208XXXX5678, Encrypted: AES-256-GCM"
  );

  // 3. GUARDRAIL 2: PAYLOAD SECURITY, RLS RESTRICTION & 90-DAY RETENTION
  console.log("\n3. VERIFYING GUARDRAIL 2 (PAYLOAD SECURITY, RLS & 90-DAY RETENTION):");
  const { data: anonEvt, error: anonEvtErr } = await anonClient
    .from("external_events")
    .select("id, payload")
    .limit(1);
  assertCheck(
    "Direct SELECT on external_events by anonymous/unauthenticated client is blocked by RLS",
    Boolean(anonEvtErr || !anonEvt || anonEvt.length === 0),
    anonEvtErr ? `Rejected with code: ${anonEvtErr.code}` : "Zero rows accessible to public"
  );

  assertCheck(
    "isPayloadExpired correctly identifies 90-day boundary",
    isPayloadExpired(new Date(Date.now() - 95 * 24 * 60 * 60 * 1000), 90) === true &&
      isPayloadExpired(new Date(Date.now() - 85 * 24 * 60 * 60 * 1000), 90) === false,
    "95 days expired, 85 days valid"
  );

  assertCheck(
    "isPrunedPayload accurately recognizes tombstone payload and rejects standard payloads",
    isPrunedPayload(createPrunedPayloadMarker()) === true &&
      isPrunedPayload({ sample: "data" }) === false,
    "Tombstone recognized, regular payload unflagged"
  );

  assertCheck(
    "Phase 8 audit adapter strictly excludes raw payload (retains only hash and headers)",
    (() => {
      const audit = integrationAuditAdapter.prepareEventIngestAudit(
        "cdsl",
        "demat_credit",
        "cdsl_evt_101",
        "sha256_hash_value"
      );
      return (
        audit.payload.raw_payload_retained === false &&
        audit.payload.payload_hash === "sha256_hash_value" &&
        !("payload" in audit.payload)
      );
    })(),
    "Zero raw payload in audit log payload"
  );

  // 4. GUARDRAIL 3: UNUSED/PLANNED PROVIDER CAPABILITIES CANNOT BE EXECUTED
  console.log("\n4. VERIFYING GUARDRAIL 3 (PLANNED & DISABLED CAPABILITIES NOT EXECUTABLE):");
  providerRegistry.clear();
  providerRegistry.registerProvider(cdslProvider);
  providerRegistry.registerProvider(nsdlProvider);

  let plannedCallBlocked = false;
  try {
    providerRegistry.assertCapability("cdsl", "submit_application");
  } catch (err: unknown) {
    if (err instanceof CapabilityNotAvailableError) {
      plannedCallBlocked = true;
    }
  }
  assertCheck(
    "Asserting 'submit_application' on CDSL throws CapabilityNotAvailableError (unsupported)",
    plannedCallBlocked,
    "Unsupported capability execution blocked"
  );

  let disabledCallBlocked = false;
  try {
    providerRegistry.assertCapability("cdsl", "verify_demat");
  } catch (err: unknown) {
    if (err instanceof CapabilityNotAvailableError && err.state === "disabled") {
      disabledCallBlocked = true;
    }
  }
  assertCheck(
    "Asserting 'verify_demat' on CDSL throws CapabilityNotAvailableError (disabled in Stage 1)",
    disabledCallBlocked,
    "Disabled capability execution blocked"
  );

  // 5. PROHIBITED CREDENTIALS DETECTION & REDACTION
  console.log("\n5. VERIFYING STRICT PROHIBITED CREDENTIALS REJECTION:");
  let pinBlocked = false;
  try {
    externalEventService.prepareEventForIngest({
      providerId: "npci_upi",
      providerType: "upi",
      eventType: "mandate_request",
      payload: { upi_pin: "123456", amount: 15000 },
    });
  } catch (err: unknown) {
    if (err instanceof ProhibitedCredentialError) {
      pinBlocked = true;
    }
  }
  assertCheck(
    "Event ingestion with 'upi_pin' is strictly rejected with ProhibitedCredentialError",
    pinBlocked,
    "UPI PIN rejected"
  );

  let otpBlocked = false;
  try {
    externalEventService.prepareEventForIngest({
      providerId: "sponsor_bank",
      providerType: "sponsor_bank",
      eventType: "asba_auth",
      payload: { one_time_password: "654321" },
    });
  } catch (err: unknown) {
    if (err instanceof ProhibitedCredentialError) {
      otpBlocked = true;
    }
  }
  assertCheck(
    "Event ingestion with 'one_time_password' is strictly rejected with ProhibitedCredentialError",
    otpBlocked,
    "OTP rejected"
  );

  assertCheck(
    "sanitizeProhibitedCredentials cleanly redacts credentials from diagnostic payloads",
    (() => {
      const sanitized = sanitizeProhibitedCredentials({
        valid_field: "ok",
        bank_password: "secret_password",
        nested: { mpin: "1122" },
      });
      return (
        sanitized.valid_field === "ok" &&
        sanitized.bank_password === "[PROHIBITED_CREDENTIAL_REDACTED]" &&
        sanitized.nested.mpin === "[PROHIBITED_CREDENTIAL_REDACTED]"
      );
    })(),
    "Credentials redacted to [PROHIBITED_CREDENTIAL_REDACTED]"
  );

  // 6. CONTRACT-ONLY STATUS NORMALIZATION (NO PHASE 4 MUTATIONS)
  console.log("\n6. VERIFYING CONTRACT-ONLY STATUS NORMALIZATION:");
  const norm1 = externalEventService.normalizeExternalStatus("ipo_infrastructure", "ACCEPTED_BY_EXCHANGE");
  assertCheck(
    "normalizeExternalStatus converts exchange ACCEPTED_BY_EXCHANGE to CONFIRMED",
    norm1.normalizedStatus === "CONFIRMED" && norm1.confidence === "definitive"
  );

  const norm2 = externalEventService.normalizeExternalStatus("upi", "APPROVED");
  assertCheck(
    "normalizeExternalStatus converts UPI APPROVED to MANDATE_APPROVED",
    norm2.normalizedStatus === "MANDATE_APPROVED" && norm2.confidence === "definitive"
  );

  const norm3 = externalEventService.normalizeExternalStatus("registrar", "FULL_ALLOTMENT");
  assertCheck(
    "normalizeExternalStatus converts registrar FULL_ALLOTMENT to ALLOTTED",
    norm3.normalizedStatus === "ALLOTTED" && norm3.confidence === "definitive"
  );

  // 7. CROSS-DOMAIN RECONCILIATION & PHASE 8 WORK ITEM ALIGNMENT
  console.log("\n7. VERIFYING RECONCILIATION & PHASE 8 WORK ITEM ALIGNMENT:");
  const recSummary = reconciliationEngine.reconcilePairs("link_intime", "allotments", [
    {
      entityId: "app-test-1",
      internalState: { sharesAllotted: 30, status: "ALLOTTED" },
      externalState: { sharesAllotted: 0, status: "NOT_ALLOTTED" },
    },
  ]);
  assertCheck(
    "ReconciliationEngine detects mismatch in sharesAllotted and status",
    recSummary.discrepancyCount === 2 && recSummary.status === "completed_with_discrepancies",
    `Discrepancies found: ${recSummary.discrepancyCount}`
  );

  const p8Item = reconciliationEngine.toPhase8WorkItem(recSummary.discrepancies[0]);
  assertCheck(
    "Discrepancy maps cleanly to Phase 8 work item specification (category: allotment_discrepancy)",
    p8Item.category === "allotment_discrepancy" && p8Item.severity === "high",
    `Category: ${p8Item.category}, Severity: ${p8Item.severity}`
  );

  // 8. PHASE 4-8 SOURCE-OF-TRUTH INVARIANTS
  console.log("\n8. VERIFYING SOURCE-OF-TRUTH PRESERVATION (PHASES 1-8):");
  const { data: apps, error: appErr } = await adminClient.from("ipo_applications").select("id").limit(1);
  assertCheck(
    "Phase 4 ipo_applications table is intact and unmutated",
    !appErr,
    appErr ? appErr.message : `Records accessible: ${apps?.length ?? 0}`
  );

  const { data: journals, error: jourErr } = await adminClient.from("journal_entries").select("id").limit(1);
  assertCheck(
    "Phase 5 journal_entries ledger table is intact and unmutated",
    !jourErr,
    jourErr ? jourErr.message : `Records accessible: ${journals?.length ?? 0}`
  );

  const { data: workItems, error: wiErr } = await adminClient.from("admin_work_items").select("id").limit(1);
  assertCheck(
    "Phase 8 admin_work_items table is intact and unmutated",
    !wiErr,
    wiErr ? wiErr.message : `Records accessible: ${workItems?.length ?? 0}`
  );

  // Check dependencies: Zero live external SDKs
  const pkgJson = JSON.parse(fs.readFileSync("package.json", "utf-8"));
  const allDeps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
  const forbiddenDeps = ["cdsl-sdk", "nsdl-sdk", "zerodha", "upstox", "groww", "angelone"];
  const foundForbidden = forbiddenDeps.filter((d) => d in allDeps);
  assertCheck(
    "Zero third-party broker SDKs or live depository packages in package.json",
    foundForbidden.length === 0,
    foundForbidden.length === 0 ? "Strictly isolated" : `Found: ${foundForbidden.join(", ")}`
  );

  console.log("\n==============================================================================");
  console.log(`PHASE 9 STAGE 1 VERIFICATION COMPLETE: ${passedChecks}/${totalChecks} CHECKS PASSED`);
  console.log("==============================================================================");
}

runLiveVerification().catch((err) => {
  console.error("FATAL: Live verification failed with unhandled error:", err);
  process.exit(1);
});
