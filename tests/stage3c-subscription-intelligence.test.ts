/**
 * tests/stage3c-subscription-intelligence.test.ts
 *
 * Comprehensive Test Suite for Phase 9 Stage 3C: Subscription & Allotment Intelligence (Revision 2.2).
 *
 * Covers all 21 mandatory test invariants:
 * 1. Intraday observation immutability (10:00 -> 11:00 -> 12:00 -> 17:00 preserved)
 * 2. Canonical snapshot materialization
 * 3. Source validation profile BSE_V1
 * 4. Source validation profile NSE_V1
 * 5. Technical cancellation handling (<2% drop classified as valid_with_adjustment)
 * 6. Corrigendum / source correction (source_corrected)
 * 7. Severe anomaly flagging (>10% delta flagged as anomalous without deletion)
 * 8. Negative multiple rejection (invalid status)
 * 9. Multi-exchange tolerance match with DSE priority
 * 10. Multi-exchange conflict quarantine (>5% divergence triggers conflict flag)
 * 11. Evidence-driven finalization (is_final_for_day requires session close marker)
 * 12. Official vs. estimated allotment separation (mandatory disclaimer present)
 * 13. Zero mutation of ipo_applications (Phase 4 invariant preserved)
 * 14. Zero silent date mutation (proposed dates in facts, no silent ipos overwrite)
 * 15. Registrar portal state transitions (reachable -> endpoint detected -> active)
 * 16. Registrar SSRF guard (blocks private IPs, userinfo, unapproved domains)
 * 17. Unverified status invariant (defaults to unverified)
 * 18. Zero-fixture dynamic acceptance (dynamic payload evaluation)
 * 19. Source observation retention & pruning survival (retains uid & cryptographic hash)
 * 20. Consolidated feed double-count protection (never sums consolidated feeds)
 * 21. Anchor allocation separation (quarantined from cumulative bidding & overall_x)
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';

import { SubscriptionValidator } from '../features/external-integrations/subscription/subscriptionValidator';
import { SubscriptionTaxonomy } from '../features/external-integrations/subscription/subscriptionTaxonomy';
import { BseSubscriptionAdapter } from '../features/external-integrations/subscription/bseSubscriptionAdapter';
import { NseSubscriptionAdapter } from '../features/external-integrations/subscription/nseSubscriptionAdapter';
import { SubscriptionReconciliationService } from '../features/external-integrations/subscription/subscriptionReconciliationService';
import { AllotmentIntelligenceService } from '../features/external-integrations/subscription/allotmentIntelligenceService';
import { RegistrarPortalProbeService } from '../features/external-integrations/subscription/registrarPortalProbeService';
import { SubscriptionSyncService } from '../features/external-integrations/subscription/subscriptionSyncService';
import {
  RawExchangeSubscriptionPayload,
  NormalizedSubscriptionObservation,
} from '../features/external-integrations/subscription/subscriptionTypes';

describe('Phase 9 Stage 3C: Subscription & Allotment Intelligence (Revision 2.2)', () => {
  const fakeIpoId = 'a1b2c3d4-1111-4000-a000-000000000001';

  // Test 1: Intraday observation immutability
  it('Test 1: Intraday observation history is strictly immutable and preserved', async () => {
    const observationsStored: any[] = [];
    const mockSupabase: any = {
      from: (table: string) => {
        if (table === 'ipos') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: {
                      id: fakeIpoId,
                      company_name: 'Test Tech Limited',
                      symbol: 'TESTTECH',
                      exchange: 'NSE,BSE',
                      designated_exchange: 'NSE',
                      status: 'active',
                      publication_status: 'published',
                    },
                    error: null,
                  }),
              }),
            }),
          };
        }
        if (table === 'ipo_subscription_observations') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: () => Promise.resolve({ data: null, error: null }),
                    }),
                  }),
                }),
              }),
            }),
            insert: (record: any) => {
              const obsWithId = { ...record, id: `obs-${observationsStored.length + 1}` };
              observationsStored.push(obsWithId);
              return {
                select: () => ({
                  single: () => Promise.resolve({ data: obsWithId, error: null }),
                }),
              };
            },
          };
        }
        if (table === 'ipo_subscription_snapshots') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: () => Promise.resolve({ data: null, error: null }),
                  }),
                }),
              }),
            }),
            upsert: () => ({
              select: () => ({
                single: () => Promise.resolve({ data: { id: 'snap-1' }, error: null }),
              }),
            }),
          };
        }
        if (table === 'ipo_allotment_estimates') {
          return {
            upsert: () => Promise.resolve({ error: null }),
          };
        }
        return {};
      },
    };

    const timestamps = [
      '2026-09-14T10:00:00.000Z',
      '2026-09-14T11:00:00.000Z',
      '2026-09-14T12:00:00.000Z',
      '2026-09-14T17:00:00.000Z',
    ];

    for (let i = 0; i < timestamps.length; i++) {
      const rawPayload: RawExchangeSubscriptionPayload = {
        exchange: 'NSE',
        companySymbol: 'TESTTECH',
        dayNumber: 1,
        asOfTimestamp: timestamps[i],
        feedScope: 'consolidated',
        isSessionClosed: i === 3,
        reportedOverallMultiple: (i + 1) * 0.5,
        categories: [
          {
            categoryName: 'Retail Individual Investors (RII)',
            sharesOffered: 1000000,
            sharesBid: (i + 1) * 500000,
            bidsCount: (i + 1) * 2000,
          },
        ],
      };

      await SubscriptionSyncService.processRawSubscription({
        rawPayload,
        ipoId: fakeIpoId,
        sourceObservationUid: `obs-uid-${i}`,
        sourceObservationHash: crypto.createHash('sha256').update(`obs-${i}`).digest('hex'),
        rawPayloadHash: crypto.createHash('sha256').update(JSON.stringify(rawPayload)).digest('hex'),
        supabaseClient: mockSupabase,
      });
    }

    assert.strictEqual(observationsStored.length, 4, 'All 4 intraday observations must be preserved');
    assert.strictEqual(observationsStored[0].snapshot_time, timestamps[0]);
    assert.strictEqual(observationsStored[3].snapshot_time, timestamps[3]);
    assert.strictEqual(observationsStored[3].is_final_for_day, true);
  });

  // Test 2: Canonical snapshot materialization
  it('Test 2: Canonical snapshot correctly materializes latest observation and preserves latest_observation_id', async () => {
    let capturedSnapshot: any = null;

    const mockSupabase: any = {
      from: (table: string) => {
        if (table === 'ipos') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: {
                      id: fakeIpoId,
                      company_name: 'Alpha Ltd',
                      symbol: 'ALPHA',
                      designated_exchange: 'NSE',
                    },
                    error: null,
                  }),
              }),
            }),
          };
        }
        if (table === 'ipo_subscription_observations') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: () => Promise.resolve({ data: null, error: null }),
                    }),
                  }),
                }),
              }),
            }),
            insert: (record: any) => ({
              select: () => ({
                single: () => Promise.resolve({ data: { id: 'obs-uuid-final-42' }, error: null }),
              }),
            }),
          };
        }
        if (table === 'ipo_subscription_snapshots') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: () => Promise.resolve({ data: null, error: null }),
                  }),
                }),
              }),
            }),
            upsert: (snapshot: any) => {
              capturedSnapshot = snapshot;
              return {
                select: () => ({
                  single: () => Promise.resolve({ data: { id: 'snap-uuid-99' }, error: null }),
                }),
              };
            },
          };
        }
        if (table === 'ipo_allotment_estimates') {
          return { upsert: () => Promise.resolve({ error: null }) };
        }
        return {};
      },
    };

    const rawPayload: RawExchangeSubscriptionPayload = {
      exchange: 'NSE',
      companySymbol: 'ALPHA',
      dayNumber: 3,
      asOfTimestamp: '2026-09-14T17:00:00.000Z',
      feedScope: 'consolidated',
      isSessionClosed: true,
      reportedOverallMultiple: 15.2,
      categories: [
        {
          categoryName: 'Qualified Institutional Buyers (QIB)',
          sharesOffered: 2000000,
          sharesBid: 50000000,
          subscriptionMultiple: 25.0,
        },
        {
          categoryName: 'Retail Individual Investors (RII)',
          sharesOffered: 1000000,
          sharesBid: 12000000,
          subscriptionMultiple: 12.0,
        },
        {
          categoryName: 'Non-Institutional Investors (bHNI)',
          sharesOffered: 500000,
          sharesBid: 8000000,
          subscriptionMultiple: 16.0,
        },
        {
          categoryName: 'Non-Institutional Investors (sHNI)',
          sharesOffered: 250000,
          sharesBid: 3000000,
          subscriptionMultiple: 12.0,
        },
      ],
    };

    const result = await SubscriptionSyncService.processRawSubscription({
      rawPayload,
      ipoId: fakeIpoId,
      sourceObservationUid: 'obs-uid-alpha-final',
      sourceObservationHash: 'hash-alpha',
      rawPayloadHash: 'hash-raw-alpha',
      supabaseClient: mockSupabase,
    });

    assert.ok(result.snapshotMaterialized, 'Snapshot must be materialized');
    assert.ok(capturedSnapshot, 'Captured snapshot must exist');
    assert.strictEqual(capturedSnapshot.latest_observation_id, 'obs-uuid-final-42');
    assert.strictEqual(capturedSnapshot.retail_x, 12.0);
    assert.strictEqual(capturedSnapshot.b_hni_x, 16.0);
    assert.strictEqual(capturedSnapshot.s_hni_x, 12.0);
    assert.strictEqual(capturedSnapshot.qib_x, 25.0);
    assert.strictEqual(capturedSnapshot.authoritative_exchange, 'NSE');
  });

  // Test 3: Source validation profile BSE_V1
  it('Test 3: Validates realistic BSE subscription payload under BSE_V1 profile', () => {
    const raw: RawExchangeSubscriptionPayload = {
      exchange: 'BSE',
      companySymbol: 'BSECO',
      dayNumber: 1,
      asOfTimestamp: '2026-09-14T17:00:00.000Z',
      feedScope: 'exchange_specific',
      reportedOverallMultiple: 2.5,
      categories: [
        {
          categoryName: 'Retail Individual Investors',
          sharesOffered: 1000000,
          sharesBid: 2500000,
        },
      ],
    };

    const normalized = BseSubscriptionAdapter.normalize({
      raw,
      ipoId: fakeIpoId,
      sourceObservationUid: 'uid-bse-1',
      sourceObservationHash: 'hash-bse-1',
      rawPayloadHash: 'hash-raw-bse-1',
    });

    assert.strictEqual(normalized.exchange, 'BSE');
    assert.strictEqual(normalized.feed_scope, 'exchange_specific');
    assert.strictEqual(normalized.retail_x, 2.5);
    assert.strictEqual(normalized.anomaly_status, 'valid');
  });

  // Test 4: Source validation profile NSE_V1
  it('Test 4: Validates realistic NSE subscription payload under NSE_V1 profile', () => {
    const raw: RawExchangeSubscriptionPayload = {
      exchange: 'NSE',
      companySymbol: 'NSECO',
      dayNumber: 2,
      asOfTimestamp: '2026-09-14T17:00:00.000Z',
      feedScope: 'consolidated',
      reportedOverallMultiple: 4.0,
      categories: [
        {
          categoryName: 'Qualified Institutional Buyers (QIB)',
          sharesOffered: 1000000,
          sharesBid: 4000000,
        },
      ],
    };

    const normalized = NseSubscriptionAdapter.normalize({
      raw,
      ipoId: fakeIpoId,
      sourceObservationUid: 'uid-nse-1',
      sourceObservationHash: 'hash-nse-1',
      rawPayloadHash: 'hash-raw-nse-1',
    });

    assert.strictEqual(normalized.exchange, 'NSE');
    assert.strictEqual(normalized.feed_scope, 'consolidated');
    assert.strictEqual(normalized.qib_x, 4.0);
    assert.strictEqual(normalized.calculation_basis, 'nse_category_shares');
  });

  // Test 5: Technical cancellation handling (<2%)
  it('Test 5: Minor technical order cancellation (<2%) classified as valid_with_adjustment', () => {
    const prevBids = 10000000;
    const currentBids = 9850000; // 1.5% drop (due to order revision)

    const categories = {
      RETAIL: {
        category: 'RETAIL' as const,
        shares_offered: 5000000,
        shares_bid: currentBids,
        bids_count: 50000,
        subscription_x: 1.97,
      },
    };

    const result = SubscriptionValidator.validate({
      profile: 'NSE_V1',
      reportedOverallX: 1.97,
      categories,
      previousObservationTotalBids: prevBids,
    });

    assert.strictEqual(result.is_valid, true);
    assert.strictEqual(result.anomaly_status, 'valid_with_adjustment');
    assert.ok(result.anomaly_reason?.includes('Minor technical bid cancellation'));
  });

  // Test 6: Corrigendum / source correction
  it('Test 6: Official exchange corrigendum updates status to source_corrected', () => {
    const categories = {
      RETAIL: {
        category: 'RETAIL' as const,
        shares_offered: 1000000,
        shares_bid: 5000000,
        bids_count: 10000,
        subscription_x: 5.0,
      },
    };

    const result = SubscriptionValidator.validate({
      profile: 'NSE_V1',
      reportedOverallX: 5.0,
      categories,
      isCorrigendum: true,
    });

    assert.strictEqual(result.is_valid, true);
    assert.strictEqual(result.anomaly_status, 'source_corrected');
    assert.ok(result.anomaly_reason?.includes('corrigendum'));
  });

  // Test 7: Severe anomaly flagging (>10%)
  it('Test 7: Mathematical parity discrepancy >10% flags anomaly without destroying observation', () => {
    const categories = {
      RETAIL: {
        category: 'RETAIL' as const,
        shares_offered: 1000000,
        shares_bid: 2000000, // Computed is 2.0x
        bids_count: 5000,
        subscription_x: 2.0,
      },
    };

    // Reported is 10.0x (wildly conflicting with mathematical sum 2.0x)
    const result = SubscriptionValidator.validate({
      profile: 'NSE_V1',
      reportedOverallX: 10.0,
      categories,
    });

    assert.strictEqual(result.is_valid, true, 'Record is not deleted; remains accessible for audit');
    assert.strictEqual(result.anomaly_status, 'anomalous');
    assert.ok(result.anomaly_reason?.includes('exceeds 10% threshold'));
  });

  // Test 8: Negative multiple rejection
  it('Test 8: Negative multiples or negative bid quantities are rejected with invalid status', () => {
    const categories = {
      RETAIL: {
        category: 'RETAIL' as const,
        shares_offered: 1000000,
        shares_bid: -500,
        bids_count: 10,
        subscription_x: -0.5,
      },
    };

    const result = SubscriptionValidator.validate({
      profile: 'BSE_V1',
      reportedOverallX: -1.0,
      categories,
    });

    assert.strictEqual(result.is_valid, false);
    assert.strictEqual(result.anomaly_status, 'invalid');
  });

  // Test 9: Multi-exchange tolerance match with DSE priority
  it('Test 9: BSE and NSE within 5% tolerance selects DSE (Designated Exchange) as canonical', () => {
    const obsNSE: NormalizedSubscriptionObservation = {
      ipo_id: fakeIpoId,
      source_observation_uid: 'nse-uid-1',
      source_observation_hash: 'hash-nse',
      exchange: 'NSE',
      feed_scope: 'consolidated',
      source_composition: ['NSE'],
      day_number: 2,
      snapshot_time: '2026-09-14T17:00:00Z',
      reported_overall_x: 10.2,
      computed_overall_x: 10.2,
      calculation_basis: 'nse_category_shares',
      tolerance_pct: 5.0,
      anomaly_status: 'valid',
      source_qib_definition: 'net_of_anchor',
      definition_verified: true,
      anchor_adjustment_applied: false,
      qib_x: 15.0,
      b_hni_x: 10.0,
      s_hni_x: 8.0,
      retail_x: 9.0,
      employee_x: null,
      shareholder_x: null,
      category_details: {},
      validation_status: 'unverified',
      raw_payload_hash: 'raw-hash-nse',
      is_corrected: false,
      is_final_for_day: true,
    };

    const obsBSE: NormalizedSubscriptionObservation = {
      ...obsNSE,
      exchange: 'BSE',
      source_observation_uid: 'bse-uid-1',
      source_observation_hash: 'hash-bse',
      reported_overall_x: 10.4, // within 2% delta
      computed_overall_x: 10.4,
    };

    const result = SubscriptionReconciliationService.reconcile({
      obsA: obsNSE,
      obsB: obsBSE,
      designatedExchange: 'NSE',
    });

    assert.strictEqual(result.isConflict, false);
    assert.strictEqual(result.authoritativeObservation.exchange, 'NSE', 'DSE (NSE) must take precedence');
    assert.strictEqual(result.reconciledFeedScope, 'consolidated');
  });

  // Test 10: Multi-exchange conflict quarantine
  it('Test 10: Divergence > 5% between consolidated feeds flags conflict and halts silent overwrite', () => {
    const obsNSE: NormalizedSubscriptionObservation = {
      ipo_id: fakeIpoId,
      source_observation_uid: 'nse-uid-1',
      source_observation_hash: 'hash-nse',
      exchange: 'NSE',
      feed_scope: 'consolidated',
      source_composition: ['NSE'],
      day_number: 2,
      snapshot_time: '2026-09-14T17:00:00Z',
      reported_overall_x: 15.0,
      computed_overall_x: 15.0,
      calculation_basis: 'nse_category_shares',
      tolerance_pct: 5.0,
      anomaly_status: 'valid',
      source_qib_definition: 'net_of_anchor',
      definition_verified: true,
      anchor_adjustment_applied: false,
      qib_x: 20.0,
      b_hni_x: 15.0,
      s_hni_x: 12.0,
      retail_x: 10.0,
      employee_x: null,
      shareholder_x: null,
      category_details: {},
      validation_status: 'unverified',
      raw_payload_hash: 'raw-hash-nse',
      is_corrected: false,
      is_final_for_day: true,
    };

    const obsBSE: NormalizedSubscriptionObservation = {
      ...obsNSE,
      exchange: 'BSE',
      reported_overall_x: 9.0, // 40% divergence!
      computed_overall_x: 9.0,
    };

    const result = SubscriptionReconciliationService.reconcile({
      obsA: obsNSE,
      obsB: obsBSE,
      designatedExchange: 'NSE',
    });

    assert.strictEqual(result.isConflict, true);
    assert.ok(result.conflictReason?.includes('Material divergence'));
  });

  // Test 11: Evidence-driven finalization
  it('Test 11: is_final_for_day requires session close marker or post-market timestamp', () => {
    const rawOpen: RawExchangeSubscriptionPayload = {
      exchange: 'NSE',
      companySymbol: 'BETA',
      dayNumber: 1,
      asOfTimestamp: '2026-09-14T11:30:00.000Z',
      feedScope: 'consolidated',
      isSessionClosed: false,
      categories: [],
    };

    const normalizedOpen = NseSubscriptionAdapter.normalize({
      raw: rawOpen,
      ipoId: fakeIpoId,
      sourceObservationUid: 'uid-open',
      sourceObservationHash: 'hash-open',
      rawPayloadHash: 'hash-raw-open',
    });

    assert.strictEqual(normalizedOpen.is_final_for_day, false);

    const rawClosed: RawExchangeSubscriptionPayload = {
      ...rawOpen,
      asOfTimestamp: '2026-09-14T17:05:00.000Z',
      isSessionClosed: true,
    };

    const normalizedClosed = NseSubscriptionAdapter.normalize({
      raw: rawClosed,
      ipoId: fakeIpoId,
      sourceObservationUid: 'uid-closed',
      sourceObservationHash: 'hash-closed',
      rawPayloadHash: 'hash-raw-closed',
    });

    assert.strictEqual(normalizedClosed.is_final_for_day, true);
    assert.ok(normalizedClosed.session_close_source);
  });

  // Test 12: Official vs. estimated allotment separation
  it('Test 12: Pre-basis estimates strictly mandate disclaimer; official facts require verified document id', () => {
    const estimates = AllotmentIntelligenceService.computePreBasisEstimates({
      ipoId: fakeIpoId,
      finalSubscriptionSnapshotId: 'snap-123',
      retailX: 8.5,
    });

    assert.strictEqual(estimates.estimated_retail_lottery_ratio, 8.5);
    assert.strictEqual(estimates.estimated_retail_allotment_probability_pct, 11.76);
    assert.ok(estimates.estimation_disclaimer.includes('Official allotment odds are governed by the Registrar Basis of Allotment'));

    const officialFacts = AllotmentIntelligenceService.normalizeOfficialBasisFacts({
      ipoId: fakeIpoId,
      basisDocumentId: 'doc-boa-uuid-77',
      totalValidApplications: 1250000,
      totalRejectedApplications: 34000,
      retailValidApplications: 1000000,
      retailSuccessfulApplicants: 125000,
      shniValidApplications: 50000,
      shniSuccessfulApplicants: 5000,
    });

    assert.strictEqual(officialFacts.basis_document_id, 'doc-boa-uuid-77');
    assert.strictEqual(officialFacts.official_retail_lottery_ratio, 8.0);
    assert.strictEqual(officialFacts.official_shni_lottery_ratio, 10.0);
  });

  // Test 13: Zero mutation of ipo_applications
  it('Test 13: Subscription and allotment intelligence executes with zero interaction with ipo_applications', async () => {
    let touchedUserApplications = false;

    const mockSupabase: any = {
      from: (table: string) => {
        if (table === 'ipo_applications' || table === 'ipo_application_allotments') {
          touchedUserApplications = true;
          throw new Error('VIOLATION: Stage 3C must never access or mutate user application tables!');
        }
        if (table === 'ipos') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: {
                      id: fakeIpoId,
                      company_name: 'Guarded Corp',
                      symbol: 'GUARD',
                      designated_exchange: 'NSE',
                    },
                    error: null,
                  }),
              }),
            }),
          };
        }
        if (table === 'ipo_subscription_observations') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: () => Promise.resolve({ data: null, error: null }),
                    }),
                  }),
                }),
              }),
            }),
            insert: () => ({
              select: () => ({ single: () => Promise.resolve({ data: { id: 'obs-safe-1' }, error: null }) }),
            }),
          };
        }
        if (table === 'ipo_subscription_snapshots') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: () => Promise.resolve({ data: null, error: null }),
                  }),
                }),
              }),
            }),
            upsert: () => ({
              select: () => ({ single: () => Promise.resolve({ data: { id: 'snap-safe-1' }, error: null }) }),
            }),
          };
        }
        if (table === 'ipo_allotment_estimates') {
          return { upsert: () => Promise.resolve({ error: null }) };
        }
        return {};
      },
    };

    const rawPayload: RawExchangeSubscriptionPayload = {
      exchange: 'NSE',
      companySymbol: 'GUARD',
      dayNumber: 1,
      asOfTimestamp: '2026-09-14T17:00:00.000Z',
      feedScope: 'consolidated',
      categories: [{ categoryName: 'Retail Individual Investors', sharesOffered: 1000, sharesBid: 2000 }],
    };

    await SubscriptionSyncService.processRawSubscription({
      rawPayload,
      ipoId: fakeIpoId,
      sourceObservationUid: 'uid-guard',
      sourceObservationHash: 'hash-guard',
      rawPayloadHash: 'hash-raw-guard',
      supabaseClient: mockSupabase,
    });

    assert.strictEqual(touchedUserApplications, false, 'ipo_applications table must never be queried or updated');
  });

  // Test 14: Zero silent date mutation
  it('Test 14: Proposed allotment and listing dates are stored in ipo_allotment_facts without mutating ipos table', () => {
    const facts = AllotmentIntelligenceService.normalizeOfficialBasisFacts({
      ipoId: fakeIpoId,
      basisDocumentId: 'doc-boa-88',
      totalValidApplications: 500000,
      totalRejectedApplications: 1200,
      retailValidApplications: 400000,
      retailSuccessfulApplicants: 50000,
      proposedAllotmentDate: '2026-09-20',
      proposedListingDate: '2026-09-24',
    });

    // The facts payload preserves proposed dates
    assert.strictEqual(facts.proposed_allotment_date, '2026-09-20');
    assert.strictEqual(facts.proposed_listing_date, '2026-09-24');
    // Ensure it targets facts schema, not ipos direct columns
    assert.strictEqual((facts as any).listing_date, undefined);
    assert.strictEqual((facts as any).allotment_date, undefined);
  });

  // Test 15: Registrar portal state transitions
  it('Test 15: Observable registrar portal state transitions across reachable, endpoint detected, and active', () => {
    const activeLabel = RegistrarPortalProbeService.formatStateLabel('query_active');
    assert.strictEqual(activeLabel.variant, 'success');
    assert.strictEqual(activeLabel.label, 'Allotment Query Active');

    const detectedLabel = RegistrarPortalProbeService.formatStateLabel('query_endpoint_detected');
    assert.strictEqual(detectedLabel.variant, 'info');

    const blockedLabel = RegistrarPortalProbeService.formatStateLabel('blocked');
    assert.strictEqual(blockedLabel.variant, 'danger');

    const unavailLabel = RegistrarPortalProbeService.formatStateLabel('temporarily_unavailable');
    assert.strictEqual(unavailLabel.variant, 'danger');
  });

  // Test 16: Registrar SSRF guard
  it('Test 16: Registrar portal probe blocks unauthorized domains, loopback addresses, and credential smuggling', async () => {
    // 1. Private loopback attempt
    const probeLoopback = await RegistrarPortalProbeService.probePortal({
      ipoId: fakeIpoId,
      registrarName: 'Link Intime',
      portalUrl: 'https://127.0.0.1/allotment',
      companyName: 'Test Limited',
    });
    assert.strictEqual(probeLoopback.query_state, 'blocked');
    assert.ok(probeLoopback.error_details?.includes('SSRF security violation'));

    // 2. Credential smuggling
    const probeSmuggle = await RegistrarPortalProbeService.probePortal({
      ipoId: fakeIpoId,
      registrarName: 'Link Intime',
      portalUrl: 'https://linkintime.co.in@evil.com/allotment',
      companyName: 'Test Limited',
    });
    assert.strictEqual(probeSmuggle.query_state, 'blocked');

    // 3. Unauthorized domain
    const probeEvil = await RegistrarPortalProbeService.probePortal({
      ipoId: fakeIpoId,
      registrarName: 'Link Intime',
      portalUrl: 'https://attacker-fake-registrar.com/allotment',
      companyName: 'Test Limited',
    });
    assert.strictEqual(probeEvil.query_state, 'blocked');
  });

  // Test 17: Unverified status invariant
  it('Test 17: Newly normalized subscription observations default to unverified status', () => {
    const raw: RawExchangeSubscriptionPayload = {
      exchange: 'NSE',
      companySymbol: 'UNVER',
      dayNumber: 1,
      asOfTimestamp: '2026-09-14T10:00:00Z',
      feedScope: 'consolidated',
      categories: [],
    };

    const normalized = NseSubscriptionAdapter.normalize({
      raw,
      ipoId: fakeIpoId,
      sourceObservationUid: 'uid-unver',
      sourceObservationHash: 'hash-unver',
      rawPayloadHash: 'hash-raw-unver',
    });

    assert.strictEqual(normalized.validation_status, 'unverified');
  });

  // Test 18: Zero-fixture dynamic acceptance
  it('Test 18: Dynamic mathematical parsing calculates accurate multiples across variable allocations', () => {
    const dynamicOffered = Math.floor(Math.random() * 5000000) + 1000000;
    const dynamicBidMultiple = 3.75;
    const dynamicBid = Math.round(dynamicOffered * dynamicBidMultiple);

    const categories = {
      RETAIL: {
        category: 'RETAIL' as const,
        shares_offered: dynamicOffered,
        shares_bid: dynamicBid,
        bids_count: 25000,
        subscription_x: dynamicBidMultiple,
      },
    };

    const result = SubscriptionValidator.validate({
      profile: 'NSE_V1',
      reportedOverallX: dynamicBidMultiple,
      categories,
    });

    assert.strictEqual(result.is_valid, true);
    assert.strictEqual(result.computed_overall_x, dynamicBidMultiple);
    assert.strictEqual(result.anomaly_status, 'valid');
  });

  // Test 19: Source observation retention & pruning survival
  it('Test 19: Subscription observation retains permanent source_observation_uid and cryptographic hash even if raw observation is deleted', () => {
    const rawHash = crypto.createHash('sha256').update('sample_raw_observation_payload').digest('hex');
    const sourceUid = 'obs-uid-permanent-999';

    const raw: RawExchangeSubscriptionPayload = {
      exchange: 'NSE',
      companySymbol: 'PERM',
      dayNumber: 1,
      asOfTimestamp: '2026-09-14T15:00:00Z',
      feedScope: 'consolidated',
      categories: [],
    };

    // Simulate raw observation being pruned: sourceObservationId is undefined/null
    const normalized = NseSubscriptionAdapter.normalize({
      raw,
      ipoId: fakeIpoId,
      sourceObservationId: null,
      sourceObservationUid: sourceUid,
      sourceObservationHash: rawHash,
      rawPayloadHash: 'raw-hash-1',
    });

    assert.strictEqual(normalized.source_observation_id, null);
    assert.strictEqual(normalized.source_observation_uid, sourceUid);
    assert.strictEqual(normalized.source_observation_hash, rawHash);
  });

  // Test 20: Consolidated feed double-count protection
  it('Test 20: Consolidated feeds from NSE (10.0x) and BSE (10.1x) reconcile rather than summing to 20.1x', () => {
    const nseConsolidated: NormalizedSubscriptionObservation = {
      ipo_id: fakeIpoId,
      source_observation_uid: 'uid-nse-cons',
      source_observation_hash: 'hash-nse-cons',
      exchange: 'NSE',
      feed_scope: 'consolidated',
      source_composition: ['NSE', 'BSE'],
      day_number: 1,
      snapshot_time: '2026-09-14T17:00:00Z',
      reported_overall_x: 10.0,
      computed_overall_x: 10.0,
      calculation_basis: 'nse_category_shares',
      tolerance_pct: 5.0,
      anomaly_status: 'valid',
      source_qib_definition: 'net_of_anchor',
      definition_verified: true,
      anchor_adjustment_applied: false,
      qib_x: 12.0,
      b_hni_x: 10.0,
      s_hni_x: 8.0,
      retail_x: 9.0,
      employee_x: null,
      shareholder_x: null,
      category_details: {},
      validation_status: 'unverified',
      raw_payload_hash: 'raw-hash-1',
      is_corrected: false,
      is_final_for_day: true,
    };

    const bseConsolidated: NormalizedSubscriptionObservation = {
      ...nseConsolidated,
      exchange: 'BSE',
      reported_overall_x: 10.1,
      computed_overall_x: 10.1,
    };

    const result = SubscriptionReconciliationService.reconcile({
      obsA: nseConsolidated,
      obsB: bseConsolidated,
      designatedExchange: 'NSE',
    });

    // Must NOT sum to 20.1x! Must be <= 10.5x
    assert.strictEqual(result.isConflict, false);
    assert.strictEqual(result.authoritativeObservation.reported_overall_x, 10.0);
    assert.notStrictEqual(result.authoritativeObservation.reported_overall_x, 20.1);
  });

  // Test 21: Anchor allocation separation
  it('Test 21: Anchor allocations are quarantined and do NOT contribute to live cumulative bidding demand or overall_x', () => {
    const categories: Record<string, any> = {
      ANCHOR: {
        category: 'ANCHOR',
        shares_offered: 5000000,
        shares_bid: 5000000, // 100% allotted pre-issue
        bids_count: 50,
        subscription_x: 1.0,
      },
      QIB: {
        category: 'QIB',
        shares_offered: 3000000,
        shares_bid: 9000000, // 3.0x live public demand
        bids_count: 120,
        subscription_x: 3.0,
      },
      RETAIL: {
        category: 'RETAIL',
        shares_offered: 2000000,
        shares_bid: 6000000, // 3.0x
        bids_count: 20000,
        subscription_x: 3.0,
      },
    };

    const result = SubscriptionValidator.validate({
      profile: 'NSE_V1',
      reportedOverallX: 3.0,
      categories,
    });

    // Total public offered = 3M (QIB) + 2M (Retail) = 5M (Anchor 5M strictly excluded)
    // Total public bid = 9M + 6M = 15M
    // Expected computed overall = 15M / 5M = 3.0x
    // If anchor were mistakenly included: (15M + 5M) / (5M + 5M) = 20M / 10M = 2.0x
    assert.strictEqual(result.is_valid, true);
    assert.strictEqual(result.computed_overall_x, 3.0, 'Anchor must be quarantined from overall_x calculation');
  });
});
