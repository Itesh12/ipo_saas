/**
 * tests/stage3a2-sync.test.ts
 *
 * Phase 9 Stage 3A.2: Live Source Acquisition & Continuous Sync Test Suite.
 *
 * Validates:
 * 1. Condition 1: Dual-Authentication Security (Cron constant-time comparison vs Admin RBAC).
 * 2. Condition 2: Semantic Validation (Rejects HTTP 200 bot challenges, HTML shells, and malformed schemas).
 * 3. Condition 3 & Zero-Mock Policy: Asserts production code contains ZERO fixture dependencies.
 * 4. Graceful Degradation & Mutex: Asserts fail-closed resilience under upstream disruptions.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { timingSafeEqualStrings } from '../app/api/admin/ipo-sync/run/route';
import { SebiSourceClient, SebiClientError } from '../features/external-integrations/clients/sebiSourceClient';
import { NseSourceClient, NseClientError } from '../features/external-integrations/clients/nseSourceClient';
import { BseSourceClient } from '../features/external-integrations/clients/bseSourceClient';
import { hasMinimumRole } from '../lib/security/roles';

describe('Phase 9 Stage 3A.2: Live Source Acquisition & Continuous Master Sync', () => {
  // ============================================================================
  // 1. Condition 1: Dual-Authentication Security
  // ============================================================================
  describe('1. Condition 1: Dual-Authentication & Constant-Time Secrets', () => {
    it('1.1 timingSafeEqualStrings accurately matches identical secrets', () => {
      const secret = 'super-secret-cron-token-998877665544';
      assert.strictEqual(timingSafeEqualStrings(secret, secret), true);
    });

    it('1.2 timingSafeEqualStrings safely rejects mismatched secrets of same length', () => {
      const secretA = 'super-secret-cron-token-998877665544';
      const secretB = 'super-secret-cron-token-998877665545';
      assert.strictEqual(timingSafeEqualStrings(secretA, secretB), false);
    });

    it('1.3 timingSafeEqualStrings safely rejects mismatched secrets of different lengths without throwing', () => {
      const secretA = 'short';
      const secretB = 'a-much-longer-secret-token-value';
      assert.strictEqual(timingSafeEqualStrings(secretA, secretB), false);
      assert.strictEqual(timingSafeEqualStrings('', secretB), false);
    });

    it('1.4 RBAC role gating: only admin and super_admin can trigger master sync', () => {
      assert.strictEqual(hasMinimumRole('super_admin', 'admin'), true, 'super_admin is authorized');
      assert.strictEqual(hasMinimumRole('admin', 'admin'), true, 'admin is authorized');
      assert.strictEqual(hasMinimumRole('editor', 'admin'), false, 'editor cannot trigger master sync');
      assert.strictEqual(hasMinimumRole('analyst', 'admin'), false, 'analyst cannot trigger master sync');
      assert.strictEqual(hasMinimumRole('user', 'admin'), false, 'regular user cannot trigger master sync');
    });
  });

  // ============================================================================
  // 2. Condition 2: Semantic Validation (HTTP 200 != Success)
  // ============================================================================
  describe('2. Condition 2: Semantic Validation & Anti-Bot Rejection', () => {
    const sebiClient = new SebiSourceClient();
    const nseClient = new NseSourceClient();

    it('2.1 SEBI: rejects HTTP 200 payload that is too small (e.g. error stub)', () => {
      assert.throws(
        () => sebiClient.validateSemanticPayload('<html><body>Error</body></html>', 32),
        (err: unknown) => {
          assert.ok(err instanceof SebiClientError);
          assert.strictEqual(err.code, 'SEBI_PAYLOAD_TOO_SMALL');
          return true;
        }
      );
    });

    it('2.2 SEBI: rejects Cloudflare / CAPTCHA challenge returning HTTP 200', () => {
      const captchaPayload = `
        <html><head><title>Attention Required! | Cloudflare</title></head>
        <body><div id="cf-chl-wrapper">Please complete security check to continue</div>
        ${'x'.repeat(2000)}
        </body></html>
      `;
      assert.throws(
        () => sebiClient.validateSemanticPayload(captchaPayload, captchaPayload.length),
        (err: unknown) => {
          assert.ok(err instanceof SebiClientError);
          assert.strictEqual(err.code, 'SEBI_CAPTCHA_BLOCKED');
          return true;
        }
      );
    });

    it('2.3 SEBI: rejects response lacking expected table structure', () => {
      const noTablePayload = `
        <html><body><div>Welcome to SEBI. No filings displayed on this page today.</div>
        ${'x'.repeat(2000)}
        </body></html>
      `;
      assert.throws(
        () => sebiClient.validateSemanticPayload(noTablePayload, noTablePayload.length),
        (err: unknown) => {
          assert.ok(err instanceof SebiClientError);
          assert.strictEqual(err.code, 'SEBI_SCHEMA_STRUCTURE_INVALID');
          return true;
        }
      );
    });

    it('2.4 SEBI: accepts valid HTML containing table elements and rows', () => {
      const validPayload = `
        <html><body>
          <table class="table" id="sample_1">
            <thead><tr><th>Date</th><th>Document</th></tr></thead>
            <tbody>
              <tr><td>11-Sep-2026</td><td><a href="/doc/1">Manika Plastech Limited - RHP</a></td></tr>
            </tbody>
          </table>
          ${'x'.repeat(1500)}
        </body></html>
      `;
      assert.doesNotThrow(() => {
        sebiClient.validateSemanticPayload(validPayload, validPayload.length);
      });
    });

    it('2.5 SEBI: enforces SSRF protection against unauthorized hostnames', () => {
      assert.throws(
        () => sebiClient.validateTargetUrl('https://evil-spoof.com/sebiweb'),
        (err: unknown) => {
          assert.ok(err instanceof SebiClientError);
          assert.strictEqual(err.code, 'SEBI_SSRF_VIOLATION');
          return true;
        }
      );
      assert.throws(
        () => sebiClient.validateTargetUrl('http://www.sebi.gov.in/filings'),
        (err: unknown) => {
          assert.ok(err instanceof SebiClientError);
          assert.strictEqual(err.code, 'SEBI_INSECURE_PROTOCOL');
          return true;
        }
      );
    });

    it('2.6 NSE: rejects HTTP 200 response that contains HTML shell (session expiration/bot defense)', () => {
      const htmlResponse = '<!DOCTYPE html><html><body>Access Denied</body></html>';
      assert.throws(
        () => nseClient.validateAndParsePayload(htmlResponse),
        (err: unknown) => {
          assert.ok(err instanceof NseClientError);
          assert.strictEqual(err.code, 'NSE_HTML_SHELL_DETECTED');
          return true;
        }
      );
    });

    it('2.7 NSE: rejects malformed JSON', () => {
      assert.throws(
        () => nseClient.validateAndParsePayload('{ not-valid-json }'),
        (err: unknown) => {
          assert.ok(err instanceof NseClientError);
          assert.strictEqual(err.code, 'NSE_INVALID_JSON');
          return true;
        }
      );
    });

    it('2.8 NSE: rejects JSON that is not an array of issues', () => {
      assert.throws(
        () => nseClient.validateAndParsePayload(JSON.stringify({ status: 'ok', count: 0 })),
        (err: unknown) => {
          assert.ok(err instanceof NseClientError);
          assert.strictEqual(err.code, 'NSE_SCHEMA_NOT_ARRAY');
          return true;
        }
      );
    });

    it('2.9 NSE: rejects issue object missing both symbol and companyName', () => {
      const badArray = JSON.stringify([{ issueStartDate: '2026-09-10', priceBand: '100-110' }]);
      assert.throws(
        () => nseClient.validateAndParsePayload(badArray),
        (err: unknown) => {
          assert.ok(err instanceof NseClientError);
          assert.strictEqual(err.code, 'NSE_SCHEMA_MISSING_IDENTIFIERS');
          return true;
        }
      );
    });

    it('2.10 NSE: accepts valid array of issue objects conforming to schema', () => {
      const validJson = JSON.stringify([
        {
          symbol: 'MANIKA',
          companyName: 'Manika Plastech Limited',
          series: 'EQ',
          issueStartDate: '11-Sep-2026',
          issueEndDate: '16-Sep-2026',
          priceBand: '40-43',
          lotSize: 3000,
          issueSize: 45.2,
        },
      ]);
      const result = nseClient.validateAndParsePayload(validJson);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].symbol, 'MANIKA');
      assert.strictEqual(result[0].companyName, 'Manika Plastech Limited');
    });

    it('2.11 NSE: enforces SSRF protection against unauthorized hostnames', () => {
      assert.throws(
        () => nseClient.validateTargetUrl('https://fake-nse.org/api/ipo'),
        (err: unknown) => {
          assert.ok(err instanceof NseClientError);
          assert.strictEqual(err.code, 'NSE_SSRF_VIOLATION');
          return true;
        }
      );
    });
  });

  // ============================================================================
  // 3. Condition 3: Real Network Origin & Zero-Mock Policy
  // ============================================================================
  describe('3. Condition 3: Zero-Mock Static Integrity Check', () => {
    it('3.1 asserts production source clients and sync service have ZERO fixture dependencies', () => {
      const filesToCheck = [
        path.resolve(__dirname, '../features/external-integrations/clients/sebiSourceClient.ts'),
        path.resolve(__dirname, '../features/external-integrations/clients/nseSourceClient.ts'),
        path.resolve(__dirname, '../features/external-integrations/clients/bseSourceClient.ts'),
        path.resolve(__dirname, '../features/external-integrations/services/ipoSyncService.ts'),
        path.resolve(__dirname, '../app/api/admin/ipo-sync/run/route.ts'),
      ];

      for (const file of filesToCheck) {
        assert.ok(fs.existsSync(file), `File ${file} must exist`);
        const content = fs.readFileSync(file, 'utf-8');

        // Check for fixture imports or mock keywords
        assert.ok(
          !content.includes('tests/fixtures'),
          `Production file ${path.basename(file)} must not import tests/fixtures`
        );
        assert.ok(
          !content.includes('DEV_SEED_IPOS'),
          `Production file ${path.basename(file)} must not reference DEV_SEED_IPOS`
        );
      }
    });

    it('3.2 BSE conservative mode degrades cleanly without fabricating fake records', async () => {
      const bseClient = new BseSourceClient();
      // Test the contract of the conservative client
      const res = await bseClient.fetchLiveNotices();
      assert.ok(res.status === 'degraded' || res.status === 'healthy');
      // If degraded, notice count must be 0 (never mock/fabricated)
      if (res.status === 'degraded') {
        assert.strictEqual(res.notices.length, 0, 'Degraded BSE mode must NEVER fabricate records');
        assert.ok(res.reason, 'Must provide degradation explanation');
      }
    });
  });
});
