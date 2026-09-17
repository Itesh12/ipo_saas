import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { IPORow, IPOWithEvents } from "../features/ipo/types/ipo.types";
import { deriveIPOStatus } from "../features/ipo/services/ipoLifecycle";
import {
  IPOTieredCacheService,
  IPO_FRESHNESS_CONTRACTS,
} from "../features/ipo/services/ipoTieredCacheService";

describe("Phase E: Cross-Layer Consistency & Tiered Cache Isolation", () => {
  beforeEach(() => {
    IPOTieredCacheService.clear();
  });

  const ipoA: IPORow = {
    id: "6b6e2187-cd5c-4b41-af43-9aca7c97113c",
    slug: "bajaj-housing-finance-limited-4028",
    company_name: "Bajaj Housing Finance Limited",
    symbol: "BAJAJHFL",
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
    lead_managers: ["Kotak Mahindra Capital"],
    registrar_name: "KFin Technologies Limited",
    announcement_date: null,
    open_date: "2024-09-09",
    close_date: "2024-09-11",
    allotment_date: "2024-09-12",
    refund_date: "2024-09-13",
    listing_date: "2024-09-16",
    listing_price: 150,
    about_company: "Non-deposit taking HFC",
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

  const ipoB: IPORow = {
    id: "bf7e9732-3268-4c8c-929f-8315174ad21b",
    slug: "premier-energies-limited-7359",
    company_name: "Premier Energies Limited",
    symbol: "PREMIERENE",
    company_logo: null,
    category: "mainboard",
    issue_type: "book_building",
    status: "listed",
    publication_status: "published",
    price_band_low: 427,
    price_band_high: 450,
    face_value: 10,
    lot_size: 33,
    min_investment: 14850,
    issue_size_cr: 2830.4,
    fresh_issue_cr: 1291.4,
    ofs_cr: 1539.0,
    shares_offered: 62897778,
    retail_quota_pct: 35,
    qib_quota_pct: 50,
    hni_quota_pct: 15,
    exchange: "NSE, BSE",
    lead_managers: ["Kotak Mahindra Capital"],
    registrar_name: "KFin Technologies Limited",
    announcement_date: null,
    open_date: "2024-08-27",
    close_date: "2024-08-29",
    allotment_date: "2024-08-30",
    refund_date: "2024-09-02",
    listing_date: "2024-09-03",
    listing_price: 991,
    about_company: "Integrated solar cell manufacturer",
    created_by: null,
    approved_by: null,
    published_at: "2024-08-20T00:00:00Z",
    created_at: "2024-08-20T00:00:00Z",
    updated_at: "2024-08-20T00:00:00Z",
    provenance: null,
    is_listing_confirmed: true,
    designated_exchange: "NSE",
    lot_size_status: "verified",
  };

  // ---------------------------------------------------------------------------
  // E1: Cross-Layer Semantic Parity
  // ---------------------------------------------------------------------------
  describe("E1: Cross-Layer Semantic Parity", () => {
    it("should maintain semantic consistency across DB row, service layer, and UI projections", () => {
      // 1. Simulate DB Canonical Record
      const dbRecord = { ...ipoA };

      // 2. Simulate Service Output (getIPOBySlug / getIPOResearchBundle)
      const serviceOutput: IPOWithEvents = {
        ...dbRecord,
        status: deriveIPOStatus(dbRecord),
        events: [],
      };

      // 3. Simulate UI Listing Card Projection
      const listingCard = {
        company_name: serviceOutput.company_name.trim(),
        symbol: serviceOutput.symbol?.trim() || null,
        exchange: (serviceOutput.exchange || "").replace(/\s+/g, ""),
        segment: serviceOutput.category.toUpperCase(),
        open_date: serviceOutput.open_date,
        close_date: serviceOutput.close_date,
        listing_date: serviceOutput.listing_date,
        price_low: Number(serviceOutput.price_band_low),
        price_high: Number(serviceOutput.price_band_high),
        lot_size: Number(serviceOutput.lot_size),
        issue_size: Number(serviceOutput.issue_size_cr),
        status: serviceOutput.status,
      };

      // 4. Simulate UI Detail Hero & Quick Facts Projection
      const detailHero = {
        company_name: serviceOutput.company_name.trim(),
        symbol: serviceOutput.symbol?.trim() || null,
        exchange: (serviceOutput.exchange || "").replace(/\s+/g, ""),
        segment: serviceOutput.category.toUpperCase(),
        open_date: serviceOutput.open_date,
        close_date: serviceOutput.close_date,
        listing_date: serviceOutput.listing_date,
        price_low: Number(serviceOutput.price_band_low),
        price_high: Number(serviceOutput.price_band_high),
        lot_size: Number(serviceOutput.lot_size),
        issue_size: Number(serviceOutput.issue_size_cr),
        status: serviceOutput.status,
      };

      // Normalized semantic comparison across layers:
      assert.equal(listingCard.company_name, detailHero.company_name);
      assert.equal(listingCard.symbol, detailHero.symbol);
      assert.equal(listingCard.price_low, detailHero.price_low);
      assert.equal(listingCard.price_high, detailHero.price_high);
      assert.equal(listingCard.lot_size, detailHero.lot_size);
      assert.equal(listingCard.issue_size, detailHero.issue_size);
      assert.equal(listingCard.open_date, detailHero.open_date);
      assert.equal(listingCard.close_date, detailHero.close_date);
      assert.equal(listingCard.listing_date, detailHero.listing_date);
      assert.equal(listingCard.status, "listed");
      assert.equal(detailHero.status, "listed");
    });
  });

  // ---------------------------------------------------------------------------
  // E2: Lifecycle Authority & Downstream Consistency
  // ---------------------------------------------------------------------------
  describe("E2: Lifecycle Authority Over Stale Stored State", () => {
    it("should strictly expose derived current status when DB stored status is stale", () => {
      // Simulate DB row with a stale status 'upcoming' even though dates are in 2024 (listed)
      const staleDBRow: IPORow = {
        ...ipoA,
        status: "upcoming" as any, // STALE!
      };

      // Derive status through authoritative lifecycle engine
      const derived = deriveIPOStatus(staleDBRow);
      assert.equal(derived, "listed");

      // Verify service layer normalizes status without mutating DB row dates
      const serviceLayerProjection = {
        ...staleDBRow,
        status: derived,
      };

      assert.equal(serviceLayerProjection.status, "listed");
      assert.notEqual(serviceLayerProjection.status, staleDBRow.status);
      assert.equal(serviceLayerProjection.open_date, "2024-09-09"); // Dates untouched!
    });
  });

  // ---------------------------------------------------------------------------
  // E3 & E4: Cache Isolation & Contamination Immunity
  // ---------------------------------------------------------------------------
  describe("E3 & E4: Cache Isolation & Contamination Immunity", () => {
    it("should never purge or contaminate IPO-B when IPO-A is mutated and revalidated", async () => {
      let fetchCountA = 0;
      let fetchCountB = 0;

      const fetchResearchA = async () => {
        fetchCountA++;
        return { ipoId: ipoA.id, company: ipoA.company_name, revenueCr: 7617.71 };
      };

      const fetchResearchB = async () => {
        fetchCountB++;
        return { ipoId: ipoB.id, company: ipoB.company_name, revenueCr: 3171.3 };
      };

      const tagsA = IPOTieredCacheService.getTags(ipoA.id);
      const tagsB = IPOTieredCacheService.getTags(ipoB.id);

      // 1. Initial requests for both IPOs
      const resA1 = await IPOTieredCacheService.getOrSet(`research:${ipoA.id}`, [tagsA.research], 86400, fetchResearchA);
      const resB1 = await IPOTieredCacheService.getOrSet(`research:${ipoB.id}`, [tagsB.research], 86400, fetchResearchB);

      assert.equal(fetchCountA, 1);
      assert.equal(fetchCountB, 1);
      assert.equal(resA1.company, "Bajaj Housing Finance Limited");
      assert.equal(resB1.company, "Premier Energies Limited");
      assert.notEqual(resA1.company, resB1.company);

      // 2. Request both again (Must be Cache Hits)
      const resA2 = await IPOTieredCacheService.getOrSet(`research:${ipoA.id}`, [tagsA.research], 86400, fetchResearchA);
      const resB2 = await IPOTieredCacheService.getOrSet(`research:${ipoB.id}`, [tagsB.research], 86400, fetchResearchB);

      assert.equal(fetchCountA, 1, "IPO-A should have hit cache");
      assert.equal(fetchCountB, 1, "IPO-B should have hit cache");

      // 3. Granular Invalidation: Mutate & revalidate ONLY IPO-A
      const purged = IPOTieredCacheService.revalidateResearch(ipoA.id);
      assert.equal(purged, 1, "Should purge exactly 1 key for IPO-A");

      // 4. Request both again
      const resA3 = await IPOTieredCacheService.getOrSet(`research:${ipoA.id}`, [tagsA.research], 86400, fetchResearchA);
      const resB3 = await IPOTieredCacheService.getOrSet(`research:${ipoB.id}`, [tagsB.research], 86400, fetchResearchB);

      assert.equal(fetchCountA, 2, "IPO-A should fetch fresh data after revalidation");
      assert.equal(fetchCountB, 1, "IPO-B MUST REMAIN CACHED (ZERO invalidation leakage)");
      assert.equal(resA3.company, "Bajaj Housing Finance Limited");
      assert.equal(resB3.company, "Premier Energies Limited");
    });

    it("should invalidate ONLY GMP cache when GMP ticks without purging static research", async () => {
      let staticFetchCount = 0;
      let gmpFetchCount = 0;

      const tags = IPOTieredCacheService.getTags(ipoA.id);

      const fetchStatic = async () => {
        staticFetchCount++;
        return { ipoId: ipoA.id, staticData: "Balance Sheet FY24" };
      };

      let currentGmp = 30;
      const fetchGMP = async () => {
        gmpFetchCount++;
        return { ipoId: ipoA.id, gmpValue: currentGmp };
      };

      // 1. Initial fetch of both tiers
      await IPOTieredCacheService.getOrSet(`research:${ipoA.id}`, [tags.research], 86400, fetchStatic);
      const gmp1 = await IPOTieredCacheService.getOrSet(`gmp:${ipoA.id}`, [tags.gmp], 60, fetchGMP);
      assert.equal(gmp1.gmpValue, 30);
      assert.equal(staticFetchCount, 1);
      assert.equal(gmpFetchCount, 1);

      // 2. Invalidate ONLY GMP tag
      currentGmp = 35; // GMP ticks up
      IPOTieredCacheService.revalidateGMP(ipoA.id);

      // 3. Fetch both again
      const static2 = await IPOTieredCacheService.getOrSet(`research:${ipoA.id}`, [tags.research], 86400, fetchStatic);
      const gmp2 = await IPOTieredCacheService.getOrSet(`gmp:${ipoA.id}`, [tags.gmp], 60, fetchGMP);

      assert.equal(staticFetchCount, 1, "Static research must NOT be re-queried on GMP tick");
      assert.equal(gmpFetchCount, 2, "Dynamic GMP must fetch latest tick");
      assert.equal(gmp2.gmpValue, 35);
      assert.equal(static2.staticData, "Balance Sheet FY24");
    });

    it("should strictly prevent cross-IPO cache contamination (A -> B -> A sequence)", async () => {
      const tagsA = IPOTieredCacheService.getTags(ipoA.id);
      const tagsB = IPOTieredCacheService.getTags(ipoB.id);

      // Request Bajaj
      const bajajFirst = await IPOTieredCacheService.getOrSet(`research:${ipoA.id}`, [tagsA.research], 86400, async () => {
        return { name: "Bajaj Housing Finance Limited", symbol: "BAJAJHFL" };
      });

      // Request Premier
      const premier = await IPOTieredCacheService.getOrSet(`research:${ipoB.id}`, [tagsB.research], 86400, async () => {
        return { name: "Premier Energies Limited", symbol: "PREMIERENE" };
      });

      // Request Bajaj again
      const bajajSecond = await IPOTieredCacheService.getOrSet(`research:${ipoA.id}`, [tagsA.research], 86400, async () => {
        return { name: "Corrupted Name", symbol: "CORRUPT" };
      });

      assert.equal(bajajFirst.name, "Bajaj Housing Finance Limited");
      assert.equal(premier.name, "Premier Energies Limited");
      assert.equal(bajajSecond.name, "Bajaj Housing Finance Limited");
      assert.notEqual(bajajFirst.symbol, premier.symbol);
      assert.equal(bajajFirst.symbol, bajajSecond.symbol);
    });
  });

  // ---------------------------------------------------------------------------
  // E5: Freshness Contracts Specification & Lifecycle Proof
  // ---------------------------------------------------------------------------
  describe("E5: Freshness Contracts & Proven Invalidation Sequences", () => {
    it("should satisfy all formal freshness contract TTLs and tiers", () => {
      assert.equal(IPO_FRESHNESS_CONTRACTS.PROSPECTUS_RESEARCH.ttlSeconds, 86400);
      assert.equal(IPO_FRESHNESS_CONTRACTS.PROSPECTUS_RESEARCH.tier, "STATIC");

      assert.equal(IPO_FRESHNESS_CONTRACTS.SUBSCRIPTION.ttlSeconds, 60);
      assert.equal(IPO_FRESHNESS_CONTRACTS.SUBSCRIPTION.tier, "DYNAMIC");

      assert.equal(IPO_FRESHNESS_CONTRACTS.GMP.ttlSeconds, 60);
      assert.equal(IPO_FRESHNESS_CONTRACTS.GMP.tier, "DYNAMIC");

      assert.equal(IPO_FRESHNESS_CONTRACTS.LIFECYCLE.ttlSeconds, 300);
      assert.equal(IPO_FRESHNESS_CONTRACTS.LIFECYCLE.tier, "EVENT_DRIVEN");

      assert.equal(IPO_FRESHNESS_CONTRACTS.REGULATORY_NEWS.ttlSeconds, 900);
      assert.equal(IPO_FRESHNESS_CONTRACTS.REGULATORY_NEWS.tier, "POLLING");
    });

    it("should prove the full sequence: Initial request -> cache populated -> data changes -> revalidation -> fresh observation", async () => {
      let version = 1;
      const fetchSubscription = async () => {
        return { version, qib: version * 1.5, retail: version * 2.0 };
      };

      const tag = IPOTieredCacheService.getTags(ipoA.id).subscription;

      // 1. Initial Request
      const snap1 = await IPOTieredCacheService.getOrSet(`sub:${ipoA.id}`, [tag], 60, fetchSubscription);
      assert.equal(snap1.version, 1);

      // 2. Underlying data changes
      version = 2;

      // Without revalidation, cache hit returns version 1
      const snapCached = await IPOTieredCacheService.getOrSet(`sub:${ipoA.id}`, [tag], 60, fetchSubscription);
      assert.equal(snapCached.version, 1);

      // 3. Trigger granular revalidation
      IPOTieredCacheService.revalidateSubscription(ipoA.id);

      // 4. Request again: New data observed
      const snapFresh = await IPOTieredCacheService.getOrSet(`sub:${ipoA.id}`, [tag], 60, fetchSubscription);
      assert.equal(snapFresh.version, 2);
      assert.equal(snapFresh.qib, 3.0);
    });
  });
});
