/**
 * tests/stage4-issue-bindings-and-adapters.test.ts
 *
 * Phase 10 / Stage 4: Deterministic Issue Bindings, Dynamic Capabilities, and Adapters.
 *
 * Validates:
 * 1. Deterministic Issue Binding Resolution
 * 2. Dynamic Registrar Capabilities & Fail-Closed Logic
 * 3. Registrar Adapter Factory
 * 4. Link Intime, KFintech, and Bigshare Adapter Behaviors
 * 5. Challenge and User-Assisted verification handling
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { IssueBindingResolver } from '../features/allotment-verification/services/issueBindingResolver';
import { RegistrarAdapterFactory } from '../features/allotment-verification/adapters/registrarAdapterFactory';
import { LinkIntimeAdapter } from '../features/allotment-verification/adapters/linkIntimeAdapter';
import { KFintechAdapter } from '../features/allotment-verification/adapters/kfintechAdapter';
import { BigshareAdapter } from '../features/allotment-verification/adapters/bigshareAdapter';

describe('Phase 10 / Stage 4: Issue Bindings and Registrar Adapters', () => {
  // 1. Issue Binding Normalization Tests
  it('normalizes common registrar names to canonical registrar codes', () => {
    assert.strictEqual(
      IssueBindingResolver.normalizeRegistrarCode('Link Intime India Private Limited'),
      'link_intime'
    );
    assert.strictEqual(
      IssueBindingResolver.normalizeRegistrarCode('Linkintime'),
      'link_intime'
    );
    assert.strictEqual(
      IssueBindingResolver.normalizeRegistrarCode('KFin Technologies Limited'),
      'kfintech'
    );
    assert.strictEqual(
      IssueBindingResolver.normalizeRegistrarCode('Karvy Computershare'),
      'kfintech'
    );
    assert.strictEqual(
      IssueBindingResolver.normalizeRegistrarCode('Bigshare Services Pvt. Ltd.'),
      'bigshare'
    );
    assert.strictEqual(
      IssueBindingResolver.normalizeRegistrarCode('Cameo Corporate Services Limited'),
      'cameo'
    );
    assert.strictEqual(
      IssueBindingResolver.normalizeRegistrarCode('MAS Services Limited'),
      'mas'
    );
    assert.strictEqual(IssueBindingResolver.normalizeRegistrarCode('Unknown Entity XYZ'), null);
    assert.strictEqual(IssueBindingResolver.normalizeRegistrarCode(null), null);
  });

  // 2. Adapter Factory Tests
  it('resolves concrete adapters via RegistrarAdapterFactory', () => {
    const linkAdapter = RegistrarAdapterFactory.getAdapter('link_intime');
    assert.ok(linkAdapter instanceof LinkIntimeAdapter);
    assert.strictEqual(linkAdapter?.registrarCode, 'link_intime');

    const kfinAdapter = RegistrarAdapterFactory.getAdapter('kfintech');
    assert.ok(kfinAdapter instanceof KFintechAdapter);
    assert.strictEqual(kfinAdapter?.registrarCode, 'kfintech');

    const bigshareAdapter = RegistrarAdapterFactory.getAdapter('bigshare');
    assert.ok(bigshareAdapter instanceof BigshareAdapter);
    assert.strictEqual(bigshareAdapter?.registrarCode, 'bigshare');

    const invalid = RegistrarAdapterFactory.getAdapter('unknown_reg');
    assert.strictEqual(invalid, null);
  });

  // 3. Adapter Challenge Flow Tests (Mode 2 User-Assisted)
  it('LinkIntimeAdapter safely demands challenge when interactive CAPTCHA is required', async () => {
    const adapter = new LinkIntimeAdapter();
    const res = await adapter.queryAllotment({
      ipoId: 'test-ipo-1',
      registrarIssueId: '1042',
      lookupType: 'pan',
      lookupValue: 'ABCDE1234F',
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, 'challenge_required');
    assert.strictEqual(res.challengeRequired, true);
    assert.ok(res.challengePayload?.portalUrl?.includes('linkintime.co.in'));
    assert.strictEqual(res.rawResponseHash.length, 64);
  });

  it('KFintechAdapter safely demands challenge when interactive CAPTCHA is required', async () => {
    const adapter = new KFintechAdapter();
    const res = await adapter.queryAllotment({
      ipoId: 'test-ipo-2',
      registrarIssueId: 'KFIN_TATA',
      lookupType: 'pan',
      lookupValue: 'ABCDE1234F',
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, 'challenge_required');
    assert.strictEqual(res.challengeRequired, true);
    assert.ok(res.challengePayload?.portalUrl?.includes('kosmic.kfintech.com'));
  });

  it('BigshareAdapter safely demands challenge when interactive CAPTCHA is required', async () => {
    const adapter = new BigshareAdapter();
    const res = await adapter.queryAllotment({
      ipoId: 'test-ipo-3',
      registrarIssueId: 'BIG_XYZ',
      lookupType: 'pan',
      lookupValue: 'ABCDE1234F',
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, 'challenge_required');
    assert.strictEqual(res.challengeRequired, true);
    assert.ok(res.challengePayload?.portalUrl?.includes('bigshareonline.com'));
  });

  // 4. User-Assisted Normalization Tests
  it('LinkIntimeAdapter normalizes user-assisted submissions with full SHA-256 integrity', () => {
    const adapter = new LinkIntimeAdapter();
    const res = adapter.normalizeAssistedSubmission({
      sharesApplied: 100,
      sharesAllotted: 100,
      allotmentPrice: 450,
      reportedRefundAmount: 0,
      registrarReference: 'LI-9921',
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.status, 'completed');
    assert.strictEqual(res.normalizedResult?.resultType, 'allotted');
    assert.strictEqual(res.normalizedResult?.sharesAllotted, 100);
    assert.strictEqual(res.rawResponseHash.length, 64);
  });

  it('KFintechAdapter normalizes non-allotted outcomes with zero allotted shares and accurate refund', () => {
    const adapter = new KFintechAdapter();
    const res = adapter.normalizeAssistedSubmission({
      sharesApplied: 100,
      sharesAllotted: 0,
      allotmentPrice: 450,
      reportedRefundAmount: 45000,
      registrarReference: 'KF-4412',
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.status, 'completed');
    assert.strictEqual(res.normalizedResult?.resultType, 'not_allotted');
    assert.strictEqual(res.normalizedResult?.sharesAllotted, 0);
    assert.strictEqual(res.normalizedResult?.reportedRefundAmount, 45000);
  });
});
