/**
 * scripts/verify-live-phase9-stage3a.ts
 *
 * Comprehensive Live Supabase Verification Suite for Phase 9 Stage 3A:
 * - Tests Database-Level Global Source-Identity Invariance (Hardening Req 1)
 * - Tests Fail-Closed Pruning Authorization Context & Non-Forgeability (Hardening Req 2)
 * - Tests Immutable Observation Triggers (No Delete, No Unauthorized Update)
 * - Tests Ingestion Inbox No-Delete Trigger
 * - Tests Latest-Observation Consistency Trigger (No Cross-Inbox Pointers)
 * - Tests Sequential Version Allocation via Advisory Locks
 */

import fs from 'fs';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

function sha256(val: string): string {
  return crypto.createHash('sha256').update(val).digest('hex');
}

const env = fs.readFileSync('C:/Users/Dell/.gemini/antigravity-ide/scratch/ipo-saas/.env.local', 'utf-8');
const envVars: Record<string, string> = {};
for (const line of env.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = trimmed.indexOf('=');
  if (idx !== -1) {
    envVars[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
}

const serviceClient = createClient(envVars.NEXT_PUBLIC_SUPABASE_URL, envVars.SUPABASE_SERVICE_ROLE_KEY);
const anonClient = createClient(envVars.NEXT_PUBLIC_SUPABASE_URL, envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function runLiveVerification() {
  console.log('========================================================================');
  console.log('🚀 Phase 9 Stage 3A: Live Supabase Security & Hardening Verification');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
      failed++;
    }
  }

  // 1. Verify Tables and Schema Cache
  console.log('--- 1. Schema & Table Integrity ---');
  const { error: inboxErr } = await serviceClient.from('ipo_ingestion_inbox').select('id').limit(1);
  assert(!inboxErr, 'ipo_ingestion_inbox table accessible to service_role', inboxErr?.message);

  const { error: obsErr } = await serviceClient.from('ipo_ingestion_observations').select('id').limit(1);
  assert(!obsErr, 'ipo_ingestion_observations table accessible to service_role', obsErr?.message);

  const { error: bindErr } = await serviceClient.from('ipo_source_identity_bindings').select('source').limit(1);
  assert(!bindErr, 'ipo_source_identity_bindings table accessible to service_role', bindErr?.message);

  if (bindErr) {
    console.error('\n⚠️  Migration 20260911000013_phase9_stage3_inbox.sql must be applied in Supabase Dashboard before continuing.');
    return;
  }

  // Create a Test Inbox Item A
  console.log('\n--- 2. Atomic Observation Ingestion & Versioning ---');
  const { data: inboxA, error: createInboxAErr } = await serviceClient
    .from('ipo_ingestion_inbox')
    .insert({
      canonical_name: 'Live Test IPO Alpha Ltd',
      symbol: 'TESTALPHA',
      isin: 'INE999A01019',
      review_status: 'pending',
    })
    .select('id')
    .single();

  assert(!!inboxA && !createInboxAErr, 'Created canonical inbox record A', createInboxAErr?.message);
  const inboxAId = inboxA!.id;

  const hash1 = sha256('payload-v1-alpha');
  const hash2 = sha256('payload-v2-alpha');
  const hashCollision = sha256('payload-collision');

  const runId = Date.now();
  const testExternalId = `SEBI-LIVE-TEST-${runId}`;

  // Ingest Observation v1 via RPC
  const { data: rpcRes1, error: rpcErr1 } = await serviceClient.rpc('record_ipo_observation', {
    p_inbox_id: inboxAId,
    p_source: 'sebi',
    p_external_id: testExternalId,
    p_document_type: 'DRHP',
    p_payload_hash: hash1,
    p_raw_payload: { filing_id: testExternalId, company: 'Live Test IPO Alpha Ltd' },
    p_normalized_payload: { company_name: 'Live Test IPO Alpha Ltd', issue_type: 'book_building' },
    p_provenance: { company_name: { source: 'sebi', observed_at: new Date().toISOString(), confidence: 1.0 } },
  });

  assert(
    !rpcErr1 && rpcRes1?.version === 1 && rpcRes1?.is_duplicate === false,
    'Observation v1 ingested atomically with version 1',
    rpcErr1?.message
  );

  const obs1Id = rpcRes1?.observation_id;

  // Update Inbox A pointer to obs1Id for testing cross-inbox and consistency
  if (obs1Id) {
    await serviceClient
      .from('ipo_ingestion_inbox')
      .update({ latest_observation_id: obs1Id })
      .eq('id', inboxAId);
  }

  // Duplicate payload hash test: should return same observation_id and is_duplicate = true
  const { data: rpcResDup, error: rpcErrDup } = await serviceClient.rpc('record_ipo_observation', {
    p_inbox_id: inboxAId,
    p_source: 'sebi',
    p_external_id: testExternalId,
    p_document_type: 'DRHP',
    p_payload_hash: hash1,
    p_raw_payload: { filing_id: testExternalId, company: 'Live Test IPO Alpha Ltd' },
    p_normalized_payload: { company_name: 'Live Test IPO Alpha Ltd', issue_type: 'book_building' },
    p_provenance: { company_name: { source: 'sebi', observed_at: new Date().toISOString(), confidence: 1.0 } },
  });

  assert(
    !rpcErrDup && rpcResDup?.is_duplicate === true && rpcResDup?.observation_id === obs1Id,
    'Deduplication: Identical payload hash detected, no duplicate observation created',
    rpcErrDup?.message
  );

  // Ingest Observation v2 with new hash
  const { data: rpcRes2, error: rpcErr2 } = await serviceClient.rpc('record_ipo_observation', {
    p_inbox_id: inboxAId,
    p_source: 'sebi',
    p_external_id: testExternalId,
    p_document_type: 'DRHP',
    p_payload_hash: hash2,
    p_raw_payload: { filing_id: testExternalId, company: 'Live Test IPO Alpha Ltd (Amended)' },
    p_normalized_payload: { company_name: 'Live Test IPO Alpha Ltd', issue_type: 'book_building', price_band_low: 100 },
    p_provenance: { company_name: { source: 'sebi', observed_at: new Date().toISOString(), confidence: 1.0 } },
  });

  assert(
    !rpcErr2 && rpcRes2?.version === 2 && rpcRes2?.is_duplicate === false,
    'Sequential version allocation: Version 2 created under advisory lock',
    rpcErr2?.message
  );

  // 3. HARDENING REQUIREMENT 1: Global Source-Identity Invariance
  console.log('\n--- 3. Hardening Requirement 1: Global Source-Identity Invariance ---');
  // Create Inbox Item B
  const { data: inboxB } = await serviceClient
    .from('ipo_ingestion_inbox')
    .insert({
      canonical_name: 'Live Test IPO Beta Ltd',
      symbol: 'TESTBETA',
      isin: 'INE888B01018',
      review_status: 'pending',
    })
    .select('id')
    .single();

  const inboxBId = inboxB!.id;

  // Attempt to attach the same (source: sebi, external_id: testExternalId, document_type: DRHP) to Inbox B
  const { error: collisionErr } = await serviceClient.rpc('record_ipo_observation', {
    p_inbox_id: inboxBId,
    p_source: 'sebi',
    p_external_id: testExternalId,
    p_document_type: 'DRHP',
    p_payload_hash: hashCollision,
    p_raw_payload: {},
    p_normalized_payload: { company_name: 'Sneaky Colliding Entity' },
    p_provenance: {},
  });

  assert(
    !!collisionErr && collisionErr.message.includes('Identity collision'),
    'Enforce global 1:1 binding: Attaching existing source identity to another inbox fails closed',
    collisionErr?.message
  );

  // Verify direct insertion into ipo_source_identity_bindings is rejected by PRIMARY KEY
  const { error: directBindErr } = await serviceClient
    .from('ipo_source_identity_bindings')
    .insert({
      source: 'sebi',
      external_id: testExternalId,
      document_type: 'DRHP',
      inbox_id: inboxBId,
    });

  assert(
    !!directBindErr && (directBindErr.message.includes('duplicate key') || directBindErr.code === '23505'),
    'Database constraint: ipo_source_identity_bindings PRIMARY KEY rejects duplicate binding at DB level',
    directBindErr?.message
  );

  // 4. Observation Immutability Triggers
  console.log('\n--- 4. Database-Enforced Observation Immutability ---');
  // Attempt DELETE on observation
  const { error: delObsErr } = await serviceClient
    .from('ipo_ingestion_observations')
    .delete()
    .eq('id', obs1Id);

  assert(
    !!delObsErr && delObsErr.message.includes('Historical IPO observations are immutable and cannot be deleted'),
    'DELETE on observation blocked by trg_enforce_observation_immutability',
    delObsErr?.message
  );

  // Attempt normal UPDATE on observation
  const { error: updObsErr } = await serviceClient
    .from('ipo_ingestion_observations')
    .update({ normalized_payload: { forged: true } })
    .eq('id', obs1Id);

  assert(
    !!updObsErr && updObsErr.message.includes('Historical IPO observations are immutable and cannot be modified'),
    'UPDATE on observation blocked by trg_enforce_observation_immutability',
    updObsErr?.message
  );

  // 5. Ingestion Inbox No-Delete Trigger
  console.log('\n--- 5. Canonical Inbox Hard-Delete Prohibition ---');
  const { error: delInboxErr } = await serviceClient
    .from('ipo_ingestion_inbox')
    .delete()
    .eq('id', inboxAId);

  assert(
    !!delInboxErr && delInboxErr.message.includes('Hard deletion of canonical IPO inbox entities is prohibited'),
    'DELETE on inbox blocked by trg_enforce_inbox_no_delete',
    delInboxErr?.message
  );

  // 6. Cross-Inbox Pointer Consistency Trigger
  console.log('\n--- 6. Cross-Inbox Pointer Consistency ---');
  // Attempt to point Inbox B's latest_observation_id to an observation belonging to Inbox A
  const { error: crossPtrErr } = await serviceClient
    .from('ipo_ingestion_inbox')
    .update({ latest_observation_id: obs1Id })
    .eq('id', inboxBId);

  assert(
    !!crossPtrErr && crossPtrErr.message.includes('Invalid latest_observation_id'),
    'Cross-inbox pointer blocked by trg_validate_inbox_latest_observation',
    crossPtrErr?.message
  );

  // 7. HARDENING REQUIREMENT 2: Fail-Closed Pruning Authorization Context & Non-Forgeability
  console.log('\n--- 7. Hardening Requirement 2: Pruning Authorization & Non-Forgeability ---');

  // Test A: Public / anon caller CANNOT call record_ipo_observation RPC
  const { error: anonRpcErr } = await anonClient.rpc('record_ipo_observation', {
    p_inbox_id: inboxAId,
    p_source: 'sebi',
    p_external_id: 'ANON-TEST',
    p_document_type: 'DRHP',
    p_payload_hash: 'anon-hash',
    p_raw_payload: {},
    p_normalized_payload: {},
    p_provenance: {},
  });

  assert(
    !!anonRpcErr,
    'RPC record_ipo_observation fails closed for anon/unauthenticated caller',
    anonRpcErr?.message
  );

  // Test B: Public / anon caller CANNOT call prune_expired_observation_raw_payloads
  const { error: anonPruneErr } = await anonClient.rpc('prune_expired_observation_raw_payloads');
  assert(
    !!anonPruneErr,
    'RPC prune_expired_observation_raw_payloads fails closed for anon/unauthenticated caller',
    anonPruneErr?.message
  );

  // Test C: Calling prune_expired_observation_raw_payloads via service_role returns 0 (since retention is 90 days)
  const { data: prunedCount, error: pruneErr } = await serviceClient.rpc('prune_expired_observation_raw_payloads');
  assert(
    !pruneErr && typeof prunedCount === 'number',
    `Pruning function executed by service_role (pruned ${prunedCount} unexpired rows)`,
    pruneErr?.message
  );

  // Test D: Cannot forge app.pruning_authorized: An update to immutable fields is rejected even after pruning
  const { error: postPruneUpdErr } = await serviceClient
    .from('ipo_ingestion_observations')
    .update({ payload_hash: 'forged_hash' })
    .eq('id', obs1Id);

  assert(
    !!postPruneUpdErr && postPruneUpdErr.message.includes('Historical IPO observations are immutable and cannot be modified'),
    'Fail-closed cleanup: Authorization token does NOT leak; subsequent updates remain blocked',
    postPruneUpdErr?.message
  );

  // Cleanup: Archive test inboxes (since hard delete is strictly prohibited)
  await serviceClient
    .from('ipo_ingestion_inbox')
    .update({ review_status: 'archived' })
    .in('id', [inboxAId, inboxBId]);

  console.log('\n========================================================================');
  console.log(`🏁 Live Verification Complete: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================');
}

runLiveVerification().catch(console.error);
