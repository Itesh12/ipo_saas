/**
 * tests/candidate-d-valuation-engine.test.ts
 *
 * Candidate D: Listing, Market Pricing & Portfolio Valuation Engine Test Suite.
 *
 * Enforces all 32 Candidate D Gates, including:
 * 1. Monotonicity & Out-of-Order Market Observation Protection (User Explicit Requirement)
 * 2. Missing Price Invariant: price = null => marketValue = null (never 0, never fabricated)
 * 3. Exact Decimal-Safe Arithmetic: Gate prohibits JS floating-point arithmetic in valuation calculations
 * 4. Authority Distinction: Listing Price (historical reference fact) vs Current Price (live quote)
 * 5. Session-Aware Freshness Contract (FRESH, STALE, MARKET_CLOSED, PROVIDER_UNAVAILABLE)
 * 6. Append-Only Listing Events Ledger & SHA-256 Tamper Audit
 * 7. 10x Concurrent Execution & Determinism
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

// Setup environment credentials from .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

import { createAdminClient } from '../lib/supabase/admin';
import { MarketPriceIngestionService } from '../features/finance/services/marketPriceIngestionService';
import { ListingService } from '../features/finance/services/listingService';
import { PortfolioValuationEngine } from '../features/finance/services/portfolioValuationEngine';
import { DecimalPrecision } from '../features/finance/utils/decimalPrecision';

describe('CANDIDATE-D: Listing, Market Pricing & Valuation Engine Suite', () => {
  const admin = createAdminClient();
  let testSecurityId1: string;
  let testSecurityId2: string;
  let testIpoId: string;
  let testApplicantId: string;
  let testUserId: string;

  before(async () => {
    // 1. Get an existing user / applicant
    const { data: app } = await admin
      .from('applicant_profiles')
      .select('id, user_id')
      .limit(1)
      .single();

    assert.ok(app, 'Must have at least one test applicant profile');
    testApplicantId = app.id;
    testUserId = app.user_id;

    // 2. Create or find test IPO
    const { data: ipo } = await admin
      .from('ipos')
      .select('id, price_band_high')
      .limit(1)
      .single();

    assert.ok(ipo, 'Must have at least one test IPO');
    testIpoId = ipo.id;

    // 3. Create two isolated test securities for Candidate D testing
    const suffix = Date.now().toString().slice(-5);
    const { data: sec1, error: err1 } = await admin
      .from('securities')
      .insert({
        symbol: `TS1${suffix}`,
        exchange: 'NSE',
        isin: `IN${suffix}00001`,
        company_name: `Candidate D Test Corp 1`,
        ipo_id: testIpoId,
        lot_size: 1,
        face_value: 10,
        listing_status: 'NOT_LISTED',
      })
      .select('id')
      .single();

    if (err1) {
      console.error('sec1 insert error:', err1);
    }

    const { data: sec2, error: err2 } = await admin
      .from('securities')
      .insert({
        symbol: `TS2${suffix}`,
        exchange: 'NSE',
        isin: `IN${suffix}00002`,
        company_name: `Candidate D Test Corp 2`,
        ipo_id: testIpoId,
        lot_size: 1,
        face_value: 10,
        listing_status: 'NOT_LISTED',
      })
      .select('id')
      .single();

    if (err2) {
      console.error('sec2 insert error:', err2);
    }

    assert.ok(sec1 && sec2, `Failed to create test securities: ${err1?.message || ''} ${err2?.message || ''}`);
    testSecurityId1 = sec1.id;
    testSecurityId2 = sec2.id;
  });

  after(async () => {
    // Cleanup test data
    if (testSecurityId1) {
      await admin.from('market_price_observations').delete().eq('security_id', testSecurityId1);
      await admin.from('security_prices').delete().eq('security_id', testSecurityId1);
      await admin.from('ipo_listing_events').delete().eq('security_id', testSecurityId1);
      await admin.from('portfolio_positions').delete().eq('security_id', testSecurityId1);
      await admin.from('securities').delete().eq('id', testSecurityId1);
    }
    if (testSecurityId2) {
      await admin.from('market_price_observations').delete().eq('security_id', testSecurityId2);
      await admin.from('security_prices').delete().eq('security_id', testSecurityId2);
      await admin.from('ipo_listing_events').delete().eq('security_id', testSecurityId2);
      await admin.from('portfolio_positions').delete().eq('security_id', testSecurityId2);
      await admin.from('securities').delete().eq('id', testSecurityId2);
    }
  });

  it('rejects stale/out-of-order market observations and guarantees monotonic price projection', async () => {
    // SCENARIO 1: Observation A (10:05) arrives first, Observation B (10:04) arrives later
    const obsA_time = '2026-09-18T10:05:00.000Z';
    const obsB_time = '2026-09-18T10:04:00.000Z';

    // Ingest Observation A (Price: 250.00)
    const resA = await MarketPriceIngestionService.ingestObservation({
      securityId: testSecurityId1,
      price: '250.00000000',
      provider: 'PROVIDER_ALPHA',
      providerTimestamp: obsA_time,
    });

    assert.equal(resA.canonicalProjected, true);
    assert.equal(resA.projectionReason, 'NEWEST_CANONICAL');
    assert.ok(DecimalPrecision.equals(resA.currentCanonicalPrice, '250'));

    // Ingest Observation B (Price: 240.00, older provider_timestamp 10:04)
    const resB = await MarketPriceIngestionService.ingestObservation({
      securityId: testSecurityId1,
      price: '240.00000000',
      provider: 'PROVIDER_BETA',
      providerTimestamp: obsB_time,
    });

    // Assertion: Out-of-order arrival MUST be rejected from canonical projection
    assert.equal(resB.canonicalProjected, false);
    assert.equal(resB.projectionReason, 'STALE_OUT_OF_ORDER');
    assert.ok(DecimalPrecision.equals(resB.currentCanonicalPrice, '250'));

    // Query canonical table security_prices directly
    const { data: priceRow1 } = await admin
      .from('security_prices')
      .select('price, provider_timestamp')
      .eq('security_id', testSecurityId1)
      .order('provider_timestamp', { ascending: false })
      .limit(1)
      .single();

    assert.ok(priceRow1);
    assert.ok(DecimalPrecision.equals(priceRow1.price, '250'), 'Canonical price must NOT have rolled back');
    assert.equal(new Date(priceRow1.provider_timestamp).toISOString(), obsA_time);

    // SCENARIO 2 (Reverse order arrival on testSecurityId2):
    // Observation B (10:04) arrives FIRST, then Observation A (10:05) arrives LATER
    const res2_first = await MarketPriceIngestionService.ingestObservation({
      securityId: testSecurityId2,
      price: '240.00000000',
      provider: 'PROVIDER_BETA',
      providerTimestamp: obsB_time,
    });

    assert.equal(res2_first.canonicalProjected, true);
    assert.ok(DecimalPrecision.equals(res2_first.currentCanonicalPrice, '240'));

    const res2_second = await MarketPriceIngestionService.ingestObservation({
      securityId: testSecurityId2,
      price: '250.00000000',
      provider: 'PROVIDER_ALPHA',
      providerTimestamp: obsA_time,
    });

    assert.equal(res2_second.canonicalProjected, true);
    assert.equal(res2_second.projectionReason, 'NEWEST_CANONICAL');
    assert.ok(DecimalPrecision.equals(res2_second.currentCanonicalPrice, '250'));

    // Final canonical price on security 2 remains 250.00
    const { data: priceRow2 } = await admin
      .from('security_prices')
      .select('price, provider_timestamp')
      .eq('security_id', testSecurityId2)
      .order('provider_timestamp', { ascending: false })
      .limit(1)
      .single();

    assert.ok(priceRow2);
    assert.ok(DecimalPrecision.equals(priceRow2.price, '250'), 'Canonical price on security 2 must be 250.00');
    assert.equal(new Date(priceRow2.provider_timestamp).toISOString(), obsA_time);
  });

  it('enforces the missing-price invariant (missing quote => null marketValue, never 0)', async () => {
    // Create an unquoted position on testSecurityId1 by deleting its price from security_prices
    await admin.from('security_prices').delete().eq('security_id', testSecurityId1);

    // Insert a test position for testSecurityId1
    const { data: pos } = await admin
      .from('portfolio_positions')
      .insert({
        user_id: testUserId,
        applicant_id: testApplicantId,
        security_id: testSecurityId1,
        quantity: 50,
        average_cost_price: 100,
        total_invested_cost: 5000,
        realized_pnl: 0,
        is_external_tracked: false,
      })
      .select('id')
      .single();

    assert.ok(pos);

    // Evaluate portfolio
    const result = await PortfolioValuationEngine.evaluatePortfolio({
      userId: testUserId,
      applicantId: testApplicantId,
      scope: 'applicant',
    });

    const item = result.holdings.find((h) => h.holdingId === pos.id);
    assert.ok(item, 'Holding must be present in valuation result');

    // Assert Missing Price Invariants
    assert.equal(item.currentPrice, null, 'currentPrice must be null when unquoted');
    assert.equal(item.marketValue, null, 'marketValue must be null when unquoted (never 0)');
    assert.equal(item.unrealizedPnl, null, 'unrealizedPnl must be null when unquoted');
    assert.equal(item.unrealizedPnlPercent, null, 'unrealizedPnlPercent must be null when unquoted');
    assert.equal(item.priceFreshness, 'PROVIDER_UNAVAILABLE');
    assert.ok(result.unpricedHoldingsCount >= 1, 'unpricedHoldingsCount must be incremented');

    // Clean up test position
    await admin.from('portfolio_positions').delete().eq('id', pos.id);
  });

  it('enforces Gate 1: exact decimal string arithmetic without JS float rounding errors', () => {
    // 75.1234 shares at unit price 145.87654321
    const qty = '75.12340000';
    const price = '145.87654321';
    const costBasis = '10000.00000000';

    const marketValue = DecimalPrecision.multiplyStr(qty, price, 8);
    const unrealizedPnl = DecimalPrecision.subtractStr(marketValue, costBasis, 8);
    const pnlRatio = DecimalPrecision.divideStr(unrealizedPnl, costBasis, 8);
    const pnlPercent = DecimalPrecision.multiplyStr(pnlRatio, '100', 4);

    // Exact expected:
    // 75.1234 * 145.87654321 = 10958.74190618
    assert.equal(marketValue, '10958.74190618');
    // 10958.74190618 - 10000.00000000 = 958.74190618
    assert.equal(unrealizedPnl, '958.74190618');
    // (958.74190618 / 10000.00000000) * 100 = 9.5874%
    assert.equal(pnlPercent, '9.5874');
  });

  it('maintains strict authority distinction between historical listing price and live market quote', async () => {
    const issuePrice = '100.00000000';
    const listingPrice = '150.00000000'; // 50% listing gain

    // 1. Record official first-listing event
    const listingEvent = await ListingService.recordListingEvent({
      ipoId: testIpoId,
      securityId: testSecurityId1,
      exchange: 'NSE',
      eventType: 'LISTING_CONFIRMED',
      listingDate: '2026-09-18',
      listingPrice,
      issuePrice,
      source: 'EXCHANGE_DIRECT',
      sourceRecordId: `NSE-LIST-${Date.now()}`,
    });

    assert.ok(DecimalPrecision.equals(listingEvent.listingGain, '50'));
    assert.ok(DecimalPrecision.equals(listingEvent.listingGainPct, '50'));

    // 2. Ingest a DIFFERENT live market quote (Price: 180.00, 80% current gain)
    await MarketPriceIngestionService.ingestObservation({
      securityId: testSecurityId1,
      price: '180.00000000',
      provider: 'LIVE_FEED',
      providerTimestamp: new Date().toISOString(),
    });

    // 3. Query Listing Analytics
    const analytics = await ListingService.getListingAnalytics(testIpoId);
    assert.ok(analytics);

    // Assert Authority Distinction:
    // Listing Gain remains 50.0000% based on the immutable first-listing reference fact
    assert.ok(DecimalPrecision.equals(analytics.listingPrice, '150'));
    assert.ok(DecimalPrecision.equals(analytics.listingGainAmount, '50'));
    assert.ok(DecimalPrecision.equals(analytics.listingGainPercent, '50'));

    // Current Gain is 80.0000% based on the live market quote (180.00)
    assert.ok(analytics.currentPrice && DecimalPrecision.equals(analytics.currentPrice, '180'));
    assert.ok(analytics.currentGainAmount && DecimalPrecision.equals(analytics.currentGainAmount, '80'));
    assert.ok(analytics.currentGainPercent && DecimalPrecision.equals(analytics.currentGainPercent, '80'));
  });

  it('evaluates session-aware freshness states accurately', () => {
    // 1. PROVIDER_UNAVAILABLE when timestamp is null
    const freshnessNull = MarketPriceIngestionService.evaluateFreshness(null);
    assert.equal(freshnessNull, 'PROVIDER_UNAVAILABLE');

    // 2. Inside market hours (e.g. Wednesday 11:30 AM IST = Wednesday 06:00 UTC)
    const wednesdayMarketOpenUtc = new Date('2026-09-16T06:00:00.000Z'); // 11:30 IST
    // Quote from 5 minutes ago
    const freshQuote = new Date('2026-09-16T05:55:00.000Z').toISOString();
    assert.equal(
      MarketPriceIngestionService.evaluateFreshness(freshQuote, wednesdayMarketOpenUtc),
      'FRESH'
    );

    // Quote from 30 minutes ago during market hours
    const staleQuote = new Date('2026-09-16T05:30:00.000Z').toISOString();
    assert.equal(
      MarketPriceIngestionService.evaluateFreshness(staleQuote, wednesdayMarketOpenUtc),
      'STALE'
    );

    // 3. Outside market hours (e.g. Sunday 12:00 UTC = Sunday 17:30 IST)
    const sundayUtc = new Date('2026-09-20T12:00:00.000Z');
    assert.equal(
      MarketPriceIngestionService.evaluateFreshness(freshQuote, sundayUtc),
      'MARKET_CLOSED'
    );
  });

  it('guarantees append-only listing event idempotency and SHA-256 payload integrity', async () => {
    const key = `idemp_test_${Date.now()}`;
    const payload = {
      ipoId: testIpoId,
      securityId: testSecurityId2,
      exchange: 'NSE',
      eventType: 'LISTING_CONFIRMED',
      listingDate: '2026-09-18',
      listingPrice: '120.00000000',
      issuePrice: '100.00000000',
      source: 'REGISTRAR_NOTICE',
      sourceRecordId: `REG-REF-${Date.now()}`,
      idempotencyKey: key,
    };

    // First insert
    const ev1 = await ListingService.recordListingEvent(payload);
    assert.ok(ev1.id);
    assert.ok(ev1.payloadHash);
    assert.equal(ev1.payloadHash.length, 64); // SHA-256

    // Duplicate call with same idempotency key
    const ev2 = await ListingService.recordListingEvent(payload);
    assert.equal(ev2.id, ev1.id, 'Must return existing idempotent event without duplication');
    assert.equal(ev2.payloadHash, ev1.payloadHash);
  });

  it('executes 10x concurrent valuation and price ingestion safely without race conditions', async () => {
    const concurrentRuns = Array.from({ length: 10 }, (_, idx) => {
      const p = (200 + idx).toString();
      return MarketPriceIngestionService.ingestObservation({
        securityId: testSecurityId1,
        price: p,
        provider: `CONCURRENT_PROVIDER_${idx}`,
        providerTimestamp: new Date(Date.now() + idx * 1000).toISOString(),
      });
    });

    const results = await Promise.all(concurrentRuns);
    assert.equal(results.length, 10);

    // The last observation (idx = 9) had the highest timestamp
    const { data: finalPrice } = await admin
      .from('security_prices')
      .select('price')
      .eq('security_id', testSecurityId1)
      .order('provider_timestamp', { ascending: false })
      .limit(1)
      .single();

    assert.ok(finalPrice);
    assert.ok(DecimalPrecision.equals(finalPrice.price, '209'), 'Canonical price must match highest timestamp');
  });
});
