import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateScoreDataEligibility,
  calculateIPOScore,
  canPersistIPOScore,
  SCORE_METHODOLOGY_VERSION,
} from "../features/ipo/services/ipoScoreEngine";
import { deriveIPOStatus } from "../features/ipo/services/ipoLifecycle";
import { IPORow, IPOFinancialRow, IPOValuationRow, IPOGMPEntryRow, IPOSubscriptionSnapshotRow } from "../features/ipo/types/ipo.types";

describe("Phase A: Functional Correctness & Production Hardening", () => {
  const baseMockIPO: IPORow = {
    id: "00000000-0000-0000-0000-000000000001",
    slug: "sample-tech-limited",
    company_name: "Sample Tech Limited",
    symbol: "SAMPLE",
    company_logo: null,
    category: "mainboard",
    issue_type: "book_building",
    status: "open",
    publication_status: "published",
    price_band_low: 100,
    price_band_high: 108,
    face_value: 10,
    lot_size: 135,
    issue_size_cr: 500,
    fresh_issue_cr: 350,
    ofs_cr: 150,
    shares_offered: 50000000,
    min_investment: 14580,
    retail_quota_pct: 35,
    qib_quota_pct: 50,
    hni_quota_pct: 15,
    exchange: "NSE/BSE",
    lead_managers: null,
    registrar_name: "KFin Technologies",
    announcement_date: "2026-08-25",
    open_date: "2026-09-15",
    close_date: "2026-09-18",
    allotment_date: "2026-09-21",
    refund_date: "2026-09-22",
    listing_date: "2026-09-24",
    listing_price: null,
    about_company: "A leading technology company.",
    created_by: null,
    approved_by: null,
    published_at: "2026-09-01T00:00:00Z",
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    provenance: null,
    is_listing_confirmed: false,
    designated_exchange: "NSE",
    lot_size_status: "verified",
  };

  const sampleFY23: IPOFinancialRow = {
    id: "f23",
    ipo_id: baseMockIPO.id,
    financial_year: "FY23",
    period_type: "full_year",
    statement_type: "consolidated",
    audit_status: "restated",
    currency: "INR",
    unit: "Crores",
    revenue_cr: 1200,
    revenue_growth_pct: 30,
    ebitda_cr: 200,
    ebitda_margin_pct: 16.6,
    pat_cr: 110,
    pat_margin_pct: 9.1,
    eps: 4.5,
    roe_pct: 18,
    roce_pct: 20,
    total_assets_cr: 1000,
    total_debt_cr: 150,
    net_worth_cr: 600,
    operating_cash_flow_cr: 180,
    free_cash_flow_cr: 90,
    is_derived: false,
    source: "RHP",
    source_url: null,
    as_of: null,
    created_at: "2026-09-01",
    updated_at: "2026-09-01",
  };

  const sampleFY24: IPOFinancialRow = {
    id: "f24",
    ipo_id: baseMockIPO.id,
    financial_year: "FY24",
    period_type: "full_year",
    statement_type: "consolidated",
    audit_status: "restated",
    currency: "INR",
    unit: "Crores",
    revenue_cr: 1800,
    revenue_growth_pct: 50,
    ebitda_cr: 320,
    ebitda_margin_pct: 17.7,
    pat_cr: 190,
    pat_margin_pct: 10.5,
    eps: 7.2,
    roe_pct: 22,
    roce_pct: 25,
    total_assets_cr: 1400,
    total_debt_cr: 180,
    net_worth_cr: 850,
    operating_cash_flow_cr: 280,
    free_cash_flow_cr: 150,
    is_derived: false,
    source: "RHP",
    source_url: null,
    as_of: null,
    created_at: "2026-09-01",
    updated_at: "2026-09-01",
  };

  const sampleValuation: IPOValuationRow = {
    id: "v1",
    ipo_id: baseMockIPO.id,
    pe_ratio_low: 22.5,
    pe_ratio_high: 24.3,
    pb_ratio: 3.2,
    ev_ebitda: 14.8,
    market_cap_cr: 4500,
    post_issue_shares_cr: 41.66,
    eps_diluted: 7.2,
    industry_pe_median: 28.5,
    valuation_summary: "Attractive relative to sector median.",
    source: "RHP",
    as_of: null,
    created_at: "2026-09-01",
    updated_at: "2026-09-01",
  };

  const sampleGMP: IPOGMPEntryRow = {
    id: "g1",
    ipo_id: baseMockIPO.id,
    gmp_value: 35,
    gmp_percentage: 32.4,
    estimated_listing_price: 143,
    estimated_listing_gain_pct: 32.4,
    confidence_level: "estimated",
    observed_at: "2026-09-16T10:00:00Z",
    source: "Market Intelligence (Unofficial)",
    source_url: null,
    notes: "Consensus desk quotes",
    created_at: "2026-09-16T10:00:00Z",
  };

  const sampleSubscription: IPOSubscriptionSnapshotRow = {
    id: "s1",
    ipo_id: baseMockIPO.id,
    day_number: 2,
    snapshot_date: "2026-09-16",
    snapshot_time: "2026-09-16T16:00:00Z",
    qib_x: 3.8,
    nii_x: 12.4,
    nii_bighni_x: 14.1,
    nii_smallhni_x: 9.0,
    retail_x: 6.2,
    employee_x: 2.1,
    overall_x: 7.5,
    total_bids_count: 420000,
    total_shares_offered: 35000000,
    source: "NSE",
    as_of: "2026-09-16T16:00:00Z",
    created_at: "2026-09-16T16:00:00Z",
  };

  describe("A1: Listing Pagination Mechanics", () => {
    it("should correctly compute totalPages and window ranges", () => {
      const totalCount = 734;
      const pageSize = 20;
      const totalPages = Math.ceil(totalCount / pageSize);

      assert.equal(totalPages, 37);

      // Page 1
      const page1Start = (1 - 1) * pageSize + 1;
      const page1End = Math.min(totalCount, 1 * pageSize);
      assert.equal(page1Start, 1);
      assert.equal(page1End, 20);

      // Page 37 (last page with remainder)
      const page37Start = (37 - 1) * pageSize + 1;
      const page37End = Math.min(totalCount, 37 * pageSize);
      assert.equal(page37Start, 721);
      assert.equal(page37End, 734);
      assert.equal(page37End - page37Start + 1, 14); // 14 items on last page
    });

    it("should preserve filter query string across page navigation", () => {
      const activeTab: string = "past";
      const activeSegment: string = "NSE_SME";
      const activeYear: string = "2025";
      const searchQuery: string = "solar";
      const sortBy: string = "issue_size";

      const buildUrl = (targetPage: number) => {
        const p = new URLSearchParams();
        if (activeTab !== "all") p.set("tab", activeTab);
        if (activeSegment !== "all") p.set("segment", activeSegment);
        if (activeYear !== "all") p.set("year", activeYear);
        if (searchQuery) p.set("q", searchQuery);
        if (sortBy !== "open_date") p.set("sort", sortBy);
        if (targetPage > 1) p.set("page", String(targetPage));
        const q = p.toString();
        return q ? `/ipos?${q}` : "/ipos";
      };

      const urlPage3 = buildUrl(3);
      assert.ok(urlPage3.includes("page=3"));
      assert.ok(urlPage3.includes("tab=past"));
      assert.ok(urlPage3.includes("segment=NSE_SME"));
      assert.ok(urlPage3.includes("year=2025"));
      assert.ok(urlPage3.includes("q=solar"));
      assert.ok(urlPage3.includes("sort=issue_size"));

      // Page 1 should omit page parameter for clean canonical URL
      const urlPage1 = buildUrl(1);
      assert.ok(!urlPage1.includes("page="));
      assert.ok(urlPage1.includes("tab=past"));
    });
  });

  describe("A2: Score Engine Hardening & ScoreDataEligibility", () => {
    it("should strictly evaluate ScoreDataEligibility: fail when 0 financials exist", () => {
      const eligibility = evaluateScoreDataEligibility({ ipo: baseMockIPO });
      assert.equal(eligibility.isEligible, false);
      assert.equal(eligibility.categories.fundamentals.eligible, false);
      assert.equal(eligibility.categories.fundamentals.periodsCount, 0);
      assert.ok(eligibility.ineligibilityReasons.length > 0);
    });

    it("should strictly evaluate ScoreDataEligibility: fail when only 1 financial period exists", () => {
      const eligibility = evaluateScoreDataEligibility({
        ipo: baseMockIPO,
        financials: [sampleFY24],
      });
      assert.equal(eligibility.isEligible, false);
      assert.equal(eligibility.categories.fundamentals.eligible, false);
      assert.equal(eligibility.categories.fundamentals.periodsCount, 1);
      assert.ok(eligibility.ineligibilityReasons[0].includes("minimum 2 restated fiscal periods"));
    });

    it("should satisfy eligibility when >= 2 fiscal periods with revenue and PAT exist", () => {
      const eligibility = evaluateScoreDataEligibility({
        ipo: baseMockIPO,
        financials: [sampleFY23, sampleFY24],
        valuation: sampleValuation,
        latestGmp: sampleGMP,
        latestSubscription: sampleSubscription,
      });
      assert.equal(eligibility.isEligible, true);
      assert.equal(eligibility.categories.fundamentals.eligible, true);
      assert.equal(eligibility.categories.fundamentals.periodsCount, 2);
      assert.equal(eligibility.categories.valuation.eligible, true);
      assert.equal(eligibility.categories.demand.eligible, true);
      assert.equal(eligibility.categories.sentiment.eligible, true);
    });

    it("should suppress overall score to null and status to INSUFFICIENT_DATA when ineligible", () => {
      const breakdown = calculateIPOScore({ ipo: baseMockIPO });
      assert.equal(breakdown.overall, null);
      assert.equal(breakdown.status, "INSUFFICIENT_DATA");
      assert.equal(breakdown.isInsufficientData, true);
      assert.equal(breakdown.financialHealth.score, null);
      assert.equal(breakdown.valuation.score, null);
      assert.ok(breakdown.missingCategories.includes("Financial Statements"));
    });

    it("should compute a valid, bounded score when minimum prerequisites are satisfied", () => {
      const breakdown = calculateIPOScore({
        ipo: baseMockIPO,
        financials: [sampleFY23, sampleFY24],
        valuation: sampleValuation,
        latestGmp: sampleGMP,
        latestSubscription: sampleSubscription,
      });

      assert.equal(breakdown.status, "VALID_SCORE");
      assert.equal(breakdown.isInsufficientData, false);
      assert.notEqual(breakdown.overall, null);
      assert.ok(breakdown.overall! >= 0 && breakdown.overall! <= 100);
      assert.ok(breakdown.financialHealth.score !== null && breakdown.financialHealth.score > 0);
      assert.ok(breakdown.valuation.score !== null && breakdown.valuation.score > 0);
      assert.equal(breakdown.version, SCORE_METHODOLOGY_VERSION);
    });

    it("should enforce canPersistIPOScore guardrail: refuse to persist un-researched IPOs", () => {
      const emptyBreakdown = calculateIPOScore({ ipo: baseMockIPO });
      assert.equal(canPersistIPOScore(emptyBreakdown), false);

      const onePeriodBreakdown = calculateIPOScore({
        ipo: baseMockIPO,
        financials: [sampleFY24],
      });
      assert.equal(canPersistIPOScore(onePeriodBreakdown), false);

      const validBreakdown = calculateIPOScore({
        ipo: baseMockIPO,
        financials: [sampleFY23, sampleFY24],
        valuation: sampleValuation,
        latestGmp: sampleGMP,
        latestSubscription: sampleSubscription,
      });
      assert.equal(canPersistIPOScore(validBreakdown), true);
    });
  });

  describe("A3: Lifecycle Stored-State Consistency & Authority", () => {
    it("should derive status solely from canonical dates and IST clock without mutating dates", () => {
      const pastIPO: IPORow = {
        ...baseMockIPO,
        open_date: "2024-01-10",
        close_date: "2024-01-12",
        listing_date: "2024-01-18",
        listing_price: 125,
        status: "open", // Stale raw status in DB
      };

      const derivedStatus = deriveIPOStatus(pastIPO, "2026-09-17");
      assert.equal(derivedStatus, "listed");

      // Verify that pastIPO date objects were not mutated in memory
      assert.equal(pastIPO.open_date, "2024-01-10");
      assert.equal(pastIPO.close_date, "2024-01-12");
      assert.equal(pastIPO.listing_date, "2024-01-18");
    });

    it("should accurately resolve active bidding window for today's IST instant", () => {
      const activeIPO: IPORow = {
        ...baseMockIPO,
        open_date: "2026-09-15",
        close_date: "2026-09-18",
        listing_date: "2026-09-24",
        status: "upcoming",
      };

      const derivedStatus = deriveIPOStatus(activeIPO, "2026-09-17");
      assert.equal(derivedStatus, "open");
    });
  });
});
