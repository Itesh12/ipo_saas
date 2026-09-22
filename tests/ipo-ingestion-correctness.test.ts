import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { NseIngestionAdapter } from "../features/external-integrations/adapters/nseExtractor";
import { calculateMinimumInvestment } from "../features/ipo/services/ipoLifecycle";
import { IPOTieredCacheService } from "../features/ipo/services/ipoTieredCacheService";

describe("IPO Ingestion Data Correctness and Unit Contracts Tests", () => {
  describe("1. parseIssueSizeContract Unit Contract", () => {
    test("1.1 Explicit Crores strings normalize directly to Crores", () => {
      const res1 = NseIngestionAdapter.parseIssueSizeContract("Rs. 500 Cr");
      assert.equal(res1.issue_size_cr, 500);
      assert.equal(res1.raw_unit, "INR_CRORES");
      assert.equal(res1.status, "NORMALIZED");

      const res2 = NseIngestionAdapter.parseIssueSizeContract("120.50 Crores");
      assert.equal(res2.issue_size_cr, 120.5);
      assert.equal(res2.raw_unit, "INR_CRORES");

      const res3 = NseIngestionAdapter.parseIssueSizeContract("₹ 1,500.75 crore");
      assert.equal(res3.issue_size_cr, 1500.75);
      assert.equal(res3.raw_unit, "INR_CRORES");
    });

    test("1.2 Explicit Lakhs strings normalize to Crores with 0.01 conversion factor", () => {
      const res1 = NseIngestionAdapter.parseIssueSizeContract("500 Lakhs");
      assert.equal(res1.issue_size_cr, 5); // 500 * 0.01 = 5 Cr
      assert.equal(res1.raw_unit, "INR_LAKHS");
      assert.equal(res1.conversion_factor, 0.01);
      assert.equal(res1.status, "NORMALIZED");

      const res2 = NseIngestionAdapter.parseIssueSizeContract("2500 Lacs");
      assert.equal(res2.issue_size_cr, 25);
      assert.equal(res2.raw_unit, "INR_LAKHS");
    });

    test("1.3 Explicit INR absolute currency values normalize to Crores (divide by 10,000,000)", () => {
      const res1 = NseIngestionAdapter.parseIssueSizeContract("₹50,00,00,000");
      assert.equal(res1.issue_size_cr, 50); // 50 Cr
      assert.equal(res1.raw_unit, "INR_ABSOLUTE");
      assert.equal(res1.status, "NORMALIZED");

      const res2 = NseIngestionAdapter.parseIssueSizeContract("Rs. 100000000");
      assert.equal(res2.issue_size_cr, 10);
      assert.equal(res2.raw_unit, "INR_ABSOLUTE");
    });

    test("1.4 Explicit share counts are NEVER stored in issue_size_cr (returns null)", () => {
      const res1 = NseIngestionAdapter.parseIssueSizeContract("10,010,000 shares");
      assert.equal(res1.issue_size_cr, null);
      assert.equal(res1.raw_unit, "SHARES");
      assert.equal(res1.status, "SHARES_DETECTED");

      const res2 = NseIngestionAdapter.parseIssueSizeContract("5000000 equity shares");
      assert.equal(res2.issue_size_cr, null);
      assert.equal(res2.raw_unit, "SHARES");

      const res3 = NseIngestionAdapter.parseIssueSizeContract("1000000 eq shares");
      assert.equal(res3.issue_size_cr, null);
      assert.equal(res3.raw_unit, "SHARES");
    });

    test("1.5 Bare numbers without unit markers are AMBIGUOUS: NEVER infer unit from magnitude", () => {
      // 500 is a bare number without unit marker - must NOT assume Crores or Lakhs or shares
      const res1 = NseIngestionAdapter.parseIssueSizeContract(500);
      assert.equal(res1.issue_size_cr, null);
      assert.equal(res1.raw_unit, "AMBIGUOUS");
      assert.equal(res1.status, "AMBIGUOUS");

      // 10010000 is a bare number without unit marker - must NOT guess shares or absolute INR
      const res2 = NseIngestionAdapter.parseIssueSizeContract("10010000");
      assert.equal(res2.issue_size_cr, null);
      assert.equal(res2.raw_unit, "AMBIGUOUS");
      assert.equal(res2.status, "AMBIGUOUS");

      const res3 = NseIngestionAdapter.parseIssueSizeContract(25000);
      assert.equal(res3.issue_size_cr, null);
      assert.equal(res3.raw_unit, "AMBIGUOUS");
    });

    test("1.6 Null, zero, empty, and malformed inputs return null issue_size_cr", () => {
      assert.equal(NseIngestionAdapter.parseIssueSizeContract(null).issue_size_cr, null);
      assert.equal(NseIngestionAdapter.parseIssueSizeContract(undefined).issue_size_cr, null);
      assert.equal(NseIngestionAdapter.parseIssueSizeContract("").issue_size_cr, null);
      assert.equal(NseIngestionAdapter.parseIssueSizeContract(0).issue_size_cr, null);
      assert.equal(NseIngestionAdapter.parseIssueSizeContract("--").issue_size_cr, null);
      assert.equal(NseIngestionAdapter.parseIssueSizeContract("N/A").issue_size_cr, null);
    });
  });

  describe("2. Lot Size and Minimum Investment Integrity", () => {
    test("2.1 calculateMinimumInvestment returns NULL when lot size is null or <= 0", () => {
      assert.equal(calculateMinimumInvestment(500, null), null);
      assert.equal(calculateMinimumInvestment(500, undefined), null);
      assert.equal(calculateMinimumInvestment(500, 0), null);
      assert.equal(calculateMinimumInvestment(500, -1), null);
    });

    test("2.2 calculateMinimumInvestment returns NULL when price band is null or <= 0", () => {
      assert.equal(calculateMinimumInvestment(null, 30), null);
      assert.equal(calculateMinimumInvestment(undefined, 30), null);
      assert.equal(calculateMinimumInvestment(0, 30), null);
      assert.equal(calculateMinimumInvestment(-100, 30), null);
    });

    test("2.3 calculateMinimumInvestment calculates exact value when both price and lot size are valid", () => {
      assert.equal(calculateMinimumInvestment(500, 30), 15000);
      assert.equal(calculateMinimumInvestment(142.5, 100), 14250);
      // Fallback to priceBandLow if high is null
      assert.equal(calculateMinimumInvestment(null, 50, 200), 10000);
    });
  });

  describe("3. Multi-Representation Cache Invalidation", () => {
    test("3.1 revalidateIPO invalidates all sub-domain tags for the IPO", async () => {
      const ipoId = "test-ipo-cache-invalidation-123";
      const tags = IPOTieredCacheService.getTags(ipoId);

      // Seed entries across multiple domains
      await IPOTieredCacheService.getOrSet(`research:${ipoId}`, [tags.research], 60, async () => ({ res: 1 }));
      await IPOTieredCacheService.getOrSet(`gmp:${ipoId}`, [tags.gmp], 60, async () => ({ gmp: 50 }));
      await IPOTieredCacheService.getOrSet(`sub:${ipoId}`, [tags.subscription], 60, async () => ({ sub: 2.5 }));

      // Purge all representations
      const purged = IPOTieredCacheService.revalidateIPO(ipoId);
      assert.ok(purged >= 3, `Expected at least 3 representations purged, got ${purged}`);

      // Verify fresh fetch is triggered (miss recorded)
      let fetchCount = 0;
      await IPOTieredCacheService.getOrSet(`research:${ipoId}`, [tags.research], 60, async () => {
        fetchCount++;
        return { res: 2 };
      });
      assert.equal(fetchCount, 1, "Expected fetcher to be executed again after revalidateIPO");
    });
  });
});
