import { createAdminClient } from "../lib/supabase/admin";
import { NseIngestionAdapter } from "../features/external-integrations/adapters/nseExtractor";
import { IPORow } from "../features/ipo/types/ipo.types";

interface AuditResult {
  totalIpos: number;
  issueSizeCorruption: Array<{
    id: string;
    company: string;
    symbol: string | null;
    current_issue_size_cr: number | null;
    raw_source_value: unknown;
    expected_issue_size_cr: number | null;
    source: string;
    confidence: string;
    reason: string;
    action: string;
  }>;
  lotSizeCorruption: Array<{
    id: string;
    company: string;
    lot_size: number | null;
    lot_size_status: string | null;
    price_band_high: number | null;
    min_investment: number | null;
    has_authoritative_lot_source: boolean;
    reason: string;
    action: string;
  }>;
  minInvestmentCorruption: Array<{
    id: string;
    company: string;
    lot_size: number | null;
    price_band_high: number | null;
    current_min_investment: number | null;
    expected_min_investment: number | null;
    reason: string;
    action: string;
  }>;
  quotaAnalysis: {
    totalWithRetailQuota: number;
    totalWithQibQuota: number;
    totalWithHniQuota: number;
    recordsWithQuotas: Array<{
      id: string;
      company: string;
      retail_quota_pct: number | null;
      qib_quota_pct: number | null;
      hni_quota_pct: number | null;
      has_authoritative_provenance: boolean;
    }>;
  };
  duplicates: Array<{
    groupKey: string;
    records: Array<{
      id: string;
      company_name: string;
      symbol: string | null;
      isin: string | null;
      open_date: string | null;
      close_date: string | null;
      listing_date: string | null;
      price_band: string;
      lot_size: number | null;
      issue_size_cr: number | null;
      status: string;
      source: string;
    }>;
    analysis: string;
  }>;
  childCompleteness: Record<string, { totalRows: number; distinctIpos: number; coveragePct: number }>;
  topHighRiskRecords: Array<{
    id: string;
    company: string;
    riskScore: number;
    flags: string[];
  }>;
}

async function runRemediationAudit() {
  console.log("================================================================================");
  console.log("PHASE 2.5: EXISTING CANONICAL IPO DATA REMEDIATION AUDIT (STRICTLY READ-ONLY)");
  console.log("Timestamp: " + new Date().toISOString());
  console.log("================================================================================\n");

  const supabase = createAdminClient();

  // 1. Fetch all canonical IPOs
  const { data: iposData, error: iposError } = await supabase
    .from("ipos")
    .select("*")
    .order("created_at", { ascending: true });

  if (iposError || !iposData) {
    throw new Error(`Failed to query public.ipos: ${iposError?.message}`);
  }

  const ipos = iposData as IPORow[];
  console.log(`[Step 1] Loaded ${ipos.length} canonical records from public.ipos.\n`);

  // 2. Fetch observations & inbox to cross-reference raw provenance
  const { data: inboxData } = await supabase.from("ipo_ingestion_inbox").select("*");
  const { data: obsData } = await supabase.from("ipo_ingestion_observations").select("*");

  const inboxMap = new Map<string, Record<string, unknown>>();
  if (inboxData) {
    for (const item of inboxData) {
      if (item.promoted_ipo_id) {
        inboxMap.set(item.promoted_ipo_id, item);
      }
    }
  }

  const obsMap = new Map<string, Record<string, unknown>>();
  if (obsData) {
    for (const item of obsData) {
      if (item.inbox_id) {
        obsMap.set(item.inbox_id, item);
      }
    }
  }

  // --------------------------------------------------------------------------------
  // 1. ISSUE SIZE CORRUPTION AUDIT
  // --------------------------------------------------------------------------------
  const issueSizeCorruption: AuditResult["issueSizeCorruption"] = [];

  for (const ipo of ipos) {
    const prov = (ipo.provenance || {}) as Record<string, unknown>;
    const inbox = inboxMap.get(ipo.id);
    const obs = inbox ? obsMap.get(inbox.id as string) : null;
    const rawPayload = (obs?.raw_payload || {}) as Record<string, unknown>;
    const normPayload = (obs?.normalized_payload || {}) as Record<string, unknown>;

    const currentIssueSize = ipo.issue_size_cr;

    // Check for implausible magnitude (> 25,000 Cr, typically share counts like 10,010,000)
    if (currentIssueSize !== null && currentIssueSize > 25000) {
      const rawVal = rawPayload.issueSize || normPayload.issue_size_cr || currentIssueSize;
      const contract = NseIngestionAdapter.parseIssueSizeContract(rawVal as number | string);

      issueSizeCorruption.push({
        id: ipo.id,
        company: ipo.company_name,
        symbol: ipo.symbol,
        current_issue_size_cr: currentIssueSize,
        raw_source_value: rawVal,
        expected_issue_size_cr: contract.issue_size_cr,
        source: (prov.source as string) || "nse",
        confidence: contract.confidence,
        reason:
          contract.status === "SHARES_DETECTED"
            ? "Source value represents share count (e.g. 10,010,000 shares), corrupted as Crores"
            : "Bare numeric value without unit marker; cannot infer unit from magnitude",
        action: "DETERMINISTIC_REPAIR: set issue_size_cr = NULL",
      });
    }
  }

  // --------------------------------------------------------------------------------
  // 2. LOT SIZE & MINIMUM INVESTMENT CORRUPTION AUDIT
  // --------------------------------------------------------------------------------
  const lotSizeCorruption: AuditResult["lotSizeCorruption"] = [];
  const minInvestmentCorruption: AuditResult["minInvestmentCorruption"] = [];

  for (const ipo of ipos) {
    const prov = (ipo.provenance || {}) as Record<string, unknown>;
    const provLot = prov.lot_size as Record<string, unknown> | undefined;

    // Check if lot_size === 1 was from fallback
    if (ipo.lot_size === 1) {
      // Check if authoritative lot evidence exists
      const isPendingVerification = ipo.lot_size_status === "pending_verification";
      const hasAuthLot = Boolean(provLot?.value && Number(provLot.value) === 1 && provLot.is_official);

      lotSizeCorruption.push({
        id: ipo.id,
        company: ipo.company_name,
        lot_size: ipo.lot_size,
        lot_size_status: ipo.lot_size_status ?? null,
        price_band_high: ipo.price_band_high,
        min_investment: ipo.min_investment,
        has_authoritative_lot_source: hasAuthLot,
        reason: isPendingVerification
          ? "Fabricated lot_size = 1 assigned under pending_verification status"
          : "lot_size = 1 without authoritative exchange lot confirmation",
        action: hasAuthLot ? "PRESERVE: verified 1-lot unit" : "DETERMINISTIC_REPAIR: set lot_size = NULL",
      });
    }

    // Check min_investment corruption
    if (ipo.min_investment !== null) {
      if (ipo.lot_size === null || ipo.lot_size <= 0 || ipo.lot_size_status === "pending_verification") {
        minInvestmentCorruption.push({
          id: ipo.id,
          company: ipo.company_name,
          lot_size: ipo.lot_size,
          price_band_high: ipo.price_band_high,
          current_min_investment: ipo.min_investment,
          expected_min_investment: null,
          reason: "min_investment fabricated while lot_size was unknown or pending verification",
          action: "DETERMINISTIC_REPAIR: set min_investment = NULL",
        });
      } else if (ipo.price_band_high && ipo.lot_size) {
        const expected = Math.round(ipo.price_band_high * ipo.lot_size * 100) / 100;
        if (Math.abs(ipo.min_investment - expected) > 1) {
          minInvestmentCorruption.push({
            id: ipo.id,
            company: ipo.company_name,
            lot_size: ipo.lot_size,
            price_band_high: ipo.price_band_high,
            current_min_investment: ipo.min_investment,
            expected_min_investment: expected,
            reason: `min_investment (${ipo.min_investment}) does not match price_band_high * lot_size (${expected})`,
            action: `DETERMINISTIC_REPAIR: set min_investment = ${expected}`,
          });
        }
      }
    }
  }

  // --------------------------------------------------------------------------------
  // 3. QUOTA FABRICATION AUDIT
  // --------------------------------------------------------------------------------
  const recordsWithQuotas: AuditResult["quotaAnalysis"]["recordsWithQuotas"] = [];
  let totalWithRetailQuota = 0;
  let totalWithQibQuota = 0;
  let totalWithHniQuota = 0;

  for (const ipo of ipos) {
    const hasRetail = ipo.retail_quota_pct !== null && ipo.retail_quota_pct !== undefined;
    const hasQib = ipo.qib_quota_pct !== null && ipo.qib_quota_pct !== undefined;
    const hasHni = ipo.hni_quota_pct !== null && ipo.hni_quota_pct !== undefined;

    if (hasRetail) totalWithRetailQuota++;
    if (hasQib) totalWithQibQuota++;
    if (hasHni) totalWithHniQuota++;

    if (hasRetail || hasQib || hasHni) {
      const prov = (ipo.provenance || {}) as Record<string, unknown>;
      const hasProv = Boolean(prov.retail_quota_pct || prov.quota || prov.quotas);
      recordsWithQuotas.push({
        id: ipo.id,
        company: ipo.company_name,
        retail_quota_pct: ipo.retail_quota_pct,
        qib_quota_pct: ipo.qib_quota_pct,
        hni_quota_pct: ipo.hni_quota_pct,
        has_authoritative_provenance: hasProv,
      });
    }
  }

  // --------------------------------------------------------------------------------
  // 4. DUPLICATE CANDIDATES AUDIT (PHASE 3 PREPARATION)
  // --------------------------------------------------------------------------------
  const normalizeForDup = (name: string): string => {
    return name
      .toLowerCase()
      .replace(/\(india\)/g, "")
      .replace(/india/g, "")
      .replace(/limited/g, "")
      .replace(/ltd/g, "")
      .replace(/– addendum to rhp/g, "")
      .replace(/addendum/g, "")
      .replace(/[^a-z0-9]/g, "")
      .trim();
  };

  const nameGroups = new Map<string, IPORow[]>();
  const symbolGroups = new Map<string, IPORow[]>();

  for (const ipo of ipos) {
    const normName = normalizeForDup(ipo.company_name);
    if (normName.length >= 4) {
      if (!nameGroups.has(normName)) nameGroups.set(normName, []);
      nameGroups.get(normName)!.push(ipo);
    }
    if (ipo.symbol && ipo.symbol.length >= 3) {
      const sym = ipo.symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!symbolGroups.has(sym)) symbolGroups.set(sym, []);
      symbolGroups.get(sym)!.push(ipo);
    }
  }

  const duplicates: AuditResult["duplicates"] = [];
  const processedIds = new Set<string>();

  // Check name-based duplicates
  for (const [key, group] of nameGroups.entries()) {
    if (group.length > 1) {
      const ids = group.map((g) => g.id).sort().join(",");
      if (!processedIds.has(ids)) {
        processedIds.add(ids);
        duplicates.push({
          groupKey: `NAME_SIMILARITY: ${key}`,
          records: group.map((r) => ({
            id: r.id,
            company_name: r.company_name,
            symbol: r.symbol,
            isin: (r as unknown as { isin?: string | null }).isin ?? null,
            open_date: r.open_date,
            close_date: r.close_date,
            listing_date: r.listing_date,
            price_band: `${r.price_band_low ?? "null"} - ${r.price_band_high ?? "null"}`,
            lot_size: r.lot_size,
            issue_size_cr: r.issue_size_cr,
            status: r.status,
            source: (r.provenance as Record<string, unknown>)?.source as string || "unknown",
          })),
          analysis:
            group.length === 2 && group[0].symbol === group[1].symbol
              ? "CONFIRMED_SAME_OFFERING_CANDIDATE: Identical symbol, minor name punctuation discrepancy"
              : "SUSPICIOUS_DUPLICATE_CANDIDATE: Requires document/ISIN proof before merge",
        });
      }
    }
  }

  // --------------------------------------------------------------------------------
  // 5. RESEARCH CHILD TABLES COMPLETENESS MATRIX
  // --------------------------------------------------------------------------------
  const childTables = [
    "ipo_business_profiles",
    "ipo_financials",
    "ipo_valuations",
    "ipo_peers",
    "ipo_promoters",
    "ipo_strengths",
    "ipo_risks",
    "ipo_scores",
    "ipo_documents",
    "ipo_gmp_entries",
    "ipo_subscription_snapshots",
  ];

  const childCompleteness: AuditResult["childCompleteness"] = {};

  for (const table of childTables) {
    const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
    // Also count distinct ipo_id
    const { data: idData } = await supabase.from(table).select("ipo_id");
    const distinctIpos = idData ? new Set(idData.map((d: { ipo_id: string }) => d.ipo_id)).size : 0;
    const totalRows = count || 0;
    childCompleteness[table] = {
      totalRows,
      distinctIpos,
      coveragePct: Math.round((distinctIpos / ipos.length) * 10000) / 100,
    };
  }

  // --------------------------------------------------------------------------------
  // 6. TOP 20 HIGHEST-RISK RECORDS
  // --------------------------------------------------------------------------------
  const riskScored: AuditResult["topHighRiskRecords"] = [];

  for (const ipo of ipos) {
    let riskScore = 0;
    const flags: string[] = [];

    // Issue size corruption
    if (ipo.issue_size_cr !== null && ipo.issue_size_cr > 25000) {
      riskScore += 50;
      flags.push(`corrupted_issue_size_cr (${ipo.issue_size_cr})`);
    }

    // Lot size fabrication
    if (ipo.lot_size === 1 && ipo.lot_size_status === "pending_verification") {
      riskScore += 20;
      flags.push("fabricated_lot_size_1");
    }

    // Min investment fabrication
    if (ipo.min_investment !== null && (ipo.lot_size === null || ipo.lot_size_status === "pending_verification")) {
      riskScore += 20;
      flags.push(`fabricated_min_investment (₹${ipo.min_investment})`);
    }

    // Quotas populated without provenance
    if (ipo.retail_quota_pct !== null || ipo.qib_quota_pct !== null || ipo.hni_quota_pct !== null) {
      riskScore += 10;
      flags.push("unverified_quota_data");
    }

    // Missing dates
    if (!ipo.open_date && !ipo.close_date && !ipo.listing_date) {
      riskScore += 15;
      flags.push("all_dates_missing");
    }

    // Missing pricing
    if (!ipo.price_band_high && !ipo.price_band_low) {
      riskScore += 10;
      flags.push("price_band_missing");
    }

    if (riskScore > 0) {
      riskScored.push({
        id: ipo.id,
        company: ipo.company_name,
        riskScore,
        flags,
      });
    }
  }

  riskScored.sort((a, b) => b.riskScore - a.riskScore);
  const topHighRiskRecords = riskScored.slice(0, 20);

  // --------------------------------------------------------------------------------
  // OUTPUT SUMMARY
  // --------------------------------------------------------------------------------
  console.log("================================================================================");
  console.log("1. SUMMARY OF AUDIT FINDINGS");
  console.log("================================================================================");
  console.log(`Total Canonical IPOs: ${ipos.length}`);
  console.log(`Issue Size Corruption Candidates (>25,000 Cr share counts): ${issueSizeCorruption.length}`);
  console.log(`Lot Size = 1 Candidates (requiring verification): ${lotSizeCorruption.length}`);
  console.log(`Min Investment Corruption Candidates: ${minInvestmentCorruption.length}`);
  console.log(`Records with Quota Data: ${recordsWithQuotas.length} (Retail: ${totalWithRetailQuota}, QIB: ${totalWithQibQuota}, HNI: ${totalWithHniQuota})`);
  console.log(`Duplicate Offering Candidate Groups: ${duplicates.length}\n`);

  console.log("================================================================================");
  console.log("2. ISSUE SIZE CORRUPTED ROWS (READY FOR DETERMINISTIC REPAIR)");
  console.log("================================================================================");
  console.table(
    issueSizeCorruption.map((c) => ({
      ID: c.id.slice(0, 8),
      Company: c.company.slice(0, 25),
      CurrentCr: c.current_issue_size_cr,
      RawVal: String(c.raw_source_value).slice(0, 20),
      Expected: c.expected_issue_size_cr,
      Action: c.action.slice(0, 30),
    }))
  );

  console.log("\n================================================================================");
  console.log("3. LOT SIZE & MINIMUM INVESTMENT FABRICATED ROWS");
  console.log("================================================================================");
  console.log(`Total rows with min_investment corruption: ${minInvestmentCorruption.length}`);
  console.table(
    minInvestmentCorruption.slice(0, 10).map((m) => ({
      ID: m.id.slice(0, 8),
      Company: m.company.slice(0, 25),
      Lot: m.lot_size,
      Price: m.price_band_high,
      CurrentMin: m.current_min_investment,
      ExpectedMin: m.expected_min_investment,
      Action: m.action.slice(0, 30),
    }))
  );

  console.log("\n================================================================================");
  console.log("4. DUPLICATE CANDIDATE GROUPS IDENTIFIED (FOR PHASE 3 RESOLVER)");
  console.log("================================================================================");
  duplicates.forEach((d, idx) => {
    console.log(`\n--- Candidate Group ${idx + 1}: ${d.groupKey} ---`);
    console.log(`Analysis: ${d.analysis}`);
    d.records.forEach((r) => {
      console.log(
        `  * ID: ${r.id} | Name: "${r.company_name}" | Symbol: ${r.symbol} | Dates: [${r.open_date} -> ${r.close_date}] | Price: ₹${r.price_band} | Lot: ${r.lot_size} | IssueSizeCr: ${r.issue_size_cr}`
      );
    });
  });

  console.log("\n================================================================================");
  console.log("5. RESEARCH CHILD TABLE COMPLETENESS MATRIX");
  console.log("================================================================================");
  console.table(childCompleteness);

  console.log("\n================================================================================");
  console.log("6. TOP 20 HIGHEST-RISK CANONICAL RECORDS");
  console.log("================================================================================");
  console.table(
    topHighRiskRecords.map((r) => ({
      ID: r.id.slice(0, 8),
      Company: r.company.slice(0, 30),
      RiskScore: r.riskScore,
      Flags: r.flags.join(", ").slice(0, 50),
    }))
  );

  console.log("\n✅ ZERO DATABASE WRITES OCCURRED. ALL CHECKS EXECUTED AS PURE READ-ONLY.");
}

runRemediationAudit().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});
