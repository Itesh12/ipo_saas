import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateIPOScore, SCORE_METHODOLOGY_VERSION } from "../features/ipo/services/ipoScoreEngine";
import { evaluateResearchCoverage } from "../features/ipo/services/researchValidationRules";
import { IPORow, IPOFinancialRow, IPOValuationRow, IPOPromoterRow, IPORiskRow } from "../features/ipo/types/ipo.types";

describe("Phase D: 11-Section Production Detail Verification & Deterministic Score Math", () => {
  const mockBaseIPO: IPORow = {
    id: "test-ipo-001",
    slug: "test-ipo",
    company_name: "Test Issuer Limited",
    symbol: "TEST",
    company_logo: null,
    category: "mainboard",
    issue_type: "book_building",
    status: "listed",
    publication_status: "published",
    price_band_low: 66,
    price_band_high: 70,
    face_value: 10,
    lot_size: 214,
    min_investment: 14980,
    issue_size_cr: 6560,
    fresh_issue_cr: 3560,
    ofs_cr: 3000,
    shares_offered: 93714285,
    retail_quota_pct: 35,
    qib_quota_pct: 50,
    hni_quota_pct: 15,
    exchange: "BSE, NSE",
    lead_managers: [],
    registrar_name: "KFin Technologies",
    announcement_date: null,
    open_date: "2024-09-09",
    close_date: "2024-09-11",
    allotment_date: "2024-09-12",
    refund_date: "2024-09-13",
    listing_date: "2024-09-16",
    listing_price: 150,
    about_company: "Test overview",
    created_by: null,
    approved_by: null,
    published_at: "2024-09-01T00:00:00Z",
    created_at: "2024-09-01T00:00:00Z",
    updated_at: "2024-09-01T00:00:00Z",
    provenance: null,
    is_listing_confirmed: true,
    designated_exchange: "NSE",
    lot_size_status: "verified",
  };

  const mockFinancials: IPOFinancialRow[] = [
    {
      id: "f1",
      ipo_id: "test-ipo-001",
      financial_year: "FY22",
      period_type: "full_year",
      statement_type: "consolidated",
      audit_status: "restated",
      currency: "INR",
      unit: "Crores",
      revenue_cr: 3767.13,
      revenue_growth_pct: null,
      ebitda_cr: 3113.8,
      ebitda_margin_pct: 82.66,
      pat_cr: 709.62,
      pat_margin_pct: 18.84,
      eps: 1.07,
      roe_pct: 11.1,
      roce_pct: 8.9,
      total_assets_cr: null,
      total_debt_cr: 44978.5,
      net_worth_cr: 6488.75,
      operating_cash_flow_cr: null,
      free_cash_flow_cr: null,
      is_derived: false,
      source: "RHP",
      source_url: null,
      as_of: "2024-09-03",
      created_at: "2024-09-03",
      updated_at: "2024-09-03",
    },
    {
      id: "f2",
      ipo_id: "test-ipo-001",
      financial_year: "FY23",
      period_type: "full_year",
      statement_type: "consolidated",
      audit_status: "restated",
      currency: "INR",
      unit: "Crores",
      revenue_cr: 5664.65,
      revenue_growth_pct: 50.37,
      ebitda_cr: 4892.4,
      ebitda_margin_pct: 86.37,
      pat_cr: 1257.8,
      pat_margin_pct: 22.2,
      eps: 1.9,
      roe_pct: 14.6,
      roce_pct: 9.8,
      total_assets_cr: null,
      total_debt_cr: 57842.1,
      net_worth_cr: 9240.22,
      operating_cash_flow_cr: null,
      free_cash_flow_cr: null,
      is_derived: false,
      source: "RHP",
      source_url: null,
      as_of: "2024-09-03",
      created_at: "2024-09-03",
      updated_at: "2024-09-03",
    },
    {
      id: "f3",
      ipo_id: "test-ipo-001",
      financial_year: "FY24",
      period_type: "full_year",
      statement_type: "consolidated",
      audit_status: "restated",
      currency: "INR",
      unit: "Crores",
      revenue_cr: 7617.71,
      revenue_growth_pct: 34.48,
      ebitda_cr: 6684.2,
      ebitda_margin_pct: 87.75,
      pat_cr: 1731.22,
      pat_margin_pct: 22.73,
      eps: 2.52,
      roe_pct: 15.2,
      roce_pct: 10.4,
      total_assets_cr: null,
      total_debt_cr: 74380.0,
      net_worth_cr: 12248.5,
      operating_cash_flow_cr: null,
      free_cash_flow_cr: null,
      is_derived: false,
      source: "RHP",
      source_url: null,
      as_of: "2024-09-03",
      created_at: "2024-09-03",
      updated_at: "2024-09-03",
    },
  ];

  const mockValuation: IPOValuationRow = {
    id: "v1",
    ipo_id: "test-ipo-001",
    pe_ratio_low: 26.2,
    pe_ratio_high: 27.8,
    pb_ratio: 3.2,
    ev_ebitda: 18.5,
    market_cap_cr: 58297,
    post_issue_shares_cr: 832.81,
    eps_diluted: 2.52,
    industry_pe_median: 24.5,
    valuation_summary: "Valuation summary note",
    source: "RHP",
    as_of: "2024-09-03",
    created_at: "2024-09-03",
    updated_at: "2024-09-03",
  };

  const mockPromoters: IPOPromoterRow[] = [
    {
      id: "p1",
      ipo_id: "test-ipo-001",
      promoter_name: "Parent Promoter Limited",
      holding_pre_pct: 100,
      holding_post_pct: 88.75,
      designation: "Holding Entity",
      bio: "Flagship entity",
      source: "RHP",
      created_at: "2024-09-03",
    },
  ];

  const mockRisks: IPORiskRow[] = [
    {
      id: "r1",
      ipo_id: "test-ipo-001",
      title: "Sector cycle risk",
      description: "Macro dependency",
      severity: "high",
      category: "Market",
      display_order: 1,
      source: "RHP",
      created_at: "2024-09-03",
    },
  ];

  describe("1. Score Engine Determinism & Zero Hidden Defaults", () => {
    it("should produce strictly identical scores for identical inputs across iterations", () => {
      const run1 = calculateIPOScore({
        ipo: mockBaseIPO,
        financials: mockFinancials,
        valuation: mockValuation,
        promoters: mockPromoters,
        risks: mockRisks,
      });

      const run2 = calculateIPOScore({
        ipo: mockBaseIPO,
        financials: mockFinancials,
        valuation: mockValuation,
        promoters: mockPromoters,
        risks: mockRisks,
      });

      assert.equal(run1.status, "VALID_SCORE");
      assert.equal(run2.status, "VALID_SCORE");
      assert.equal(run1.overall, run2.overall);
      assert.equal(run1.version, SCORE_METHODOLOGY_VERSION);
      assert.deepEqual(run1.financialHealth, run2.financialHealth);
      assert.deepEqual(run1.valuation, run2.valuation);
    });

    it("should calculate overall score strictly by Category scores -> weights -> normalization -> rounding", () => {
      const result = calculateIPOScore({
        ipo: mockBaseIPO,
        financials: mockFinancials,
        valuation: mockValuation,
        promoters: mockPromoters,
        risks: mockRisks,
      });

      // Expected category points:
      // financialHealth: 20 (max 25)
      // valuation: 9 (max 20)
      // issueStructure: 15 (max 15: 6pts fresh + 3pts OFS + 6pts promoter holding >= 50%)
      // industryRisk: 9 (max 10)
      // subscriptionDemand: null (not opened yet, available = false)
      // marketSentiment: null (unofficial GMP not provided, available = false)
      const earned = (result.financialHealth.score ?? 0) +
        (result.valuation.score ?? 0) +
        (result.issueStructure.score ?? 0) +
        (result.industryRisk.score ?? 0);

      const availableWeights = result.financialHealth.max +
        result.valuation.max +
        result.issueStructure.max +
        result.industryRisk.max; // 25 + 20 + 15 + 10 = 70

      const expectedOverall = Math.round((earned / availableWeights) * 100);

      assert.equal(result.overall, expectedOverall);
      assert.ok(result.overall! >= 70 && result.overall! <= 80);
    });

    it("should cleanly integrate subscription demand and GMP when available without default fallbacks", () => {
      const resultWithMarket = calculateIPOScore({
        ipo: mockBaseIPO,
        financials: mockFinancials,
        valuation: mockValuation,
        promoters: mockPromoters,
        risks: mockRisks,
        latestGmp: {
          id: "gmp1",
          ipo_id: "test-ipo-001",
          gmp_value: 30,
          gmp_percentage: 42.8,
          estimated_listing_price: 100,
          estimated_listing_gain_pct: 42.8,
          confidence_level: "estimated",
          observed_at: "2024-09-10T10:00:00Z",
          source: "Market Intelligence (Unofficial)",
          source_url: null,
          notes: "Consensus desk quotes",
          created_at: "2024-09-10T10:00:00Z",
        },
      });

      assert.equal(resultWithMarket.status, "VALID_SCORE");
      assert.equal(resultWithMarket.marketSentiment.score, 15); // +42.8% GMP qualifies for full 15 sentiment points
      assert.ok(resultWithMarket.overall! >= 75);
    });
  });

  describe("2. State Matrix Coverage Verification", () => {
    it("should classify fully disclosed IPO as 'Research Coverage: COMPLETE'", () => {
      const coverage = evaluateResearchCoverage({
        companyName: "Bajaj Housing Finance Limited",
        financials: [
          { financialYear: "FY22", revenueCr: 3767, patCr: 709 },
          { financialYear: "FY23", revenueCr: 5664, patCr: 1257 },
          { financialYear: "FY24", revenueCr: 7617, patCr: 1731 },
        ],
        valuation: { peRatioHigh: 27.8, industryPeMedian: 24.5, marketCapCr: 58297 },
        peers: [
          { peerCompanyName: "PNB Housing", peRatio: 16.8 },
          { peerCompanyName: "LIC Housing", peRatio: 8.5 },
        ],
        promoters: [{ promoterName: "Bajaj Finance Limited", holdingPostPct: 88.75 }],
        strengths: [{ title: "Heritage" }, { title: "AUM" }, { title: "Asset Quality" }],
        risks: [
          { title: "Risk 1", severity: "high" },
          { title: "Risk 2", severity: "high" },
          { title: "Risk 3", severity: "medium" },
          { title: "Risk 4", severity: "medium" },
          { title: "Risk 5", severity: "low" },
        ],
      });

      assert.equal(coverage.status, "COMPLETE");
      assert.equal(coverage.coverageLabel, "Research Coverage: COMPLETE");
    });

    it("should classify partially disclosed IPO (DRHP stage) as 'Research Coverage: INSUFFICIENT_DATA'", () => {
      const coverage = evaluateResearchCoverage({
        companyName: "Premier Energies Limited",
        financials: [
          { financialYear: "FY22", revenueCr: 1714, patCr: -14 },
          { financialYear: "FY23", revenueCr: 1463, patCr: -13 },
          { financialYear: "FY24", revenueCr: 3171, patCr: 231 },
        ],
        // Valuation, Peers, Promoters and Risks omitted
      });

      assert.equal(coverage.status, "INSUFFICIENT_DATA");
      assert.equal(coverage.coverageLabel, "Research Coverage: INSUFFICIENT_DATA");
      assert.ok(coverage.warnings.length >= 2);
    });

    it("should suppress score for partially disclosed IPO with only 1 fiscal period", () => {
      const partialScore = calculateIPOScore({
        ipo: mockBaseIPO,
        financials: [mockFinancials[0]], // only 1 period
      });

      assert.equal(partialScore.status, "INSUFFICIENT_DATA");
      assert.equal(partialScore.overall, null);
      assert.ok(partialScore.missingCategories.includes("Financial Statements"));
      assert.ok(partialScore.missingCategories.includes("Valuation Multiples"));
    });

    it("should suppress score for completely un-ingested IPO", () => {
      const emptyScore = calculateIPOScore({
        ipo: mockBaseIPO,
        financials: [],
        valuation: null,
      });

      assert.equal(emptyScore.status, "INSUFFICIENT_DATA");
      assert.equal(emptyScore.overall, null);
      assert.equal(emptyScore.isInsufficientData, true);
    });
  });
});
