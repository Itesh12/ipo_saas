/**
 * tests/application-bidding.test.ts
 *
 * Candidate A — Bidding Engine & Domain Rules Test Suite.
 *
 * Validates:
 * 1. SEBI Multi-Bid Max-Amount Rule (Max of active bids, never the sum).
 * 2. Cut-off price eligibility and enforcement.
 * 3. Investor category limits (Retail <= 2L, sHNI > 2L and <= 10L, bHNI > 10L).
 * 4. Lot divisibility and price band boundaries.
 * 5. State machine transition invariants and terminal states.
 * 6. Server authority anti-tampering (server recalculates all values).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getCategoryLotBounds,
  calculateAndValidateBids,
  CanonicalBiddingTerms,
  BidRequestInput,
} from "../features/application/services/lotSizeCalculator";
import {
  isValidApplicationTransition,
  ApplicationStatus,
} from "../features/application/services/applicationLifecycle";

describe("Candidate A: IPO Application & Bidding Workflow Engine", () => {
  // Canonical sample IPO terms (Bajaj Housing Finance style: 66 - 70, lot size 214)
  const canonicalTerms: CanonicalBiddingTerms = {
    lotSize: 214,
    priceBandLow: 66,
    priceBandHigh: 70,
    isBookBuilding: true,
  };

  describe("1. SEBI Maximum Bid Invariant (Application Amount = Max Bid, NEVER Sum)", () => {
    it("should set application amount strictly to the maximum bid amount across 3 bids", () => {
      const bids: BidRequestInput[] = [
        { bidNumber: 1, lotCount: 1, price: 66, isCutoff: false }, // 214 * 66 = 14,124
        { bidNumber: 2, lotCount: 2, price: 68, isCutoff: false }, // 428 * 68 = 29,104
        { bidNumber: 3, lotCount: 3, price: 70, isCutoff: true },  // 642 * 70 = 44,940
      ];

      const result = calculateAndValidateBids(canonicalTerms, bids, "retail");
      assert.equal(result.isValid, true);
      assert.equal(result.bids.length, 3);

      // Verify individual bid amounts
      assert.equal(result.bids[0].amount, 14124);
      assert.equal(result.bids[1].amount, 29104);
      assert.equal(result.bids[2].amount, 44940);

      // Sum would be 88,168; SEBI invariant requires MAX which is 44,940
      assert.notEqual(result.applicationAmount, 14124 + 29104 + 44940);
      assert.equal(result.applicationAmount, 44940);
      assert.equal(result.activeBidNumber, 3);
      assert.equal(result.totalLots, 3);
      assert.equal(result.totalQuantity, 642);
    });

    it("should handle non-monotonic bid orders correctly (e.g. Bid 1 is highest)", () => {
      const bids: BidRequestInput[] = [
        { bidNumber: 1, lotCount: 5, price: 70, isCutoff: true },  // 1070 * 70 = 74,900 (Highest)
        { bidNumber: 2, lotCount: 2, price: 67, isCutoff: false }, // 428 * 67 = 28,676
        { bidNumber: 3, lotCount: 1, price: 66, isCutoff: false }, // 214 * 66 = 14,124
      ];

      const result = calculateAndValidateBids(canonicalTerms, bids, "retail");
      assert.equal(result.isValid, true);
      assert.equal(result.applicationAmount, 74900);
      assert.equal(result.activeBidNumber, 1);
      assert.equal(result.totalLots, 5);
      assert.equal(result.totalQuantity, 1070);
    });
  });

  describe("2. Cut-Off Price Eligibility & Auto-Price Locking", () => {
    it("should permit cut-off for Retail and force effective price to priceBandHigh", () => {
      const bids: BidRequestInput[] = [
        { bidNumber: 1, lotCount: 2, price: 66, isCutoff: true }, // price 66 supplied, but isCutoff=true
      ];

      const result = calculateAndValidateBids(canonicalTerms, bids, "retail");
      assert.equal(result.isValid, true);
      assert.equal(result.bids[0].isCutoff, true);
      assert.equal(result.bids[0].price, 70); // Must be forced to priceBandHigh (70)
      assert.equal(result.bids[0].amount, 2 * 214 * 70);
      assert.equal(result.applicationAmount, 29960);
    });

    it("should strictly reject cut-off for Small NII (s_hni)", () => {
      const bids: BidRequestInput[] = [
        { bidNumber: 1, lotCount: 15, isCutoff: true },
      ];

      const result = calculateAndValidateBids(canonicalTerms, bids, "s_hni");
      assert.equal(result.isValid, false);
      assert.match(result.validationError!, /Cut-off price is not permitted for category 's_hni'/);
    });

    it("should strictly reject cut-off for Big NII (b_hni)", () => {
      const bids: BidRequestInput[] = [
        { bidNumber: 1, lotCount: 70, isCutoff: true },
      ];

      const result = calculateAndValidateBids(canonicalTerms, bids, "b_hni");
      assert.equal(result.isValid, false);
      assert.match(result.validationError!, /Cut-off price is not permitted for category 'b_hni'/);
    });

    it("should permit cut-off for Employee and Shareholder categories", () => {
      const empBids: BidRequestInput[] = [{ bidNumber: 1, lotCount: 1, isCutoff: true }];
      const empResult = calculateAndValidateBids(canonicalTerms, empBids, "employee");
      assert.equal(empResult.isValid, true);

      const shBids: BidRequestInput[] = [{ bidNumber: 1, lotCount: 1, isCutoff: true }];
      const shResult = calculateAndValidateBids(canonicalTerms, shBids, "shareholder");
      assert.equal(shResult.isValid, true);
    });
  });

  describe("3. SEBI Category Threshold Enforcements", () => {
    it("should reject Retail application exceeding ₹2,00,000", () => {
      // 14 lots * 214 shares * ₹70 = ₹2,09,720 (> ₹2,00,000)
      const bids: BidRequestInput[] = [
        { bidNumber: 1, lotCount: 14, price: 70, isCutoff: false },
      ];

      const result = calculateAndValidateBids(canonicalTerms, bids, "retail");
      assert.equal(result.isValid, false);
      assert.match(result.validationError!, /exceeds the SEBI regulatory limit of ₹2,00,000/);
    });

    it("should accept Retail application within ₹2,00,000", () => {
      // 13 lots * 214 shares * ₹70 = ₹1,94,740 (<= ₹2,00,000)
      const bids: BidRequestInput[] = [
        { bidNumber: 1, lotCount: 13, price: 70, isCutoff: false },
      ];

      const result = calculateAndValidateBids(canonicalTerms, bids, "retail");
      assert.equal(result.isValid, true);
      assert.equal(result.applicationAmount, 194740);
    });

    it("should reject sHNI application with amount <= ₹2,00,000", () => {
      // 13 lots * 214 shares * ₹70 = ₹1,94,740 (<= 2L)
      const bids: BidRequestInput[] = [
        { bidNumber: 1, lotCount: 13, price: 70, isCutoff: false },
      ];

      const result = calculateAndValidateBids(canonicalTerms, bids, "s_hni");
      assert.equal(result.isValid, false);
      assert.match(result.validationError!, /must be strictly greater than ₹2,00,000/);
    });

    it("should reject sHNI application with amount > ₹10,00,000", () => {
      // 70 lots * 214 shares * ₹70 = ₹10,48,600 (> 10L)
      const bids: BidRequestInput[] = [
        { bidNumber: 1, lotCount: 70, price: 70, isCutoff: false },
      ];

      const result = calculateAndValidateBids(canonicalTerms, bids, "s_hni");
      assert.equal(result.isValid, false);
      assert.match(result.validationError!, /cannot exceed ₹10,00,000/);
    });

    it("should accept valid sHNI application between ₹2,00,000 and ₹10,00,000", () => {
      // 20 lots * 214 shares * ₹70 = ₹2,99,600
      const bids: BidRequestInput[] = [
        { bidNumber: 1, lotCount: 20, price: 70, isCutoff: false },
      ];

      const result = calculateAndValidateBids(canonicalTerms, bids, "s_hni");
      assert.equal(result.isValid, true);
      assert.equal(result.applicationAmount, 299600);
    });

    it("should reject bHNI application with amount <= ₹10,00,000", () => {
      // 60 lots * 214 shares * ₹70 = ₹8,98,800
      const bids: BidRequestInput[] = [
        { bidNumber: 1, lotCount: 60, price: 70, isCutoff: false },
      ];

      const result = calculateAndValidateBids(canonicalTerms, bids, "b_hni");
      assert.equal(result.isValid, false);
      assert.match(result.validationError!, /must be strictly greater than ₹10,00,000/);
    });

    it("should accept valid bHNI application with amount > ₹10,00,000", () => {
      // 75 lots * 214 shares * ₹70 = ₹11,23,500
      const bids: BidRequestInput[] = [
        { bidNumber: 1, lotCount: 75, price: 70, isCutoff: false },
      ];

      const result = calculateAndValidateBids(canonicalTerms, bids, "b_hni");
      assert.equal(result.isValid, true);
      assert.equal(result.applicationAmount, 1123500);
    });
  });

  describe("4. Category Lot Bounds Helper", () => {
    it("should compute exact lot bounds for all categories", () => {
      const retailBounds = getCategoryLotBounds(canonicalTerms, "retail");
      assert.equal(retailBounds.minLots, 1);
      assert.equal(retailBounds.maxLots, 13); // floor(200000 / (214 * 70)) = 13
      assert.equal(retailBounds.cutoffPermitted, true);

      const sHniBounds = getCategoryLotBounds(canonicalTerms, "s_hni");
      assert.equal(sHniBounds.minLots, 14); // 13 + 1 = 14 lots (14 * 214 * 70 = 209,720 > 2L)
      assert.equal(sHniBounds.maxLots, 70); // floor(1000000 / (214 * 66)) = 70 lots
      assert.equal(sHniBounds.cutoffPermitted, false);

      const bHniBounds = getCategoryLotBounds(canonicalTerms, "b_hni");
      assert.equal(bHniBounds.minLots, 67); // floor(1000000 / (214 * 70)) + 1 = 67 lots
      assert.equal(bHniBounds.cutoffPermitted, false);
    });
  });

  describe("5. Structural Constraints & Fixed Price Issues", () => {
    it("should strictly reject more than 3 bids in book-building", () => {
      const bids: BidRequestInput[] = [
        { bidNumber: 1, lotCount: 1, price: 70 },
        { bidNumber: 2, lotCount: 2, price: 70 },
        { bidNumber: 3, lotCount: 3, price: 70 },
        { bidNumber: 4, lotCount: 4, price: 70 },
      ];

      const result = calculateAndValidateBids(canonicalTerms, bids, "retail");
      assert.equal(result.isValid, false);
      assert.match(result.validationError!, /maximum of 3 bids is allowed/);
    });

    it("should reject price outside price band", () => {
      const lowBid: BidRequestInput[] = [{ bidNumber: 1, lotCount: 1, price: 65 }]; // Low is 66
      const lowRes = calculateAndValidateBids(canonicalTerms, lowBid, "retail");
      assert.equal(lowRes.isValid, false);
      assert.match(lowRes.validationError!, /outside the allowed price band/);

      const highBid: BidRequestInput[] = [{ bidNumber: 1, lotCount: 1, price: 71 }]; // High is 70
      const highRes = calculateAndValidateBids(canonicalTerms, highBid, "retail");
      assert.equal(highRes.isValid, false);
      assert.match(highRes.validationError!, /outside the allowed price band/);
    });

    it("should enforce exactly 1 bid at fixed issue price for fixed-price IPOs", () => {
      const fixedTerms: CanonicalBiddingTerms = {
        lotSize: 1000,
        priceBandLow: 120,
        priceBandHigh: 120,
        isBookBuilding: false,
      };

      const multipleBids: BidRequestInput[] = [
        { bidNumber: 1, lotCount: 1, price: 120 },
        { bidNumber: 2, lotCount: 1, price: 120 },
      ];

      const result = calculateAndValidateBids(fixedTerms, multipleBids, "retail");
      assert.equal(result.isValid, false);
      assert.match(result.validationError!, /Fixed-price IPOs support exactly 1 bid/);
    });
  });

  describe("6. State Machine Transitions & Invariants", () => {
    it("should permit valid standard forward lifecycle transitions", () => {
      // draft -> applied
      assert.equal(isValidApplicationTransition("draft", "applied"), true);
      // applied -> mandate_pending
      assert.equal(isValidApplicationTransition("applied", "mandate_pending"), true);
      // mandate_pending -> mandate_approved
      assert.equal(isValidApplicationTransition("mandate_pending", "mandate_approved"), true);
      // mandate_approved -> funds_blocked
      assert.equal(isValidApplicationTransition("mandate_approved", "funds_blocked"), true);
      // funds_blocked -> bidding_closed
      assert.equal(isValidApplicationTransition("funds_blocked", "bidding_closed"), true);
      // bidding_closed -> allotment_pending
      assert.equal(isValidApplicationTransition("bidding_closed", "allotment_pending"), true);
    });

    it("should permit withdrawal/cancellation from pre-allotment states", () => {
      assert.equal(isValidApplicationTransition("draft", "cancelled"), true);
      assert.equal(isValidApplicationTransition("applied", "cancelled"), true);
      assert.equal(isValidApplicationTransition("mandate_pending", "cancelled"), true);
      assert.equal(isValidApplicationTransition("mandate_approved", "cancelled"), true);
      assert.equal(isValidApplicationTransition("funds_blocked", "cancelled"), true);
    });

    it("should reject transitions out of terminal states (completed, cancelled)", () => {
      assert.equal(isValidApplicationTransition("completed", "applied"), false);
      assert.equal(isValidApplicationTransition("completed", "draft"), false);
      assert.equal(isValidApplicationTransition("cancelled", "applied"), false);
      assert.equal(isValidApplicationTransition("cancelled", "draft"), false);
      assert.equal(isValidApplicationTransition("cancelled", "mandate_approved"), false);
    });

    it("should reject illegal backward jumps", () => {
      assert.equal(isValidApplicationTransition("mandate_approved", "draft"), false);
      assert.equal(isValidApplicationTransition("bidding_closed", "applied"), false);
      assert.equal(isValidApplicationTransition("allotment_pending", "draft"), false);
    });

    it("identity transition (same status) should always be valid", () => {
      const statuses: ApplicationStatus[] = ["draft", "applied", "mandate_pending", "mandate_approved", "completed", "cancelled"];
      for (const s of statuses) {
        assert.equal(isValidApplicationTransition(s, s), true);
      }
    });
  });
});
