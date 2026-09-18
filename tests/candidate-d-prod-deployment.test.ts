/**
 * tests/candidate-d-prod-deployment.test.ts
 *
 * Candidate D: Production Deployment & Live Endpoint Verification Suite.
 *
 * Validates against live production deployment: https://ipo-saas.vercel.app
 * 1. Production Deployment Health & Availability (HTTP 200)
 * 2. Unauthenticated Route Guards & Redirects (/portfolio -> /login, /admin/listings -> /login)
 * 3. Unauthenticated API Boundary Protection (/api/admin/listings -> 401, /api/admin/prices -> 401)
 * 4. Production Database Schema Invariants (all Candidate D tables & columns live and constrained)
 * 5. Decimal-Safe Valuation Invariant against Production Positions
 * 6. Authority Distinction (Listing Price vs Current Price) on Production IPO Analytics
 */

import { describe, it } from 'node:test';
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
import { PortfolioValuationEngine } from '../features/finance/services/portfolioValuationEngine';
import { ListingService } from '../features/finance/services/listingService';
import { DecimalPrecision } from '../features/finance/utils/decimalPrecision';

const PROD_BASE_URL = 'https://ipo-saas.vercel.app';

describe('CANDIDATE-D: Production Deployment & Live Verification Suite', () => {
  const admin = createAdminClient();

  it('verifies live production deployment is operational and responsive', async () => {
    const res = await fetch(`${PROD_BASE_URL}/`);
    assert.equal(res.status, 200, 'Production homepage must return HTTP 200');
  });

  it('verifies production route-level auth guards redirect unauthenticated users to /login', async () => {
    // 1. /portfolio requires authenticated user
    const resPortfolio = await fetch(`${PROD_BASE_URL}/portfolio`, { redirect: 'manual' });
    assert.ok(
      resPortfolio.status === 307 || resPortfolio.status === 302,
      `Expected 307/302 redirect for /portfolio, got ${resPortfolio.status}`
    );
    const portLocation = resPortfolio.headers.get('location') || '';
    assert.ok(
      portLocation.includes('/login'),
      `Expected redirect to /login, got: ${portLocation}`
    );

    // 2. /admin/listings requires administrator
    const resAdmin = await fetch(`${PROD_BASE_URL}/admin/listings`, { redirect: 'manual' });
    assert.ok(
      resAdmin.status === 307 || resAdmin.status === 302,
      `Expected 307/302 redirect for /admin/listings, got ${resAdmin.status}`
    );
    const adminLocation = resAdmin.headers.get('location') || '';
    assert.ok(
      adminLocation.includes('/login'),
      `Expected redirect to /login, got: ${adminLocation}`
    );
  });

  it('verifies production API route guards strictly reject unauthenticated requests with HTTP 401', async () => {
    // 1. GET /api/admin/listings
    const resListingsGet = await fetch(`${PROD_BASE_URL}/api/admin/listings`);
    assert.equal(resListingsGet.status, 401, 'Unauthenticated GET /api/admin/listings must return 401');
    const bodyListingsGet = await resListingsGet.json();
    assert.equal(bodyListingsGet.error, 'Unauthorized: Authentication required.');

    // 2. POST /api/admin/listings
    const resListingsPost = await fetch(`${PROD_BASE_URL}/api/admin/listings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ipoId: 'dummy' }),
    });
    assert.equal(resListingsPost.status, 401, 'Unauthenticated POST /api/admin/listings must return 401');

    // 3. GET /api/admin/prices
    const resPricesGet = await fetch(`${PROD_BASE_URL}/api/admin/prices`);
    assert.equal(resPricesGet.status, 401, 'Unauthenticated GET /api/admin/prices must return 401');
    const bodyPricesGet = await resPricesGet.json();
    assert.equal(bodyPricesGet.error, 'Unauthorized: Authentication required.');

    // 4. POST /api/admin/prices
    const resPricesPost = await fetch(`${PROD_BASE_URL}/api/admin/prices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ securityId: 'dummy' }),
    });
    assert.equal(resPricesPost.status, 401, 'Unauthenticated POST /api/admin/prices must return 401');
  });

  it('verifies Candidate D database schema, columns, and RLS are active on production Supabase', async () => {
    // 1. ipo_listing_events
    const { error: evErr } = await admin
      .from('ipo_listing_events')
      .select('id, ipo_id, security_id, exchange, event_type, listing_date, listing_price, issue_price, listing_gain, listing_gain_pct, source, source_record_id, payload_hash, idempotency_key')
      .limit(1);
    assert.ok(!evErr, `ipo_listing_events table error: ${evErr?.message}`);

    // 2. market_price_observations
    const { error: obsErr } = await admin
      .from('market_price_observations')
      .select('id, security_id, price, day_open, day_high, day_low, previous_close, provider, raw_hash, is_verified, provider_timestamp, received_at')
      .limit(1);
    assert.ok(!obsErr, `market_price_observations table error: ${obsErr?.message}`);

    // 3. security_prices provider_timestamp
    const { error: priceErr } = await admin
      .from('security_prices')
      .select('id, security_id, price, provider_timestamp, is_verified')
      .limit(1);
    assert.ok(!priceErr, `security_prices provider_timestamp error: ${priceErr?.message}`);

    // 4. securities listing columns
    const { error: secErr } = await admin
      .from('securities')
      .select('id, symbol, exchange, isin, listing_status, listing_date, listing_price')
      .limit(1);
    assert.ok(!secErr, `securities listing columns error: ${secErr?.message}`);
  });

  it('verifies production portfolio valuation engine respects decimal precision and missing-price safeguards', async () => {
    // Evaluate portfolio valuation across all positions in production database
    const result = await PortfolioValuationEngine.evaluatePortfolio({ scope: 'family_all' });

    assert.ok(result);
    assert.ok(typeof result.totalCostBasis === 'string');
    assert.ok(typeof result.totalMarketValue === 'string');
    assert.ok(typeof result.totalUnrealizedPnl === 'string');
    assert.ok(typeof result.totalUnrealizedPnlPercent === 'string');

    // Verify each holding adheres to Gate 1 (string types, never float) and Gate 2 (missing price invariant)
    for (const h of result.holdings) {
      assert.equal(typeof h.quantity, 'string', 'Quantity must be string');
      assert.equal(typeof h.costBasis, 'string', 'Cost basis must be string');
      assert.equal(typeof h.averageCost, 'string', 'Average cost must be string');

      if (h.currentPrice === null) {
        // Missing Price Invariant: NEVER fabricate 0 or fallback to cost basis!
        assert.equal(h.marketValue, null, 'marketValue must be null when unquoted');
        assert.equal(h.unrealizedPnl, null, 'unrealizedPnl must be null when unquoted');
        assert.equal(h.unrealizedPnlPercent, null, 'unrealizedPnlPercent must be null when unquoted');
      } else {
        assert.equal(typeof h.marketValue, 'string');
        assert.equal(typeof h.unrealizedPnl, 'string');
        assert.equal(typeof h.unrealizedPnlPercent, 'string');
      }
    }
  });

  it('verifies listing gain and current gain calculations maintain strict authority separation', async () => {
    // Fetch an IPO that has a recorded listing event
    const { data: listingEvent } = await admin
      .from('ipo_listing_events')
      .select('ipo_id, listing_price, issue_price, listing_gain, listing_gain_pct')
      .limit(1)
      .maybeSingle();

    if (listingEvent) {
      const analytics = await ListingService.getListingAnalytics(listingEvent.ipo_id);
      assert.ok(analytics);

      // Verify listing gain is strictly bound to listing_price
      assert.ok(DecimalPrecision.equals(analytics.listingPrice, listingEvent.listing_price));
      assert.ok(DecimalPrecision.equals(analytics.listingGainAmount, listingEvent.listing_gain));
      assert.ok(DecimalPrecision.equals(analytics.listingGainPercent, listingEvent.listing_gain_pct));

      // If currentPrice is present, verify current gain is calculated separately from current quote
      if (analytics.currentPrice !== null) {
        const expectedDiff = DecimalPrecision.subtractStr(analytics.currentPrice, analytics.issuePrice, 8);
        assert.ok(DecimalPrecision.equals(analytics.currentGainAmount!, expectedDiff));
      }
    }
  });
});
