/**
 * tests/stage4-domain-invariants.test.ts
 *
 * Phase 10 / Stage 4: Registrar Allotment Verification Gateway Invariant Tests.
 *
 * Validates core domain invariants mandated by Revision 3:
 * 1. Hard invariant: shares_allotted <= shares_applied
 * 2. Hard invariant: record_not_found MUST NEVER map to not_allotted (must be unknown / UNVERIFIED)
 * 3. Classification semantics: full allotment vs partial allotment vs non-allotment
 * 4. Zero Raw PII: masking logic and SHA-256 hash enforcement
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { BaseRegistrarAdapter } from '../features/allotment-verification/adapters/baseRegistrarAdapter';
import {
  normalizedAllotmentResultSchema,
  verificationAttemptRecordSchema,
} from '../features/allotment-verification/schemas/allotmentVerificationSchemas';

describe('Phase 10 / Stage 4: Domain Invariants & Zero-PII Enforcements', () => {
  // 1. PII Masking & Hashing Tests
  it('masks PAN preserving format and hiding identity (first 3, last 3)', () => {
    const masked = BaseRegistrarAdapter.maskPAN('ABCDE1234F');
    assert.strictEqual(masked, 'ABC****34F');
  });

  it('masks short or irregular PAN safely without crashing', () => {
    const maskedShort = BaseRegistrarAdapter.maskPAN('ABC1');
    assert.strictEqual(maskedShort, '****');
  });

  it('masks Application Numbers and DP Client IDs cleanly', () => {
    const maskedApp = BaseRegistrarAdapter.maskIdentifier('12345678', 'application_no');
    assert.ok(maskedApp.includes('****'));
    assert.strictEqual(maskedApp.startsWith('12'), true);

    const maskedDP = BaseRegistrarAdapter.maskIdentifier('IN30012612345678', 'dp_client_id');
    assert.ok(maskedDP.includes('****'));
  });

  it('generates deterministic SHA-256 hashes for raw responses', () => {
    const payload = JSON.stringify({ status: 'ALLOTTED', count: 15 });
    const hash1 = BaseRegistrarAdapter.sha256(payload);
    const hash2 = BaseRegistrarAdapter.sha256(payload);
    assert.strictEqual(hash1, hash2);
    assert.strictEqual(hash1.length, 64);
  });

  // 2. Quantity & Allotment Invariant Tests
  it('rejects normalized result when sharesAllotted exceeds sharesApplied', () => {
    const invalidResult = {
      resultType: 'allotted',
      sharesApplied: 100,
      sharesAllotted: 150, // Exceeds applied!
      reportedRefundAmount: 0,
    };

    const parsed = normalizedAllotmentResultSchema.safeParse(invalidResult);
    assert.strictEqual(parsed.success, false);
    assert.ok(
      parsed.error?.issues.some((i) => i.message.includes('cannot exceed sharesApplied'))
    );
  });

  it('validates full allotment when sharesAllotted === sharesApplied', () => {
    const validResult = {
      resultType: 'allotted',
      sharesApplied: 150,
      sharesAllotted: 150,
      reportedRefundAmount: 0,
    };

    const parsed = normalizedAllotmentResultSchema.safeParse(validResult);
    assert.strictEqual(parsed.success, true);
  });

  it('rejects resultType = allotted when sharesAllotted is 0 or partial', () => {
    const mismatched = {
      resultType: 'allotted',
      sharesApplied: 150,
      sharesAllotted: 0,
      reportedRefundAmount: 15000,
    };

    const parsed = normalizedAllotmentResultSchema.safeParse(mismatched);
    assert.strictEqual(parsed.success, false);
  });

  it('validates partial allotment when 0 < sharesAllotted < sharesApplied', () => {
    const partial = {
      resultType: 'partially_allotted',
      sharesApplied: 150,
      sharesAllotted: 75,
      reportedRefundAmount: 7500,
    };

    const parsed = normalizedAllotmentResultSchema.safeParse(partial);
    assert.strictEqual(parsed.success, true);
  });

  it('validates non-allotment when sharesAllotted is strictly 0', () => {
    const notAllotted = {
      resultType: 'not_allotted',
      sharesApplied: 150,
      sharesAllotted: 0,
      reportedRefundAmount: 15000,
    };

    const parsed = normalizedAllotmentResultSchema.safeParse(notAllotted);
    assert.strictEqual(parsed.success, true);
  });

  // 3. Hard Invariant: record_not_found must NEVER produce not_allotted
  it('strictly rejects attempt record where attemptStatus is record_not_found and verificationResult is not_allotted', () => {
    const invalidAttempt = {
      applicationId: 'a0000000-0000-0000-0000-000000000001',
      applicantId: 'b0000000-0000-0000-0000-000000000001',
      ipoId: 'c0000000-0000-0000-0000-000000000001',
      registrarCode: 'link_intime',
      verificationMode: 'automated_api',
      attemptStatus: 'record_not_found',
      verificationResult: 'not_allotted', // VIOLATION: Should be unknown!
      lookupType: 'pan',
      lookupIdentifierMasked: 'ABC****34F',
      lookupIdentifierHash: BaseRegistrarAdapter.sha256('ABCDE1234F'),
      rawResponseHash: BaseRegistrarAdapter.sha256('NO_RECORD_FOUND'),
      rawResponseRetention: 'none',
      evidenceSourceType: 'REGISTRAR_DIRECT',
      evidenceClassification: 'UNVERIFIED',
      idempotencyKey: 'idemp-12345678',
    };

    const parsed = verificationAttemptRecordSchema.safeParse(invalidAttempt);
    assert.strictEqual(parsed.success, false);
    assert.ok(
      parsed.error?.issues.some((i) =>
        i.message.includes('verificationResult must be unknown')
      )
    );
  });

  it('strictly accepts record_not_found when verificationResult is unknown and evidenceClassification is UNVERIFIED', () => {
    const validRecordNotFound = {
      applicationId: '11111111-1111-4111-a111-111111111111',
      applicantId: '22222222-2222-4222-a222-222222222222',
      ipoId: '33333333-3333-4333-a333-333333333333',
      registrarCode: 'link_intime',
      verificationMode: 'automated_api',
      attemptStatus: 'record_not_found',
      verificationResult: 'unknown',
      lookupType: 'pan',
      lookupIdentifierMasked: 'ABC****34F',
      lookupIdentifierHash: BaseRegistrarAdapter.sha256('ABCDE1234F'),
      rawResponseHash: BaseRegistrarAdapter.sha256('NO_RECORD_FOUND'),
      rawResponseRetention: 'none',
      evidenceSourceType: 'REGISTRAR_DIRECT',
      evidenceClassification: 'UNVERIFIED',
      idempotencyKey: 'idemp-12345678',
    };

    const parsed = verificationAttemptRecordSchema.safeParse(validRecordNotFound);
    assert.strictEqual(parsed.success, true);
  });
});
