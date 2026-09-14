/**
 * tests/stage3d-gmp-intelligence.test.ts
 *
 * Phase 9 Stage 3D: Grey Market Premium (GMP) Intelligence Exhaustive Test Matrix.
 * 
 * Includes all 24 mandatory test scenarios + 4 mandatory reviewer corrections:
 * 1. Freshness Policy: 24h expiration (0-2h fresh, 2-6h aging, 6-24h stale, >24h expired).
 * 2. Zero/Negative Spread: Safe spread formula across -10/+10, 0/0, -20/-10, -1/+1.
 * 3. Zero-MAD Rule: [50, 50, 50, 350] -> 350 quarantined -> consensus = 50.
 * 4. Source Verification & Fail-Closed: unverified sources are unavailable; SSRF protection.
 * 5. Kostak/Sauda isolation, listing freeze, deletion guard, compliance disclaimer.
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  calculateSafeSpreadPct,
  determineFreshnessState,
  gmpConsensusEngine,
  GMP_POLICY_V1_2026_09,
} from '../features/external-integrations/gmp/gmpConsensusEngine';
import { gmpValidator, IPOInstrumentContext } from '../features/external-integrations/gmp/gmpValidator';
import { gmpSourceRegistry } from '../features/external-integrations/gmp/gmpSourceRegistry';
import { GMPSyncService } from '../features/external-integrations/gmp/gmpSyncService';
import {
  GMP_DISCLAIMER_V1,
  wrapCompliantGMPPayload,
} from '../features/external-integrations/gmp/gmpCompliance';
import { NormalizedGMPObservation, RawOTCPayload } from '../features/external-integrations/gmp/gmpTypes';

describe('Phase 9 Stage 3D: Grey Market Premium (GMP) Intelligence Matrix', () => {
  const baseIpoContext: IPOInstrumentContext = {
    id: 'ipo-test-001',
    symbol: 'TECHCORP',
    companyName: 'TechCorp Solutions Ltd',
    priceBandLow: 450,
    priceBandHigh: 500,
    issuePrice: 500,
    isListingConfirmed: false,
    confirmedListingTimestamp: null,
  };

  const createMockObservation = (overrides: Partial<NormalizedGMPObservation>): NormalizedGMPObservation => ({
    ipo_id: 'ipo-test-001',
    source_observation_uid: `obs_${Math.random()}`,
    source_observation_hash: 'hash_123',
    gmp_source: 'src_default',
    source_family: 'aggregator',
    publisher_id: 'pub_default',
    upstream_source_id: null,
    independence_group: 'GRP_DEFAULT',
    quote_time: new Date().toISOString(),
    reported_gmp_value: 50,
    reported_kostak: null,
    reported_subject_to_sauda: null,
    sauda_condition_notes: null,
    anomaly_status: 'valid',
    anomaly_reason: null,
    validation_status: 'verified',
    raw_payload_hash: 'payload_hash_123',
    ...overrides,
  });

  // ============================================================================
  // Test 1: Source Independence Deduplication
  // ============================================================================
  it('Test 1: should deduplicate multiple quotes from the same independence group to one latest quote', () => {
    const t0 = new Date('2026-09-14T09:00:00Z').toISOString();
    const t1 = new Date('2026-09-14T10:00:00Z').toISOString();

    const obs = [
      createMockObservation({
        gmp_source: 'aggregator_feed_a',
        independence_group: 'GRP_SYNDICATE_A',
        quote_time: t0,
        reported_gmp_value: 40,
      }),
      createMockObservation({
        gmp_source: 'aggregator_feed_b',
        independence_group: 'GRP_SYNDICATE_A', // Same independence group
        quote_time: t1,
        reported_gmp_value: 60,
      }),
    ];

    const result = gmpConsensusEngine.evaluateConsensus({
      ipoId: 'ipo-test-001',
      priceBandHigh: 500,
      observations: obs,
      currentTimestamp: '2026-09-14T10:30:00Z',
    });

    // Resolves to 1 quote from GRP_SYNDICATE_A with latest value 60
    assert.strictEqual(result.sourceCount, 1);
    assert.strictEqual(result.consensusGmpValue, 60);
    assert.strictEqual(result.confidenceLevel, 'unverified'); // 1 source remains unverified
  });

  // ============================================================================
  // Test 2: 0-Source Model
  // ============================================================================
  it('Test 2: should handle 0 sources deterministically with null consensus and unverified status', () => {
    const result = gmpConsensusEngine.evaluateConsensus({
      ipoId: 'ipo-test-001',
      priceBandHigh: 500,
      observations: [],
    });

    assert.strictEqual(result.sourceCount, 0);
    assert.strictEqual(result.consensusGmpValue, null);
    assert.strictEqual(result.confidenceLevel, 'unverified');
    assert.strictEqual(result.sourceSpreadPct, null);
  });

  // ============================================================================
  // Test 3: 1-Source Model
  // ============================================================================
  it('Test 3: should treat 1 distinct source as unverified', () => {
    const obs = [
      createMockObservation({
        independence_group: 'GRP_ALPHA',
        reported_gmp_value: 75,
      }),
    ];

    const result = gmpConsensusEngine.evaluateConsensus({
      ipoId: 'ipo-test-001',
      priceBandHigh: 500,
      observations: obs,
    });

    assert.strictEqual(result.sourceCount, 1);
    assert.strictEqual(result.consensusGmpValue, 75);
    assert.strictEqual(result.confidenceLevel, 'unverified');
    assert.strictEqual(result.sourceSpreadPct, null);
  });

  // ============================================================================
  // Test 4: 2-Source Reconciled Model (Spread <= 30%)
  // ============================================================================
  it('Test 4: should verify consensus when 2 distinct sources agree within 30% spread', () => {
    const obs = [
      createMockObservation({ independence_group: 'GRP_A', reported_gmp_value: 100 }),
      createMockObservation({ independence_group: 'GRP_B', reported_gmp_value: 120 }),
    ];

    const result = gmpConsensusEngine.evaluateConsensus({
      ipoId: 'ipo-test-001',
      priceBandHigh: 500,
      observations: obs,
    });

    assert.strictEqual(result.sourceCount, 2);
    assert.strictEqual(result.consensusGmpValue, 110);
    assert.strictEqual(result.confidenceLevel, 'verified');
    assert.ok(result.sourceSpreadPct !== null && result.sourceSpreadPct <= 30.0);
    assert.strictEqual(result.outliersQuarantined.length, 0);
  });

  // ============================================================================
  // Test 5: 2-Source Disagreement Model (Spread > 30%)
  // ============================================================================
  it('Test 5: should flag unverified when 2 distinct sources diverge beyond 30%', () => {
    const obs = [
      createMockObservation({ independence_group: 'GRP_A', reported_gmp_value: 50 }),
      createMockObservation({ independence_group: 'GRP_B', reported_gmp_value: 100 }),
    ];

    const result = gmpConsensusEngine.evaluateConsensus({
      ipoId: 'ipo-test-001',
      priceBandHigh: 500,
      observations: obs,
    });

    assert.strictEqual(result.sourceCount, 2);
    assert.strictEqual(result.confidenceLevel, 'unverified');
    assert.strictEqual(result.outliersQuarantined.length, 1);
    assert.ok(result.outliersQuarantined[0].reason.includes('exceeds maximum allowable threshold'));
  });

  // ============================================================================
  // Test 6: 3-Source Reconciled Model
  // ============================================================================
  it('Test 6: should calculate median consensus when 3 sources agree', () => {
    const obs = [
      createMockObservation({ independence_group: 'GRP_A', reported_gmp_value: 48 }),
      createMockObservation({ independence_group: 'GRP_B', reported_gmp_value: 50 }),
      createMockObservation({ independence_group: 'GRP_C', reported_gmp_value: 52 }),
    ];

    const result = gmpConsensusEngine.evaluateConsensus({
      ipoId: 'ipo-test-001',
      priceBandHigh: 500,
      observations: obs,
    });

    assert.strictEqual(result.sourceCount, 3);
    assert.strictEqual(result.consensusGmpValue, 50);
    assert.strictEqual(result.confidenceLevel, 'verified');
  });

  // ============================================================================
  // Test 7: 3-Source Outlier Quarantined
  // ============================================================================
  it('Test 7: should quarantine divergent outlier in 3 sources and average remaining 2', () => {
    const obs = [
      createMockObservation({ independence_group: 'GRP_A', reported_gmp_value: 50 }),
      createMockObservation({ independence_group: 'GRP_B', reported_gmp_value: 52 }),
      createMockObservation({ independence_group: 'GRP_C', reported_gmp_value: 140 }), // Outlier
    ];

    const result = gmpConsensusEngine.evaluateConsensus({
      ipoId: 'ipo-test-001',
      priceBandHigh: 500,
      observations: obs,
    });

    assert.strictEqual(result.outliersQuarantined.length, 1);
    assert.strictEqual(result.outliersQuarantined[0].value, 140);
    assert.strictEqual(result.consensusGmpValue, 51); // (50 + 52) / 2
    assert.strictEqual(result.confidenceLevel, 'verified');
  });

  // ============================================================================
  // Test 8: 4+ Sources Standard MAD Rule
  // ============================================================================
  it('Test 8: should apply MAD outlier pruning for 4+ sources', () => {
    const obs = [
      createMockObservation({ independence_group: 'GRP_1', reported_gmp_value: 100 }),
      createMockObservation({ independence_group: 'GRP_2', reported_gmp_value: 102 }),
      createMockObservation({ independence_group: 'GRP_3', reported_gmp_value: 105 }),
      createMockObservation({ independence_group: 'GRP_4', reported_gmp_value: 104 }),
      createMockObservation({ independence_group: 'GRP_5', reported_gmp_value: 280 }), // Outlier
    ];

    const result = gmpConsensusEngine.evaluateConsensus({
      ipoId: 'ipo-test-001',
      priceBandHigh: 500,
      observations: obs,
    });

    assert.ok(result.outliersQuarantined.some(o => o.value === 280));
    assert.ok(result.consensusGmpValue !== null && result.consensusGmpValue >= 100 && result.consensusGmpValue <= 105);
    assert.strictEqual(result.confidenceLevel, 'verified');
  });

  // ============================================================================
  // Test 9: Zero-MAD Fallback Rule (Correction 3)
  // [50, 50, 50, 350] -> 350 quarantined -> consensus = 50
  // ============================================================================
  it('Test 9: (Correction 3) should handle zero-MAD dataset [50, 50, 50, 350] by quarantining 350 and yielding 50', () => {
    const obs = [
      createMockObservation({ independence_group: 'GRP_A', reported_gmp_value: 50 }),
      createMockObservation({ independence_group: 'GRP_B', reported_gmp_value: 50 }),
      createMockObservation({ independence_group: 'GRP_C', reported_gmp_value: 50 }),
      createMockObservation({ independence_group: 'GRP_D', reported_gmp_value: 350 }),
    ];

    const result = gmpConsensusEngine.evaluateConsensus({
      ipoId: 'ipo-test-001',
      priceBandHigh: 500,
      observations: obs,
    });

    assert.strictEqual(result.outliersQuarantined.length, 1);
    assert.strictEqual(result.outliersQuarantined[0].value, 350);
    assert.ok(result.outliersQuarantined[0].reason.includes('Zero-MAD dataset fallback'));
    assert.strictEqual(result.consensusGmpValue, 50);
    assert.strictEqual(result.confidenceLevel, 'verified');
  });

  // ============================================================================
  // Test 10-13: Zero/Negative Spread Adversarial Matrix (Correction 2)
  // ============================================================================
  it('Test 10: (Correction 2) calculates deterministic spread for -10 / +10 without division by zero', () => {
    // abs(-10 - 10) / max(10, 10, 1.0) * 100 = 20 / 10 * 100 = 200%
    const spread = calculateSafeSpreadPct(-10, 10);
    assert.strictEqual(spread, 200.0);
    assert.ok(Number.isFinite(spread));
  });

  it('Test 11: (Correction 2) calculates deterministic spread for 0 / 0 without division by zero', () => {
    // abs(0 - 0) / max(0, 0, 1.0) * 100 = 0 / 1.0 * 100 = 0%
    const spread = calculateSafeSpreadPct(0, 0);
    assert.strictEqual(spread, 0.0);
    assert.ok(Number.isFinite(spread));
  });

  it('Test 12: (Correction 2) calculates deterministic spread for -20 / -10 without sign confusion', () => {
    // abs(-20 - (-10)) / max(20, 10, 1.0) * 100 = 10 / 20 * 100 = 50%
    const spread = calculateSafeSpreadPct(-20, -10);
    assert.strictEqual(spread, 50.0);
    assert.ok(Number.isFinite(spread));
  });

  it('Test 13: (Correction 2) calculates deterministic spread for -1 / +1 around zero boundary', () => {
    // abs(-1 - 1) / max(1, 1, 1.0) * 100 = 2 / 1.0 * 100 = 200%
    const spread = calculateSafeSpreadPct(-1, 1);
    assert.strictEqual(spread, 200.0);
    assert.ok(Number.isFinite(spread));
  });

  // ============================================================================
  // Test 14: Floor Guard Validation (Discount cannot exceed 100%)
  // ============================================================================
  it('Test 14: should reject reported GMP that implies listing price < ₹0 (Floor Guard)', () => {
    const raw: RawOTCPayload = {
      sourceId: 'broker_feed',
      sourceFamily: 'broker_desk',
      publisherId: 'dealer_1',
      independenceGroup: 'GRP_DEALER',
      companyName: 'TechCorp Solutions Ltd',
      quoteTimestamp: new Date().toISOString(),
      rawGmp: -600, // Price band high is 500 -> listing price -100 is invalid
    };

    const result = gmpValidator.validateRawObservation(raw, baseIpoContext);
    assert.strictEqual(result.isValidForConsensus, false);
    assert.strictEqual(result.normalizedObservation.anomaly_status, 'invalid');
    assert.ok(result.rejectionReason?.includes('below ₹0 floor'));
  });

  // ============================================================================
  // Test 15: Extreme Spike Quarantine (>250% of Issue Price)
  // ============================================================================
  it('Test 15: should quarantine reported GMP exceeding 250% of issue price', () => {
    const raw: RawOTCPayload = {
      sourceId: 'speculator_desk',
      sourceFamily: 'aggregator',
      publisherId: 'portal_a',
      independenceGroup: 'GRP_SPEC',
      companyName: 'TechCorp Solutions Ltd',
      quoteTimestamp: new Date().toISOString(),
      rawGmp: 1300, // 1300 > 2.5 * 500 (1250)
    };

    const result = gmpValidator.validateRawObservation(raw, baseIpoContext);
    assert.strictEqual(result.isValidForConsensus, false);
    assert.strictEqual(result.normalizedObservation.anomaly_status, 'spike_quarantined');
    assert.ok(result.rejectionReason?.includes('exceeds extreme spike ceiling'));
  });

  // ============================================================================
  // Test 16: Intraday Jump Spike Quarantine (>150% in 4h)
  // ============================================================================
  it('Test 16: should quarantine sudden intraday GMP jump > 150% within 4 hours', () => {
    const t0 = new Date('2026-09-14T08:00:00Z').toISOString();
    const t1 = new Date('2026-09-14T09:30:00Z').toISOString(); // 1.5h later

    const contextWithPrior: IPOInstrumentContext = {
      ...baseIpoContext,
      lastValidGmp: 40,
      lastQuoteTime: t0,
    };

    const raw: RawOTCPayload = {
      sourceId: 'fast_source',
      sourceFamily: 'aggregator',
      publisherId: 'fast_pub',
      independenceGroup: 'GRP_FAST',
      companyName: 'TechCorp Solutions Ltd',
      quoteTimestamp: t1,
      rawGmp: 120, // (120 - 40) / 40 = 200% jump > 150%
    };

    const result = gmpValidator.validateRawObservation(raw, contextWithPrior, t1);
    assert.strictEqual(result.isValidForConsensus, false);
    assert.strictEqual(result.normalizedObservation.anomaly_status, 'spike_quarantined');
    assert.ok(result.rejectionReason?.includes('Sudden intraday jump'));
  });

  // ============================================================================
  // Test 17: TBA Price Band Protection
  // ============================================================================
  it('Test 17: should leave estimated listing price & gain % strictly null when price band is TBA', () => {
    const obs = [
      createMockObservation({ independence_group: 'GRP_A', reported_gmp_value: 40 }),
      createMockObservation({ independence_group: 'GRP_B', reported_gmp_value: 42 }),
    ];

    const result = gmpConsensusEngine.evaluateConsensus({
      ipoId: 'ipo-test-tba',
      priceBandHigh: null, // Price band TBA
      issuePrice: null,
      observations: obs,
    });

    assert.strictEqual(result.consensusGmpValue, 41);
    assert.strictEqual(result.estimatedListingPrice, null);
    assert.strictEqual(result.gmpPercentage, null);
    assert.strictEqual(result.estimatedListingGainPct, null);
  });

  // ============================================================================
  // Test 18: Freshness Policy Lifecycle (Correction 1: 24h expiration locked)
  // ============================================================================
  it('Test 18: (Correction 1) should evaluate freshness lifecycle accurately with 24h expiration', () => {
    const now = new Date('2026-09-14T12:00:00Z').getTime();

    // 1 hour ago -> fresh (0-2h)
    const freshTime = new Date(now - 1 * 3600 * 1000).toISOString();
    assert.strictEqual(determineFreshnessState(freshTime, now), 'fresh');

    // 4 hours ago -> aging (2-6h)
    const agingTime = new Date(now - 4 * 3600 * 1000).toISOString();
    assert.strictEqual(determineFreshnessState(agingTime, now), 'aging');

    // 12 hours ago -> stale (6-24h)
    const staleTime = new Date(now - 12 * 3600 * 1000).toISOString();
    assert.strictEqual(determineFreshnessState(staleTime, now), 'stale');

    // 25 hours ago -> expired (>24h)
    const expiredTime = new Date(now - 25 * 3600 * 1000).toISOString();
    assert.strictEqual(determineFreshnessState(expiredTime, now), 'expired');
    assert.strictEqual(GMP_POLICY_V1_2026_09.expiredThresholdHours, 24.0);
  });

  // ============================================================================
  // Test 19: Post-Listing Timestamp Freeze
  // ============================================================================
  it('Test 19: should reject post-listing quotes and lock consensus at confirmed listing timestamp', () => {
    const listingTimestamp = '2026-09-14T09:15:00Z';
    const postListingQuoteTime = '2026-09-14T10:00:00Z';

    const postListingContext: IPOInstrumentContext = {
      ...baseIpoContext,
      isListingConfirmed: true,
      confirmedListingTimestamp: listingTimestamp,
    };

    const raw: RawOTCPayload = {
      sourceId: 'late_desk',
      sourceFamily: 'broker_desk',
      publisherId: 'dealer_x',
      independenceGroup: 'GRP_LATE',
      companyName: 'TechCorp Solutions Ltd',
      quoteTimestamp: postListingQuoteTime,
      rawGmp: 85,
    };

    const validation = gmpValidator.validateRawObservation(raw, postListingContext, postListingQuoteTime);
    assert.strictEqual(validation.isValidForConsensus, false);
    assert.strictEqual(validation.normalizedObservation.anomaly_status, 'invalid');
    assert.ok(validation.rejectionReason?.includes('post-listing'));

    const consensus = gmpConsensusEngine.evaluateConsensus({
      ipoId: 'ipo-test-001',
      priceBandHigh: 500,
      isListingConfirmed: true,
      confirmedListingTimestamp: listingTimestamp,
      observations: [],
      currentTimestamp: postListingQuoteTime,
    });
    assert.strictEqual(consensus.isPostListingFrozen, true);
  });

  // ============================================================================
  // Test 20: Kostak Rate Separation
  // ============================================================================
  it('Test 20: should evaluate Kostak rate per application separately from share GMP', () => {
    const obs = [
      createMockObservation({
        independence_group: 'GRP_A',
        reported_gmp_value: 50,
        reported_kostak: 1200,
      }),
      createMockObservation({
        independence_group: 'GRP_B',
        reported_gmp_value: 52,
        reported_kostak: 1400,
      }),
    ];

    const result = gmpConsensusEngine.evaluateConsensus({
      ipoId: 'ipo-test-001',
      priceBandHigh: 500,
      observations: obs,
    });

    assert.strictEqual(result.consensusGmpValue, 51); // GMP per share
    assert.strictEqual(result.kostakRate, 1300); // Median of 1200 and 1400 (per application)
  });

  // ============================================================================
  // Test 21: Subject to Sauda Separation
  // ============================================================================
  it('Test 21: should evaluate Subject to Sauda per allotment with condition notes', () => {
    const obs = [
      createMockObservation({
        independence_group: 'GRP_A',
        reported_gmp_value: 50,
        reported_subject_to_sauda: 6500,
        sauda_condition_notes: 'Valid for retail applications only',
      }),
      createMockObservation({
        independence_group: 'GRP_B',
        reported_gmp_value: 52,
        reported_subject_to_sauda: 7000,
        sauda_condition_notes: 'Retail only',
      }),
    ];

    const result = gmpConsensusEngine.evaluateConsensus({
      ipoId: 'ipo-test-001',
      priceBandHigh: 500,
      observations: obs,
    });

    assert.strictEqual(result.subjectToSaudaRate, 6750); // Median of 6500 and 7000
    assert.strictEqual(result.saudaConditionNotes, 'Valid for retail applications only');
  });

  // ============================================================================
  // Test 22: 24h Trend Calculation
  // ============================================================================
  it('Test 22: should calculate accurate 24h trend movement direction and percentages', () => {
    const obs = [
      createMockObservation({ independence_group: 'GRP_A', reported_gmp_value: 65 }),
      createMockObservation({ independence_group: 'GRP_B', reported_gmp_value: 65 }),
    ];

    // Prior consensus was 50 -> upward movement of +15
    const result = gmpConsensusEngine.evaluateConsensus({
      ipoId: 'ipo-test-001',
      priceBandHigh: 500,
      previousConsensusGmp: 50,
      observations: obs,
    });

    assert.strictEqual(result.consensusGmpValue, 65);
    assert.strictEqual(result.dayChangeValue, 15);
    assert.strictEqual(result.trendDirection, 'rising');
    assert.strictEqual(result.dayChangePct, 23.08); // (15 / 65) * 100
  });

  // ============================================================================
  // Test 23: Source Verification & Fail-Closed (Correction 4)
  // ============================================================================
  it('Test 23: (Correction 4) should mark unverified sources as unavailable and fail closed', async () => {
    const chittorgarh = gmpSourceRegistry.getSource('chittorgarh_otc_feed');
    assert.ok(chittorgarh !== undefined);
    assert.strictEqual(chittorgarh?.state, 'unavailable');

    // Attempting to fetch from unverified source fails closed immediately
    const fetchResult = await gmpSourceRegistry.fetchSourceQuotes('chittorgarh_otc_feed');
    assert.strictEqual(fetchResult.success, false);
    assert.strictEqual(fetchResult.payloads.length, 0);
    assert.ok(fetchResult.error?.includes('unavailable'));
    assert.ok(fetchResult.error?.includes('Failing closed'));

    // Verification gate test: rejecting insecure loopback URL
    const activation = gmpSourceRegistry.verifyAndActivateSource(
      'chittorgarh_otc_feed',
      'https://127.0.0.1/api/gmp',
      {
        isTermsCompliant: true,
        isFormatVerified: true,
        isTimestampSemanticsVerified: true,
        isLineageVerified: true,
      }
    );
    assert.strictEqual(activation.success, false);
    assert.ok(activation.reason?.includes('SSRF security rejection'));
    assert.strictEqual(gmpSourceRegistry.isSourceAvailable('chittorgarh_otc_feed'), false);
  });

  // ============================================================================
  // Test 24: Hard Invariant, Regulatory Compliance & Deletion Guard
  // ============================================================================
  it('Test 24: wraps canonical compliance disclaimer and blocks deletion when records exist', async () => {
    const rawResult = gmpConsensusEngine.evaluateConsensus({
      ipoId: 'ipo-test-001',
      priceBandHigh: 500,
      observations: [
        createMockObservation({ independence_group: 'GRP_1', reported_gmp_value: 50 }),
        createMockObservation({ independence_group: 'GRP_2', reported_gmp_value: 50 }),
      ],
    });

    const compliantPayload = wrapCompliantGMPPayload(rawResult);
    assert.strictEqual(compliantPayload.authoritativeness, 'unofficial_otc_sentiment');
    assert.strictEqual(compliantPayload.isOfficialExchangeData, false);
    assert.strictEqual(compliantPayload.disclaimer, GMP_DISCLAIMER_V1);
    assert.strictEqual(compliantPayload.policyVersion, 'GMP_POLICY_V1_2026_09');

    // Deletion guard test: mock Supabase client returning positive count
    const mockSupabaseWithRecords: any = {
      from: (table: string) => ({
        select: () => ({
          eq: () => Promise.resolve({ count: 5, data: null, error: null }),
        }),
      }),
    };

    const deleteCheck = await GMPSyncService.canHardDeleteIpo('ipo-test-001', mockSupabaseWithRecords);
    assert.strictEqual(deleteCheck.canDelete, false);
    assert.ok(deleteCheck.reason?.includes('Archive instead of hard-deleting'));
  });
});
