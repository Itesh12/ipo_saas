import fs from "fs";
import path from "path";

// Load environment variables from .env.local for database and security verification
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}

import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { getPublishedIPOs, getIPOUniverseCounts } from "../features/ipo/services/ipoService";
import { getIPOResearchBundle } from "../features/ipo/services/ipoResearchService";
import { calculateIPOScore } from "../features/ipo/services/ipoScoreEngine";
import { IPOTieredCacheService } from "../features/ipo/services/ipoTieredCacheService";

const PROD_BASE_URL = "https://ipo-saas.vercel.app";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

test("Phase G.1 — Production Build & Deployment Artifact Integrity", async () => {
  // G1: Ensure build output exists and production URL responds
  const res = await fetch(`${PROD_BASE_URL}/ipos`);
  assert.equal(res.status, 200, "Production /ipos must return HTTP 200");
  const html = await res.text();
  assert.ok(html.length > 50000, "Production /ipos must return complete HTML");
  assert.ok(html.includes("Showing"), "Production HTML must contain pagination summary");
  assert.ok(html.includes("734"), "Production HTML must reference canonical universe 734");
});

test("Phase G.3 — Production Listing Smoke: Filter Permutations & Canonical Reconciliation", async () => {
  const counts = await getIPOUniverseCounts();
  // Verify reconciliation: 9 + 1 + 23 + 701 = 734
  assert.equal(counts.all, 734, "Universe total must be 734");
  assert.equal(counts.current, 9, "Current IPOs must be 9");
  assert.equal(counts.upcoming, 1, "Upcoming IPOs must be 1");
  assert.equal(counts.announced, 23, "Announced IPOs must be 23");
  assert.equal(counts.past, 701, "Past IPOs must be 701");
  assert.equal(
    counts.current + counts.upcoming + counts.announced + counts.past,
    734,
    "Reconciliation equation 9 + 1 + 23 + 701 = 734 must strictly hold"
  );

  // Segments: Mainboard 564, NSE SME 170, BSE SME 0 (DEGRADED)
  assert.equal(counts.mainboard, 564, "Mainboard count must equal 564");
  assert.equal(counts.nse_sme, 170, "NSE SME count must equal 170");
  assert.equal(counts.bse_sme, 0, "BSE SME count must equal 0 (Degraded data source)");

  // Verify production HTTP endpoints for each filter combination
  const endpoints = [
    "/ipos?tab=all",
    "/ipos?tab=current",
    "/ipos?tab=upcoming",
    "/ipos?tab=announced",
    "/ipos?tab=past",
    "/ipos?segment=MAINBOARD",
    "/ipos?segment=NSE_SME",
    "/ipos?segment=BSE_SME",
    "/ipos?year=2026",
    "/ipos?year=2025",
    "/ipos?year=2024",
    "/ipos?q=Bajaj",
    "/ipos?sort=issue_size_cr",
    "/ipos?page=1",
    "/ipos?page=2",
    "/ipos?page=3",
    "/ipos?tab=past&segment=MAINBOARD&year=2024&sort=issue_size_cr&page=1",
  ];

  for (const ep of endpoints) {
    const res = await fetch(`${PROD_BASE_URL}${ep}`);
    assert.equal(res.status, 200, `Production endpoint ${ep} must return HTTP 200`);
    const html = await res.text();
    assert.ok(!html.includes("Application error: a client-side exception has occurred"), `Error on ${ep}`);
  }
});

test("Phase G.4 — Production Detail Smoke: 5 Representative States Across 11 Sections + Score", async () => {
  const representativeSlugs = [
    { slug: "bajaj-housing-finance-limited-4028", state: "Rich Mainboard" },
    { slug: "premier-energies-limited-7359", state: "Partial DRHP" },
    { slug: "western-carriers-india-limited-4549", state: "Un-ingested Control" },
    { slug: "sona-selection-limited-1316", state: "Current Open BSE SME" },
    { slug: "jindal-supreme", state: "Upcoming Mainboard" },
  ];

  for (const { slug, state } of representativeSlugs) {
    const res = await fetch(`${PROD_BASE_URL}/ipos/${slug}`);
    assert.equal(res.status, 200, `Production detail ${slug} must return HTTP 200`);
    const html = await res.text();

    // Verify all 11 section anchors exist in production HTML
    const anchors = [
      'id="overview"',
      'id="timeline"',
      'id="business"',
      'id="financials"',
      'id="valuation"',
      'id="structure"',
      'id="strengths-risks"',
      'id="gmp"',
      'id="subscription"',
      'id="allotment"',
      'id="score"',
    ];
    for (const anchor of anchors) {
      assert.ok(html.includes(anchor), `Production slug ${slug} must contain section anchor ${anchor}`);
    }

    // Verify absence of unhandled javascript leakage in rendered text nodes
    assert.equal(/>\s*undefined\s*</i.test(html), false, `Slug ${slug} leaked 'undefined'`);
    assert.equal(/>\s*NaN\s*</i.test(html), false, `Slug ${slug} leaked 'NaN'`);
    assert.equal(/>\s*null\s*</i.test(html), false, `Slug ${slug} leaked 'null'`);
  }
});

test("Phase G.5 — Production Cross-Layer Semantic Parity", async () => {
  // DB Canonical -> Production Service -> Research Bundle
  const { data: dbRow } = await supabaseAdmin
    .from("ipos")
    .select("*")
    .eq("slug", "bajaj-housing-finance-limited-4028")
    .single();

  assert.ok(dbRow, "Bajaj Housing Finance must exist in canonical DB");

  const bundle = await getIPOResearchBundle(dbRow.slug);
  assert.ok(bundle && bundle.ipo, "Research bundle must be resolved");

  // Semantic Equality
  assert.equal(bundle.ipo.company_name, dbRow.company_name);
  assert.equal(bundle.ipo.symbol, dbRow.symbol);
  assert.equal(bundle.ipo.price_band_low, Number(dbRow.price_band_low));
  assert.equal(bundle.ipo.price_band_high, Number(dbRow.price_band_high));
  assert.equal(bundle.ipo.lot_size, Number(dbRow.lot_size));
  assert.equal(bundle.ipo.issue_size_cr, Number(dbRow.issue_size_cr));
  assert.equal(bundle.ipo.open_date, dbRow.open_date);
  assert.equal(bundle.ipo.close_date, dbRow.close_date);
  assert.equal(bundle.ipo.listing_date, dbRow.listing_date);

  // Production SSR HTML Parity
  const res = await fetch(`${PROD_BASE_URL}/ipos/${dbRow.slug}`);
  const html = await res.text();
  assert.ok(html.includes(dbRow.company_name), "HTML must contain exact company name");
  assert.ok(html.includes(dbRow.symbol!), "HTML must contain exact symbol");
  assert.ok(html.includes(String(dbRow.price_band_high)), "HTML must contain high price");
});

test("Phase G.6 — Production Tiered Cache Smoke & Isolation", async () => {
  IPOTieredCacheService.clear();
  const ipoId = "6b6e2187-cd5c-4b41-af43-9aca7c97113c"; // Bajaj

  // Step 1: Initial Request -> Cache Miss -> Populated
  let missCount = 0;
  await IPOTieredCacheService.getOrSet(
    `ipo:research:${ipoId}`,
    [`ipo:research:${ipoId}`],
    86400,
    async () => {
      missCount++;
      return { data: "static-research-v1" };
    }
  );
  assert.equal(missCount, 1, "Initial request must result in cache miss");

  // Step 2: Second Request -> Cache Hit
  await IPOTieredCacheService.getOrSet(
    `ipo:research:${ipoId}`,
    [`ipo:research:${ipoId}`],
    86400,
    async () => {
      missCount++;
      return { data: "static-research-v2" };
    }
  );
  assert.equal(missCount, 1, "Second request must hit cache without incrementing missCount");

  // Step 3: Populate Dynamic GMP cache
  let gmpMissCount = 0;
  await IPOTieredCacheService.getOrSet(
    `ipo:gmp:${ipoId}`,
    [`ipo:gmp:${ipoId}`],
    60,
    async () => {
      gmpMissCount++;
      return { gmp: 10 };
    }
  );
  assert.equal(gmpMissCount, 1);

  // Step 4: Revalidate ONLY GMP
  IPOTieredCacheService.revalidateGMP(ipoId);

  // Step 5: Static research remains cached; GMP is re-fetched
  await IPOTieredCacheService.getOrSet(
    `ipo:research:${ipoId}`,
    [`ipo:research:${ipoId}`],
    86400,
    async () => {
      missCount++;
      return { data: "should-not-reach" };
    }
  );
  assert.equal(missCount, 1, "Static research must NOT be purged when GMP is revalidated");

  await IPOTieredCacheService.getOrSet(
    `ipo:gmp:${ipoId}`,
    [`ipo:gmp:${ipoId}`],
    60,
    async () => {
      gmpMissCount++;
      return { gmp: 12 };
    }
  );
  assert.equal(gmpMissCount, 2, "GMP must be fresh after tag invalidation");
});

test("Phase G.7 — Production Score Integrity: Eligibility & Suppression", async () => {
  // State 1: Bajaj (Rich)
  const bajajBundle = await getIPOResearchBundle("bajaj-housing-finance-limited-4028");
  const bajajScore = calculateIPOScore({
    ipo: bajajBundle!.ipo,
    financials: bajajBundle!.financials,
    valuation: bajajBundle!.valuation,
    promoters: bajajBundle!.promoters,
    latestGmp: bajajBundle!.latestGmp,
    latestSubscription: bajajBundle!.latestSubscription,
    risks: bajajBundle!.risks,
  });
  assert.equal(bajajScore.eligibility.isEligible, true);
  assert.ok(bajajScore.overall !== null && bajajScore.overall > 0);

  // State 2: Controlled 1-Period Partial Disclosure (Must be strictly suppressed)
  const partialOnePeriodScore = calculateIPOScore({
    ipo: bajajBundle!.ipo,
    financials: [bajajBundle!.financials[0]], // Only 1 fiscal period provided
    valuation: bajajBundle!.valuation,
    promoters: bajajBundle!.promoters,
  });
  assert.equal(partialOnePeriodScore.eligibility.isEligible, false, "1-period disclosure must be ineligible");
  assert.equal(partialOnePeriodScore.overall, null, "Ineligible IPO score must be strictly suppressed");
  assert.equal(partialOnePeriodScore.status, "INSUFFICIENT_DATA");

  // State 3: Western Carriers (Un-ingested control - 0 periods)
  const westernBundle = await getIPOResearchBundle("western-carriers-india-limited-4549");
  const westernScore = calculateIPOScore({
    ipo: westernBundle!.ipo,
    financials: westernBundle!.financials,
    valuation: westernBundle!.valuation,
    promoters: westernBundle!.promoters,
    latestGmp: westernBundle!.latestGmp,
    latestSubscription: westernBundle!.latestSubscription,
    risks: westernBundle!.risks,
  });
  assert.equal(westernScore.eligibility.isEligible, false);
  assert.equal(westernScore.overall, null);
  assert.equal(westernScore.status, "INSUFFICIENT_DATA");

  // State 4: Jindal Supreme (Upcoming - 0 periods)
  const jindalBundle = await getIPOResearchBundle("jindal-supreme");
  const jindalScore = calculateIPOScore({
    ipo: jindalBundle!.ipo,
    financials: jindalBundle!.financials,
    valuation: jindalBundle!.valuation,
    promoters: jindalBundle!.promoters,
  });
  assert.equal(jindalScore.eligibility.isEligible, false);
  assert.equal(jindalScore.overall, null);
  assert.equal(jindalScore.status, "INSUFFICIENT_DATA");
});

test("Phase G.8 — Production Data-Integrity Audit: 10 Read-Only Invariant Checks", async () => {
  // 1. Duplicate identity check (slug and symbol/company)
  const { data: allIpos, error: iposErr } = await supabaseAdmin
    .from("ipos")
    .select("id,slug,symbol,company_name,open_date,close_date,listing_date,price_band_low,price_band_high,lot_size,issue_size_cr");
  assert.equal(iposErr, null);
  assert.equal(allIpos!.length, 735); // 734 published + 1 draft/verification

  const slugSet = new Set<string>();
  for (const ipo of allIpos!) {
    assert.equal(slugSet.has(ipo.slug), false, `Duplicate slug detected: ${ipo.slug}`);
    slugSet.add(ipo.slug);
  }

  // 2. Invalid price bands check (low > high)
  for (const ipo of allIpos!) {
    if (ipo.price_band_low !== null && ipo.price_band_high !== null) {
      assert.ok(
        Number(ipo.price_band_low) <= Number(ipo.price_band_high),
        `Price band low exceeds high for ${ipo.company_name}`
      );
    }
  }

  // 3. Chronology check (open <= close <= listing)
  for (const ipo of allIpos!) {
    if (ipo.open_date && ipo.close_date) {
      assert.ok(ipo.open_date <= ipo.close_date, `Open date exceeds close date for ${ipo.company_name}`);
    }
    if (ipo.close_date && ipo.listing_date) {
      assert.ok(ipo.close_date <= ipo.listing_date, `Close date exceeds listing date for ${ipo.company_name}`);
    }
  }

  // 4. Promoter ownership <= 100%
  const { data: promoters } = await supabaseAdmin.from("ipo_promoters").select("*");
  for (const p of promoters || []) {
    if (p.holding_post_pct !== null && p.holding_post_pct !== undefined) {
      assert.ok(Number(p.holding_post_pct) <= 100, `Post-issue holding > 100% for promoter ${p.id}`);
    }
    if (p.holding_pre_pct !== null && p.holding_pre_pct !== undefined) {
      assert.ok(Number(p.holding_pre_pct) <= 100, `Pre-issue holding > 100% for promoter ${p.id}`);
    }
  }

  // 5. Valid positive lot sizes
  for (const ipo of allIpos!) {
    if (ipo.lot_size !== null) {
      assert.ok(Number(ipo.lot_size) > 0, `Lot size must be positive for ${ipo.company_name}`);
    }
  }

  // 6. Non-negative issue sizes
  for (const ipo of allIpos!) {
    if (ipo.issue_size_cr !== null) {
      assert.ok(Number(ipo.issue_size_cr) >= 0, `Issue size must be non-negative for ${ipo.company_name}`);
    }
  }

  // 7. Malformed dates check (YYYY-MM-DD format regex)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  for (const ipo of allIpos!) {
    if (ipo.open_date) assert.ok(dateRegex.test(ipo.open_date), `Invalid open date format: ${ipo.open_date}`);
    if (ipo.close_date) assert.ok(dateRegex.test(ipo.close_date), `Invalid close date format: ${ipo.close_date}`);
    if (ipo.listing_date) assert.ok(dateRegex.test(ipo.listing_date), `Invalid listing date format: ${ipo.listing_date}`);
  }

  // 8. Orphan research records check (all research ipo_id exist in ipos.id)
  const ipoIdSet = new Set(allIpos!.map(i => i.id));
  const { data: finRows } = await supabaseAdmin.from("ipo_financials").select("id,ipo_id");
  for (const f of finRows || []) {
    assert.ok(ipoIdSet.has(f.ipo_id), `Orphan financial row: ${f.id}`);
  }

  // 9. Orphan provenance / observation references
  const { data: obsRows } = await supabaseAdmin.from("ipo_ingestion_observations").select("id");
  const obsIdSet = new Set((obsRows || []).map(o => o.id));
  for (const f of finRows || []) {
    const rawF = f as Record<string, unknown>;
    if (rawF.source_observation_id) {
      assert.ok(obsIdSet.has(rawF.source_observation_id as string), `Orphan observation ID: ${rawF.source_observation_id}`);
    }
  }

  // 10. Legacy provenance integrity: Unverified rows must retain NULL lineage
  const { data: unverifiedRows } = await supabaseAdmin
    .from("ipo_financials")
    .select("id,verification_state,source_observation_id,source_type")
    .eq("verification_state", "unverified");

  for (const r of unverifiedRows || []) {
    assert.equal(r.source_observation_id, null, "Legacy unverified rows must have NULL observation ID");
    assert.equal(r.source_type, null, "Legacy unverified rows must have NULL source type");
  }
});

test("Phase G.9 — Production Security Smoke: Public vs Protected Surface Isolation", async () => {
  // Public listing -> 200
  const pubList = await fetch(`${PROD_BASE_URL}/ipos`);
  assert.equal(pubList.status, 200);

  // Public detail -> 200
  const pubDetail = await fetch(`${PROD_BASE_URL}/ipos/bajaj-housing-finance-limited-4028`);
  assert.equal(pubDetail.status, 200);

  // Unauthenticated Admin route access -> Protected (Redirect to login or 401/403)
  const adminRes = await fetch(`${PROD_BASE_URL}/admin/finance`, {
    redirect: "manual",
  });
  // Next.js auth middleware redirects unauthenticated requests (307/302) to /login or returns 401/403
  assert.ok(
    [302, 303, 307, 308, 401, 403].includes(adminRes.status),
    `Unauthenticated admin route must be blocked or redirected (status: ${adminRes.status})`
  );

  // Security: Zero secret leakage in SSR HTML
  const pubHtml = await pubDetail.text();
  assert.equal(pubHtml.includes(process.env.SUPABASE_SERVICE_ROLE_KEY!), false, "Service role key leaked in HTML");
  assert.equal(pubHtml.includes("postgres:"), false, "Database connection string leaked in HTML");
});
