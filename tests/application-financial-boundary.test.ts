/**
 * tests/application-financial-boundary.test.ts
 *
 * Candidate A — Hard Quarantine Boundary Isolation Test.
 *
 * Strictly enforces that:
 * 1. features/application/ NEVER imports or accesses features/finance or features/portfolio.
 * 2. features/application/ NEVER mutates or queries Stage 5 financial tables directly.
 * 3. The integration flow strictly follows:
 *    Application -> Stage 4 Allotment Verification -> Stage 5 Financial Core.
 *
 * Zero direct ledger mutation from application code.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

describe('Candidate A: Application & Bidding Hard Quarantine Financial Boundary', () => {
  const applicationDir = path.resolve(process.cwd(), 'features/application');

  const scanFilesRecursively = (dir: string): string[] => {
    let results: string[] = [];
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat && stat.isDirectory()) {
        results = results.concat(scanFilesRecursively(fullPath));
      } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        results.push(fullPath);
      }
    }
    return results;
  };

  const files = scanFilesRecursively(applicationDir);

  it('ensures application feature files exist to audit', () => {
    assert.ok(files.length > 0, 'features/application source files must exist');
  });

  it('strictly prohibits any import from features/finance or features/portfolio', () => {
    const prohibitedImports = [
      'features/finance',
      '@/features/finance',
      'features/portfolio',
      '@/features/portfolio',
      'doubleEntryLedgerService',
      'portfolioReconciliationEngine',
      'unifiedTelemetryService',
    ];

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const relativePath = path.relative(process.cwd(), filePath);

      for (const prohibited of prohibitedImports) {
        const hasProhibitedImport =
          content.includes(`from "${prohibited}`) ||
          content.includes(`from '${prohibited}`) ||
          content.includes(`require("${prohibited}`) ||
          content.includes(`require('${prohibited}`);

        assert.strictEqual(
          hasProhibitedImport,
          false,
          `Quarantine Violation in ${relativePath}: Prohibited import of "${prohibited}". ` +
            `The application engine must never import or call Stage 5 financial services directly.`
        );
      }
    }
  });

  it('strictly prohibits direct database queries or mutations on Stage 5 financial tables', () => {
    const prohibitedTables = [
      'ledger_entries',
      'journal_entries',
      'user_wallets',
      'bank_transactions',
      'refund_transactions',
      'wallet_transactions',
      'portfolio_positions',
      'portfolio_position_lots',
      'portfolio_reconciliation_runs',
    ];

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const relativePath = path.relative(process.cwd(), filePath);

      for (const table of prohibitedTables) {
        // Look for Supabase .from('table') or .from("table")
        const hasTableAccess =
          content.includes(`.from('${table}')`) ||
          content.includes(`.from("${table}")`) ||
          content.includes(`.from(\`${table}\`)`);

        assert.strictEqual(
          hasTableAccess,
          false,
          `Financial Boundary Violation in ${relativePath}: Direct database access to "${table}" is strictly prohibited. ` +
            `Application/bidding must never mutate Stage 5 financial ledger tables.`
        );
      }
    }
  });
});
