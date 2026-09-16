/**
 * tests/stage4-financial-boundary.test.ts
 *
 * Phase 10 / Stage 4: Financial Boundary Isolation Tests.
 *
 * Validates the Three-Way Separation:
 * - Stage 3C: market intelligence
 * - Stage 4: individual allotment evidence
 * - Phase 5: money / ledger / refunds / mandate
 *
 * Guaranteed:
 * Stage 4 records reported_refund_amount as an observed registrar fact,
 * but NEVER writes directly to financial ledger or wallet balances.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

describe('Phase 10 / Stage 4: Financial Boundary & Three-Way Domain Separation', () => {
  it('ensures Stage 4 features directory never directly updates ledger, wallets, or journal entries', () => {
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
    assert.ok(files.length > 0, 'Stage 4 source files must exist');

    const prohibitedFinancialTables = [
      'user_wallets',
      'ledger_entries',
      'journal_entries',
      'bank_transactions',
      'refund_transactions',
      'wallet_transactions',
    ];

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf-8');

      for (const table of prohibitedFinancialTables) {
        // Check if any .from('table') or table name appears in mutation context
        const hasDirectMutation = content.includes(`.from('${table}')`) || content.includes(`.from("${table}")`);
        assert.strictEqual(
          hasDirectMutation,
          false,
          `Financial boundary violation in ${path.basename(filePath)}: Direct access to ${table} is strictly prohibited in Stage 4.`
        );
      }
    }
  });

  it('ensures Stage 4 schema projection contains reported_refund_amount as an evidence fact', () => {
    const schemaContent = fs.readFileSync(
      path.resolve(process.cwd(), 'supabase/migrations/20260916000024_phase10_stage4_registrar_allotment.sql'),
      'utf-8'
    );

    // Verify ipo_application_allotment_projections has reported_refund_amount
    assert.ok(schemaContent.includes('reported_refund_amount NUMERIC(14,2)'));

    // Verify attempts table has ON DELETE RESTRICT on all references
    assert.ok(schemaContent.includes('REFERENCES public.ipo_applications(id) ON DELETE RESTRICT'));
    assert.ok(schemaContent.includes('REFERENCES public.applicant_profiles(id) ON DELETE RESTRICT'));
    assert.ok(schemaContent.includes('REFERENCES public.ipos(id) ON DELETE RESTRICT'));

    // Verify Hard Invariant constraint exists in migration
    assert.ok(schemaContent.includes('chk_record_not_found_unknown'));
    assert.ok(schemaContent.includes('chk_shares_allotted_le_applied'));
  });
});
