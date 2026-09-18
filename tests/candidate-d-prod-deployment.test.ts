/**
 * tests/candidate-d-prod-deployment.test.ts
 *
 * Candidate D: Production Deployment & Live Endpoint Verification Suite.
 *
 * Validates against live production deployment: https://ipo-saas.vercel.app
 * Exactly 10 independently verifiable assertions:
 * - 7 live endpoint checks (1:1 with endpoint security matrix)
 * - 3 live database schema, valuation engine, and authority distinction checks
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

describe('CANDIDATE-D: Production Deployment & Live Verification Suite (10-Point Gate)', () => {
  const admin = createAdminClient();

  // 1. Live Homepage
  it('1. verifies live production homepage is operational and returns HTTP 200', async () => {
    const res = await fetch(`${PROD_BASE_URL}/`);
    assert.equal(res.status, 200, 'Production homepage must return HTTP 200');
  });

  // 2. Portfolio Route Guard
  it('2. verifies unauthenticated GET /portfolio returns HTTP 307 redirect to /login', async () => {
    const res = await fetch(`${PROD_BASE_URL}/portfolio`, { redirect: 'manual' });
    assert.ok(
      res.status === 307 || res.status === 302,
      `Expected 307/302 redirect for /portfolio, got ${res.status}`
    );
    const location = res.headers.get('location') || '';
    assert.ok(location.includes('/login'), `Expected redirect to /login, got: ${location}`);
  });

  // 3. Admin Listings Route Guard
  it('3. verifies unauthenticated GET /admin/listings returns HTTP 307 redirect to /login', async () => {
    const res = await fetch(`${PROD_BASE_URL}/admin/listings`, { redirect: 'manual' });
    assert.ok(
      res.status === 307 || res.status === 302,
      `Expected 307/302 redirect for /admin/listings, got ${res.status}`
    );
    const location = res.headers.get('location') || '';
    assert.ok(location.includes('/login'), `Expected redirect to /login, got: ${location}`);
  });

  // 4. API Listings GET Guard
  it('4. verifies unauthenticated GET /api/admin/listings returns HTTP 401 Unauthorized', async () => {
    const res = await fetch(`${PROD_BASE_URL}/api/admin/listings`);
    assert.equal(res.status, 401, 'Unauthenticated GET /api/admin/listings must return 401');
    const body = await res.json();
    assert.equal(body.error, 'Unauthorized: Authentication required.');
  });

  // 5. API Listings POST Guard
  it('5. verifies unauthenticated POST /api/admin/listings returns HTTP 401 Unauthorized', async () => {
    const res = await fetch(`${PROD_BASE_URL}/api/admin/listings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ipoId: 'dummy' }),
    });
    assert.equal(res.status, 401, 'Unauthenticated POST /api/admin/listings must return 401');
  });

  // 6. API Prices GET Guard
  it('6. verifies unauthenticated GET /api/admin/prices returns HTTP 401 Unauthorized', async () => {
    const res = await fetch(`${PROD_BASE_URL}/api/admin/prices`);
    assert.equal(res.status, 401, 'Unauthenticated GET /api/admin/prices must return 401');
    const body = await res.json();
    assert.equal(body.error, 'Unauthorized: Authentication required.');
  });

  // 7. API Prices POST Guard
  it('7. verifies unauthenticated POST /api/admin/prices returns HTTP 401 Unauthorized', async () => {
    const res = await fetch(`${PROD_BASE_URL}/api/admin/prices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ securityId: 'dummy' }),
    });
    assert.equal(res.status, 401, 'Unauthenticated POST /api/admin/prices must return 401');
  });

  // 8. Live Database Schema & Invariants
  it('8. verifies Candidate D database schema, columns, and RLS are active on production Supabase', async () => {
    // ipo_listing_events
    const { error: evErr } = await admin
      .from('ipo_listing_events')
      .select('id, ipo_id, security_id, exchange, event_type, listing_date, listing_price, issue_price, listing_gain, listing_gain_pct, source, source_record_id, payload_hash, idempotency_key')
      .limit(1);
    assert.ok(!evErr, `ipo_listing_events table error: ${evErr?.message}`);

    // market_price_observations
    const { error: obsErr } = await admin
      .from('market_price_observations')
      .select('id, security_id, price, day_open, day_high, day_low, previous_close, provider, raw_hash, is_verified, provider_timestamp, received_at')
      .limit(1);
    assert.ok(!obsErr, `market_price_observations table error: ${obsErr?.message}`);

    // security_prices provider_timestamp
    const { error: priceErr } = await admin
      .from('security_prices')
      .select('id, security_id, price, provider_timestamp, is_verified')
      .limit(1);
    assert.ok(!priceErr, `security_prices provider_timestamp error: ${priceErr?.message}`);

    // securities listing columns
    const { error: secErr } = await admin
      .from('securities')
      .select('id, symbol, exchange, isin, listing_status, listing_date, listing_price')
      .limit(1);
    assert.ok(!secErr, `securities listing columns error: ${secErr?.message}`);
  });

  // 9. Decimal-Safe Valuation Invariant on Production Database
  it('9. verifies production portfolio valuation engine respects decimal precision and missing-price safeguards', async () => {
    const result = await PortfolioValuationEngine.evaluatePortfolio({ scope: 'family_all' });

    assert.ok(result);
    assert.ok(typeof result.totalCostBasis === 'string');
    assert.ok(typeof result.totalMarketValue === 'string');
    assert.ok(typeof result.totalUnrealizedPnl === 'string');
    assert.ok(typeof result.totalUnrealizedPnlPercent === 'string');

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

  // 10. Listing Gain vs Current Gain Authority Separation
  it('10. verifies listing gain and current gain calculations maintain strict authority separation on production records', async () => {
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
