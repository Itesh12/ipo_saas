/**
 * tests/candidate-b-allotment-boundary.test.ts
 *
 * Candidate B (Revision 3): Strict Financial Boundary & Outbox Quarantine Tests.
 *
 * Enforces:
 * 1. Stage 4 code in `features/allotment-verification` NEVER imports or references `@/features/finance` or `@/features/portfolio`.
 * 2. Stage 4 code NEVER queries or mutates `ledger_entries`, `journal_entries`, `user_wallets`, or `portfolio_positions`.
 * 3. Migration and schema constraints enforce:
 *    - chk_dual_review_distinct_reviewers
 *    - chk_dispatched_consistency
 *    - ipo_stage4_outbox_events persistence
 *    - Terminal status is ACKNOWLEDGED (zero DISPATCHED enum references)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

describe('Candidate B: Stage 4 Financial Boundary & Schema Quarantine', () => {
  it('ensures features/allotment-verification contains ZERO imports from finance or portfolio', () => {
    const stage4Dir = path.resolve(process.cwd(), 'features/allotment-verification');

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

    const files = scanFilesRecursively(stage4Dir);
    assert.ok(files.length > 5, 'Stage 4 source files must exist');

    const prohibitedImports = [
      '@/features/finance',
      'features/finance',
      '@/features/portfolio',
      'features/portfolio',
    ];

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

        for (const imp of prohibitedImports) {
          assert.strictEqual(
            line.includes(imp),
            false,
            `AST Boundary Violation: ${path.basename(filePath)} line ${i + 1} imports ${imp}. Stage 4 must remain strictly quarantined from Stage 5.`
          );
        }
      }
    }
  });

  it('ensures features/allotment-verification contains ZERO direct queries or mutations of Stage 5 tables', () => {
    const stage4Dir = path.resolve(process.cwd(), 'features/allotment-verification');

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

    const files = scanFilesRecursively(stage4Dir);

    const prohibitedFinancialTables = [
      'user_wallets',
      'ledger_entries',
      'journal_entries',
      'portfolio_positions',
      'securities_master',
      'bank_transactions',
    ];

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf-8');

      for (const table of prohibitedFinancialTables) {
        const hasDirectQuery = content.includes(`.from('${table}')`) || content.includes(`.from("${table}")`);
        assert.strictEqual(
          hasDirectQuery,
          false,
          `Direct Table Violation in ${path.basename(filePath)}: Direct access to Stage 5 table '${table}' is strictly prohibited in Stage 4.`
        );
      }
    }
  });

  it('verifies Candidate B migrations enforce dual-control constraint and outbox persistence', () => {
    const migrationDir = path.resolve(process.cwd(), 'supabase/migrations');
    const enumMigration = fs.readFileSync(path.join(migrationDir, '20260919000030_candidate_b_enum_types.sql'), 'utf-8');
    const engineMigration = fs.readFileSync(path.join(migrationDir, '20260919000031_candidate_b_allotment_engine.sql'), 'utf-8');

    // 1. Dual-control distinct reviewers constraint
    assert.ok(
      engineMigration.includes('chk_dual_review_distinct_reviewers CHECK'),
      'Migration must enforce chk_dual_review_distinct_reviewers'
    );
    assert.ok(
      engineMigration.includes('primary_reviewer_id != secondary_reviewer_id'),
      'Migration constraint must enforce primary != secondary reviewer'
    );

    // 2. Dispatch consistency check
    assert.ok(
      engineMigration.includes('chk_dispatched_consistency CHECK'),
      'Migration must enforce chk_dispatched_consistency'
    );

    // 3. Durable Outbox table
    assert.ok(
      engineMigration.includes('CREATE TABLE IF NOT EXISTS public.ipo_stage4_outbox_events'),
      'Migration must create ipo_stage4_outbox_events table'
    );

    // 4. Standardized financial dispatch enum (Purged DISPATCHED)
    assert.ok(
      enumMigration.includes("'ACKNOWLEDGED'"),
      'Enum must include ACKNOWLEDGED'
    );
    assert.ok(
      !enumMigration.includes("'DISPATCHED'"),
      'Enum must NOT include obsolete DISPATCHED state'
    );
  });
});
