import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateResearchHardInvariants,
  evaluateResearchCoverage,
  HardInvariantViolationError,
  RawResearchPayload,
} from "../features/ipo/services/researchValidationRules";

describe("Phase C: Research Ingestion Invariant & Provenance Tests", () => {
  describe("Hard Domain Invariants (Blocking)", () => {
    it("should reject inverted price bands (low > high)", () => {
      const payload: RawResearchPayload = {
        companyName: "Test Company",
        priceBandLow: 100,
        priceBandHigh: 90,
      };
      assert.throws(
        () => validateResearchHardInvariants(payload),
        (err: Error) => {
          assert.ok(err instanceof HardInvariantViolationError);
          assert.equal(err.invariantCode, "PRICE_BAND_INVERTED");
          return true;
        }
      );
    });

    it("should reject open date after close date", () => {
      const payload: RawResearchPayload = {
        companyName: "Test Company",
        openDate: "2024-09-12",
        closeDate: "2024-09-10",
      };
      assert.throws(
        () => validateResearchHardInvariants(payload),
        (err: Error) => {
          assert.ok(err instanceof HardInvariantViolationError);
          assert.equal(err.invariantCode, "DATES_OUT_OF_ORDER");
          return true;
        }
      );
    });

    it("should reject listing date before close date", () => {
      const payload: RawResearchPayload = {
        companyName: "Test Company",
        openDate: "2024-09-09",
        closeDate: "2024-09-11",
        listingDate: "2024-09-10",
      };
      assert.throws(
        () => validateResearchHardInvariants(payload),
        (err: Error) => {
          assert.ok(err instanceof HardInvariantViolationError);
          assert.equal(err.invariantCode, "LISTING_BEFORE_CLOSE");
          return true;
        }
      );
    });

    it("should reject post-issue promoter shareholding exceeding 100%", () => {
      const payload: RawResearchPayload = {
        companyName: "Test Company",
        promoters: [
          { promoterName: "Promoter A", holdingPostPct: 60 },
          { promoterName: "Promoter B", holdingPostPct: 55 },
        ],
      };
      assert.throws(
        () => validateResearchHardInvariants(payload),
        (err: Error) => {
          assert.ok(err instanceof HardInvariantViolationError);
          assert.equal(err.invariantCode, "PROMOTER_HOLDING_EXCEEDS_100_PCT");
          return true;
        }
      );
    });

    it("should allow valid domain data and not enforce synthetic rules like Rev >= EBITDA >= PAT", () => {
      // In certain reporting periods, negative EBITDA or non-standard provisions can exist.
      // The system should validate structural integrity without blocking on over-simplistic formulas.
      const validPayload: RawResearchPayload = {
        companyName: "Bajaj Housing Finance Limited",
        priceBandLow: 66,
        priceBandHigh: 70,
        openDate: "2024-09-09",
        closeDate: "2024-09-11",
        listingDate: "2024-09-16",
        financials: [
          { financialYear: "FY22", revenueCr: 3767.13, ebitdaCr: 3113.8, patCr: 709.62 },
          { financialYear: "FY23", revenueCr: 5664.65, ebitdaCr: 4892.4, patCr: 1257.8 },
          { financialYear: "FY24", revenueCr: 7617.71, ebitdaCr: 6684.2, patCr: 1731.22 },
        ],
        promoters: [{ promoterName: "Bajaj Finance Limited", holdingPostPct: 88.75 }],
      };

      assert.doesNotThrow(() => validateResearchHardInvariants(validPayload));
    });
  });

  describe("Quality & Coverage Checks (Non-Blocking)", () => {
    it("should classify 3 restated periods + peers + promoters + risks as COMPLETE coverage", () => {
      const payload: RawResearchPayload = {
        companyName: "Bajaj Housing Finance Limited",
        financials: [
          { financialYear: "FY22", revenueCr: 3767.13, patCr: 709.62 },
          { financialYear: "FY23", revenueCr: 5664.65, patCr: 1257.8 },
          { financialYear: "FY24", revenueCr: 7617.71, patCr: 1731.22 },
        ],
        valuation: { peRatioHigh: 27.8, industryPeMedian: 24.5, marketCapCr: 58297 },
        peers: [
          { peerCompanyName: "PNB Housing", peRatio: 16.8 },
          { peerCompanyName: "LIC Housing", peRatio: 8.5 },
        ],
        promoters: [{ promoterName: "Bajaj Finance Limited", holdingPostPct: 88.75 }],
        strengths: [{ title: "Brand Heritage" }, { title: "AUM Scale" }, { title: "Asset Quality" }],
        risks: [
          { title: "Real Estate Cycles", severity: "high" },
          { title: "Interest Rate Volatility", severity: "high" },
          { title: "Bank Competition", severity: "medium" },
          { title: "Urban Concentration", severity: "medium" },
          { title: "Debt Access", severity: "low" },
        ],
      };

      const coverage = evaluateResearchCoverage(payload);
      assert.equal(coverage.status, "COMPLETE");
      assert.equal(coverage.completenessPct, 100);
      assert.equal(coverage.warnings.length, 0);
    });

    it("should output WARNING/PARTIAL rather than throwing when fewer than 5 risks are present", () => {
      const payload: RawResearchPayload = {
        companyName: "Partial Disclosures Limited",
        financials: [
          { financialYear: "FY23", revenueCr: 500, patCr: 50 },
          { financialYear: "FY24", revenueCr: 700, patCr: 80 },
        ],
        risks: [
          { title: "Only Risk 1", severity: "high" },
          { title: "Only Risk 2", severity: "medium" },
        ],
      };

      const coverage = evaluateResearchCoverage(payload);
      assert.notEqual(coverage.status, "COMPLETE");
      assert.ok(coverage.warnings.some((w) => w.includes("Fewer than 5 risks")));
      // Non-blocking: coverage is evaluated cleanly without throwing
    });
  });
});
