import fs from "fs";
import path from "path";

// Load environment variables from .env.local for Supabase connectivity in tsx test runner
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
import { getPublishedIPOs, getIPOUniverseCounts } from "../features/ipo/services/ipoService";
import { getIPOResearchBundle } from "../features/ipo/services/ipoResearchService";
import { calculateIPOScore } from "../features/ipo/services/ipoScoreEngine";

const BASE_URL = "http://localhost:3000";

test("Phase F.1 — Listing Filter Matrix: Comprehensive Query Validation", async () => {
  const counts = await getIPOUniverseCounts();
  assert.ok(counts.all >= 734, "Canonical universe count must be >= 734");

  // 1. Tab filters
  const tabs = ["all", "current", "upcoming", "announced", "past"] as const;
  for (const tab of tabs) {
    const res = await getPublishedIPOs({
      status: tab,
      page: 1,
      pageSize: 10,
    });
    assert.ok(res.totalCount >= 0, `Tab ${tab} should return valid totalCount`);
    if (tab === "all") assert.equal(res.totalCount, counts.all);
    if (tab === "past") assert.equal(res.totalCount, counts.past);
    if (tab === "current") assert.equal(res.totalCount, counts.current);
    if (tab === "upcoming") assert.equal(res.totalCount, counts.upcoming);
    if (tab === "announced") assert.equal(res.totalCount, counts.announced);
  }

  // 2. Market segment filters
  const segments = ["MAINBOARD", "NSE_SME", "BSE_SME"] as const;
  let totalSegments = 0;
  for (const seg of segments) {
    const res = await getPublishedIPOs({
      market_segment: seg,
      page: 1,
      pageSize: 5,
    });
    totalSegments += res.totalCount;
    if (seg === "BSE_SME") {
      assert.equal(res.totalCount, counts.bse_sme, "BSE SME count should match universe counts");
    } else {
      assert.ok(res.totalCount > 0, `Segment ${seg} should have registered IPOs`);
    }
    for (const item of res.ipos) {
      const segVal = (item as unknown as Record<string, unknown>).market_segment;
      if (seg === "MAINBOARD") {
        assert.ok(segVal === "MAINBOARD" || item.category === "mainboard", `Expected Mainboard for ${item.company_name}`);
      } else if (seg === "NSE_SME") {
        assert.ok(segVal === "NSE_SME" || item.category === "sme_nse", `Expected NSE SME for ${item.company_name}`);
      } else if (seg === "BSE_SME") {
        assert.ok(segVal === "BSE_SME" || item.category === "sme_bse", `Expected BSE SME for ${item.company_name}`);
      }
    }
  }
  assert.equal(totalSegments, counts.all, `Sum of segmented IPOs must equal canonical universe (${counts.all})`);

  // 3. Year filters
  const years = ["2026", "2025", "2024"];
  for (const yr of years) {
    const res = await getPublishedIPOs({
      year: yr,
      page: 1,
      pageSize: 5,
    });
    assert.equal(res.totalCount, counts.byYear[Number(yr)] || 0);
  }

  // 4. Search query
  const searchRes = await getPublishedIPOs({
    searchQuery: "Bajaj Housing",
    page: 1,
    pageSize: 10,
  });
  assert.ok(searchRes.totalCount >= 1, "Search for 'Bajaj Housing' must match at least 1 record");
  assert.ok(searchRes.ipos.some(i => i.company_name.includes("Bajaj Housing Finance")));

  // 5. Sorting
  const sortedRes = await getPublishedIPOs({
    sortBy: "issue_size",
    sortOrder: "desc",
    page: 1,
    pageSize: 10,
  });
  for (let i = 0; i < sortedRes.ipos.length - 1; i++) {
    const curr = sortedRes.ipos[i].issue_size_cr ?? 0;
    const next = sortedRes.ipos[i + 1].issue_size_cr ?? 0;
    assert.ok(curr >= next, "IPOs must be sorted by issue_size_cr descending");
  }
});

test("Phase F.2 — Pagination State Arithmetic & Boundary Integrity", async () => {
  const counts = await getIPOUniverseCounts();
  const totalCount = counts.all;
  const pageSize = 20;
  const totalPages = Math.ceil(totalCount / pageSize);

  assert.ok(totalPages >= 37, "Pagination must produce at least 37 pages");

  // Page 1
  const p1 = await getPublishedIPOs({ page: 1, pageSize });
  assert.equal(p1.ipos.length, Math.min(pageSize, totalCount));

  // Page 2
  const p2 = await getPublishedIPOs({ page: 2, pageSize });
  if (totalPages >= 2) {
    assert.equal(p2.ipos.length, Math.min(pageSize, totalCount - pageSize));
    assert.notEqual(p1.ipos[0].id, p2.ipos[0].id, "Page 1 and Page 2 first items must differ");
  }

  // Page 3
  const p3 = await getPublishedIPOs({ page: 3, pageSize });
  if (totalPages >= 3) {
    assert.equal(p3.ipos.length, Math.min(pageSize, totalCount - 2 * pageSize));
    assert.notEqual(p2.ipos[0].id, p3.ipos[0].id, "Page 2 and Page 3 first items must differ");
  }

  // Last Page
  const pLast = await getPublishedIPOs({ page: totalPages, pageSize });
  const expectedLastPageCount = totalCount - ((totalPages - 1) * pageSize);
  assert.equal(pLast.ipos.length, expectedLastPageCount, `Last page must contain exactly ${expectedLastPageCount} items`);

  // Beyond boundary
  const pBeyond = await getPublishedIPOs({ page: totalPages + 1, pageSize });
  assert.equal(pBeyond.ipos.length, 0, "Page beyond totalPages must return empty array");
});

test("Phase F.3 — HTTP Status & Live SSR Response for Listing & Representative Detail Pages", async () => {
  const endpoints = [
    "/ipos",
    "/ipos?tab=past&segment=MAINBOARD&year=2024",
    "/ipos?page=2",
    "/ipos?page=3",
    "/ipos?q=Bajaj",
    "/ipos/bajaj-housing-finance-limited-4028",
    "/ipos/premier-energies-limited-7359",
    "/ipos/western-carriers-india-limited-4549",
    "/ipos/sona-selection-limited-1316",
    "/ipos/jindal-supreme",
  ];

  for (const ep of endpoints) {
    const res = await fetch(`${BASE_URL}${ep}`);
    assert.equal(res.status, 200, `Endpoint ${ep} must return HTTP 200`);
    const html = await res.text();
    assert.ok(html.length > 500, `Endpoint ${ep} HTML must not be empty`);
    assert.ok(!html.includes("Application error: a client-side exception has occurred"), `Endpoint ${ep} has client crash`);
  }
});

test("Phase F.4 — 5-State Lifecycle & Section Coverage Integrity", async () => {
  const representativeSlugs = [
    { slug: "bajaj-housing-finance-limited-4028", state: "Rich Mainboard" },
    { slug: "premier-energies-limited-7359", state: "Partial DRHP" },
    { slug: "western-carriers-india-limited-4549", state: "Un-ingested Control" },
    { slug: "sona-selection-limited-1316", state: "Current Open BSE SME" },
    { slug: "jindal-supreme", state: "Upcoming Mainboard" },
  ];

  for (const { slug, state } of representativeSlugs) {
    const bundle = await getIPOResearchBundle(slug);
    assert.ok(bundle, `Bundle for ${state} (${slug}) must be resolved`);
    assert.ok(bundle.ipo, `IPO record for ${state} must exist`);

    // Evaluate 12 displayed items / 11 sections + Score
    // 1. Overview / Hero
    assert.ok(bundle.ipo.company_name, "Overview: company_name must be present");
    // 2. Issue Quick Facts
    assert.ok(bundle.ipo.lot_size === null || bundle.ipo.lot_size > 0, "Quick Facts: lot_size must be valid");
    // 3. Milestone Timeline
    assert.ok(bundle.ipo.open_date, "Timeline: open_date must be present");

    // 12. Score
    const scoreBreakdown = calculateIPOScore({
      ipo: bundle.ipo,
      financials: bundle.financials,
      valuation: bundle.valuation,
      promoters: bundle.promoters,
      latestGmp: bundle.latestGmp,
      latestSubscription: bundle.latestSubscription,
      risks: bundle.risks,
    });

    if (slug === "bajaj-housing-finance-limited-4028") {
      // Richly researched state
      assert.equal(scoreBreakdown.eligibility.isEligible, true);
      assert.ok(scoreBreakdown.overall !== null && scoreBreakdown.overall > 0);
      assert.ok(bundle.financials.length >= 3, "Bajaj must have >=3 financial years");
      assert.ok(bundle.valuation !== null, "Bajaj must have valuation data");
      assert.ok(bundle.promoters !== null, "Bajaj must have promoter data");
      assert.ok(bundle.strengths.length > 0, "Bajaj must have strengths");
      assert.ok(bundle.risks.length > 0, "Bajaj must have risks");
    } else if (slug === "western-carriers-india-limited-4549") {
      // Un-ingested control state
      assert.equal(scoreBreakdown.eligibility.isEligible, false);
      assert.equal(scoreBreakdown.overall, null);
      assert.equal(bundle.financials.length, 0);
      assert.equal(bundle.valuation, null);
      assert.equal(bundle.promoters.length, 0);
      assert.equal(bundle.businessProfile, null);
    }
  }
});

test("Phase F.5 — Zero Raw 'undefined', 'NaN', or 'null' in Rendered HTML", async () => {
  const slugs = [
    "bajaj-housing-finance-limited-4028",
    "western-carriers-india-limited-4549",
    "sona-selection-limited-1316",
    "jindal-supreme",
  ];

  for (const slug of slugs) {
    const res = await fetch(`${BASE_URL}/ipos/${slug}`);
    const html = await res.text();

    // Verify absence of unhandled javascript leakage in rendered text nodes
    // Note: We check for pattern >undefined<, >NaN<, >null< in HTML tags
    const hasRawUndefined = />\s*undefined\s*</i.test(html);
    const hasRawNaN = />\s*NaN\s*</i.test(html);
    const hasRawNull = />\s*null\s*</i.test(html);

    assert.equal(hasRawUndefined, false, `Slug ${slug} contains raw 'undefined' in HTML`);
    assert.equal(hasRawNaN, false, `Slug ${slug} contains raw 'NaN' in HTML`);
    assert.equal(hasRawNull, false, `Slug ${slug} contains raw 'null' in HTML`);
  }
});

test("Phase F.6 — Sticky Navigation Section Anchors Exist on Detail Page", async () => {
  const res = await fetch(`${BASE_URL}/ipos/bajaj-housing-finance-limited-4028`);
  const html = await res.text();

  const requiredAnchors = [
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

  for (const anchor of requiredAnchors) {
    assert.ok(html.includes(anchor), `Detail page must include anchor ${anchor} for smooth scrolling navigation`);
  }
});
