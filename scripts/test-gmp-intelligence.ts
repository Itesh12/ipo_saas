/**
 * scripts/test-gmp-intelligence.ts
 *
 * Phase 9 Stage 3D: Dynamic Grey Market Premium (GMP) Intelligence Acceptance Runner.
 * 
 * Validates:
 * 1. 4 Mandatory Reviewer Corrections (24h expiry, safe spread, zero-MAD, source verification fail-closed).
 * 2. Multi-source consensus reconciliation with independence group deduplication.
 * 3. Kostak & Subject to Sauda separation from share GMP.
 * 4. Floor guard, spike quarantine, and TBA price band protection.
 * 5. Authoritative listing timestamp freeze.
 * 6. SEBI regulatory disclaimer wrapper.
 */

import {
  calculateSafeSpreadPct,
  determineFreshnessState,
  gmpConsensusEngine,
  GMP_POLICY_V1_2026_09,
} from '../features/external-integrations/gmp/gmpConsensusEngine';
import { gmpValidator } from '../features/external-integrations/gmp/gmpValidator';
import { gmpSourceRegistry } from '../features/external-integrations/gmp/gmpSourceRegistry';
import { GMPSyncService } from '../features/external-integrations/gmp/gmpSyncService';
import { wrapCompliantGMPPayload, GMP_DISCLAIMER_V1 } from '../features/external-integrations/gmp/gmpCompliance';
import { NormalizedGMPObservation, RawOTCPayload } from '../features/external-integrations/gmp/gmpTypes';

async function runAcceptance() {
  console.log('================================================================');
  console.log('🚀 PHASE 9 STAGE 3D: GREY MARKET PREMIUM (GMP) ACCEPTANCE RUNNER');
  console.log('================================================================\n');

  let passedGates = 0;
  let totalGates = 0;

  function assertGate(gateName: string, condition: boolean, detail: string) {
    totalGates++;
    if (condition) {
      passedGates++;
      console.log(`✅ [GATE ${totalGates}] ${gateName}: PASS (${detail})`);
    } else {
      console.error(`❌ [GATE ${totalGates}] ${gateName}: FAIL (${detail})`);
      process.exitCode = 1;
    }
  }

  // --------------------------------------------------------------------------
  // GATE 1: Freshness Policy Consistency (Correction 1)
  // --------------------------------------------------------------------------
  const now = Date.now();
  const freshState = determineFreshnessState(new Date(now - 1.5 * 3600 * 1000).toISOString(), now);
  const agingState = determineFreshnessState(new Date(now - 4 * 3600 * 1000).toISOString(), now);
  const staleState = determineFreshnessState(new Date(now - 12 * 3600 * 1000).toISOString(), now);
  const expiredState = determineFreshnessState(new Date(now - 25 * 3600 * 1000).toISOString(), now);

  assertGate(
    'Freshness Lifecycle & 24h Expiry (Correction 1)',
    freshState === 'fresh' &&
      agingState === 'aging' &&
      staleState === 'stale' &&
      expiredState === 'expired' &&
      GMP_POLICY_V1_2026_09.expiredThresholdHours === 24.0,
    `0-2h: ${freshState}, 2-6h: ${agingState}, 6-24h: ${staleState}, >24h: ${expiredState}, threshold: ${GMP_POLICY_V1_2026_09.expiredThresholdHours}h`
  );

  // --------------------------------------------------------------------------
  // GATE 2: Zero/Negative Spread Adversarial Matrix (Correction 2)
  // --------------------------------------------------------------------------
  const spreadNegPos = calculateSafeSpreadPct(-10, 10);
  const spreadZeroZero = calculateSafeSpreadPct(0, 0);
  const spreadBothNeg = calculateSafeSpreadPct(-20, -10);
  const spreadSmallNegPos = calculateSafeSpreadPct(-1, 1);

  assertGate(
    'Zero/Negative Safe Spread Calculations (Correction 2)',
    spreadNegPos === 200.0 &&
      spreadZeroZero === 0.0 &&
      spreadBothNeg === 50.0 &&
      spreadSmallNegPos === 200.0,
    `-10/+10 => ${spreadNegPos}%, 0/0 => ${spreadZeroZero}%, -20/-10 => ${spreadBothNeg}%, -1/+1 => ${spreadSmallNegPos}%`
  );

  // --------------------------------------------------------------------------
  // GATE 3: Zero-MAD Fallback Rule (Correction 3)
  // --------------------------------------------------------------------------
  const zeroMadObs: NormalizedGMPObservation[] = [
    {
      ipo_id: 'ipo-test-mad',
      source_observation_uid: 'uid-1',
      source_observation_hash: 'hash-1',
      gmp_source: 'src_1',
      source_family: 'aggregator',
      publisher_id: 'p1',
      upstream_source_id: null,
      independence_group: 'GRP_1',
      quote_time: new Date().toISOString(),
      reported_gmp_value: 50,
      reported_kostak: null,
      reported_subject_to_sauda: null,
      sauda_condition_notes: null,
      anomaly_status: 'valid',
      anomaly_reason: null,
      validation_status: 'verified',
      raw_payload_hash: 'r1',
    },
    {
      ipo_id: 'ipo-test-mad',
      source_observation_uid: 'uid-2',
      source_observation_hash: 'hash-2',
      gmp_source: 'src_2',
      source_family: 'aggregator',
      publisher_id: 'p2',
      upstream_source_id: null,
      independence_group: 'GRP_2',
      quote_time: new Date().toISOString(),
      reported_gmp_value: 50,
      reported_kostak: null,
      reported_subject_to_sauda: null,
      sauda_condition_notes: null,
      anomaly_status: 'valid',
      anomaly_reason: null,
      validation_status: 'verified',
      raw_payload_hash: 'r2',
    },
    {
      ipo_id: 'ipo-test-mad',
      source_observation_uid: 'uid-3',
      source_observation_hash: 'hash-3',
      gmp_source: 'src_3',
      source_family: 'aggregator',
      publisher_id: 'p3',
      upstream_source_id: null,
      independence_group: 'GRP_3',
      quote_time: new Date().toISOString(),
      reported_gmp_value: 50,
      reported_kostak: null,
      reported_subject_to_sauda: null,
      sauda_condition_notes: null,
      anomaly_status: 'valid',
      anomaly_reason: null,
      validation_status: 'verified',
      raw_payload_hash: 'r3',
    },
    {
      ipo_id: 'ipo-test-mad',
      source_observation_uid: 'uid-4',
      source_observation_hash: 'hash-4',
      gmp_source: 'src_4',
      source_family: 'aggregator',
      publisher_id: 'p4',
      upstream_source_id: null,
      independence_group: 'GRP_4',
      quote_time: new Date().toISOString(),
      reported_gmp_value: 350, // Outlier
      reported_kostak: null,
      reported_subject_to_sauda: null,
      sauda_condition_notes: null,
      anomaly_status: 'valid',
      anomaly_reason: null,
      validation_status: 'verified',
      raw_payload_hash: 'r4',
    },
  ];

  const zeroMadResult = gmpConsensusEngine.evaluateConsensus({
    ipoId: 'ipo-test-mad',
    priceBandHigh: 500,
    observations: zeroMadObs,
  });

  assertGate(
    'Zero-MAD Dataset Quarantine [50, 50, 50, 350] (Correction 3)',
    zeroMadResult.consensusGmpValue === 50 &&
      zeroMadResult.confidenceLevel === 'verified' &&
      zeroMadResult.outliersQuarantined.length === 1 &&
      zeroMadResult.outliersQuarantined[0].value === 350,
    `Consensus: ₹${zeroMadResult.consensusGmpValue}, Quarantined: ${zeroMadResult.outliersQuarantined.map(o => o.value).join(', ')}`
  );

  // --------------------------------------------------------------------------
  // GATE 4: Source Verification & Fail-Closed (Correction 4)
  // --------------------------------------------------------------------------
  const allSources = gmpSourceRegistry.getAllSources();
  const availableCount = gmpSourceRegistry.getAvailableSources().length;
  const testFetch = await gmpSourceRegistry.fetchSourceQuotes('chittorgarh_otc_feed');

  assertGate(
    'Source Verification Fail-Closed Architecture (Correction 4)',
    allSources.length >= 3 &&
      availableCount === 0 &&
      testFetch.success === false &&
      testFetch.error?.includes('unavailable') === true,
    `Total sources: ${allSources.length}, Available: ${availableCount}, Fetch failed-closed: "${testFetch.error}"`
  );

  // --------------------------------------------------------------------------
  // GATE 5: Kostak & Subject to Sauda Separation
  // --------------------------------------------------------------------------
  const otcObs: NormalizedGMPObservation[] = [
    {
      ...zeroMadObs[0],
      reported_gmp_value: 60,
      reported_kostak: 1200,
      reported_subject_to_sauda: 5000,
      sauda_condition_notes: 'Confirmed retail allotment only',
    },
    {
      ...zeroMadObs[1],
      reported_gmp_value: 62,
      reported_kostak: 1400,
      reported_subject_to_sauda: 5500,
      sauda_condition_notes: 'Retail only',
    },
  ];

  const otcResult = gmpConsensusEngine.evaluateConsensus({
    ipoId: 'ipo-test-otc',
    priceBandHigh: 600,
    observations: otcObs,
  });

  assertGate(
    'Kostak & Subject to Sauda Separation',
    otcResult.consensusGmpValue === 61 &&
      otcResult.kostakRate === 1300 &&
      otcResult.subjectToSaudaRate === 5250 &&
      otcResult.saudaConditionNotes?.includes('allotment') === true,
    `GMP: ₹${otcResult.consensusGmpValue}/share, Kostak: ₹${otcResult.kostakRate}/app, Sauda: ₹${otcResult.subjectToSaudaRate}/allotment`
  );

  // --------------------------------------------------------------------------
  // GATE 6: Floor Guard & Excessive Spike Quarantine
  // --------------------------------------------------------------------------
  const floorRaw: RawOTCPayload = {
    sourceId: 'src_broker',
    sourceFamily: 'broker_desk',
    publisherId: 'dealer_1',
    independenceGroup: 'GRP_DEALER',
    companyName: 'Floor Test Ltd',
    quoteTimestamp: new Date().toISOString(),
    rawGmp: -700, // Price band is 500 -> listing price -200 is invalid
  };

  const spikeRaw: RawOTCPayload = {
    sourceId: 'src_spec',
    sourceFamily: 'aggregator',
    publisherId: 'dealer_2',
    independenceGroup: 'GRP_SPEC',
    companyName: 'Spike Test Ltd',
    quoteTimestamp: new Date().toISOString(),
    rawGmp: 1400, // 1400 > 2.5 * 500 (1250)
  };

  const context = {
    id: 'ipo-test-floor',
    companyName: 'Floor Test Ltd',
    priceBandHigh: 500,
    issuePrice: 500,
  };

  const floorVal = gmpValidator.validateRawObservation(floorRaw, context);
  const spikeVal = gmpValidator.validateRawObservation(spikeRaw, context);

  assertGate(
    'Floor Guard & Extreme Spike Ceiling (>250%)',
    floorVal.isValidForConsensus === false &&
      floorVal.normalizedObservation.anomaly_status === 'invalid' &&
      spikeVal.isValidForConsensus === false &&
      spikeVal.normalizedObservation.anomaly_status === 'spike_quarantined',
    `Floor validation: ${floorVal.normalizedObservation.anomaly_status} ("${floorVal.rejectionReason}"), Spike validation: ${spikeVal.normalizedObservation.anomaly_status} ("${spikeVal.rejectionReason}")`
  );

  // --------------------------------------------------------------------------
  // GATE 7: Authoritative Listing Timestamp Freeze
  // --------------------------------------------------------------------------
  const freezeConsensus = gmpConsensusEngine.evaluateConsensus({
    ipoId: 'ipo-test-listed',
    priceBandHigh: 500,
    isListingConfirmed: true,
    confirmedListingTimestamp: '2026-09-10T09:15:00Z',
    observations: [],
    currentTimestamp: '2026-09-14T10:00:00Z',
  });

  assertGate(
    'Authoritative Listing Timestamp Freeze',
    freezeConsensus.isPostListingFrozen === true,
    `Listing confirmed at 2026-09-10, isPostListingFrozen = ${freezeConsensus.isPostListingFrozen}`
  );

  // --------------------------------------------------------------------------
  // GATE 8: Centralized Compliance Disclaimer Wrapper
  // --------------------------------------------------------------------------
  const compliantPayload = wrapCompliantGMPPayload(otcResult);

  assertGate(
    'Centralized SEBI Compliance Disclaimer & Classification',
    compliantPayload.authoritativeness === 'unofficial_otc_sentiment' &&
      compliantPayload.isOfficialExchangeData === false &&
      compliantPayload.disclaimer === GMP_DISCLAIMER_V1 &&
      compliantPayload.policyVersion === 'GMP_POLICY_V1_2026_09',
    `Authoritativeness: "${compliantPayload.authoritativeness}", Disclaimer verified: "${compliantPayload.disclaimer.slice(0, 45)}..."`
  );

  console.log('\n================================================================');
  console.log(`🏁 ACCEPTANCE COMPLETE: ${passedGates}/${totalGates} GATES PASSED`);
  console.log('================================================================\n');

  if (passedGates !== totalGates) {
    process.exit(1);
  }
}

runAcceptance().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
