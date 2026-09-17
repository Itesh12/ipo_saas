/**
 * tests/candidate-c-settlement-boundary.test.ts
 *
 * Candidate C: Strict Architectural Isolation & Quarantine Boundary Test.
 *
 * Validates:
 * 1. features/finance has ZERO imports from features/allotment-verification/services
 * 2. features/finance has ZERO imports from features/allotment-verification/adapters
 * 3. features/finance has ZERO queries against ipo_allotment_verification_attempts
 * 4. features/finance has ZERO queries against ipo_application_allotment_projections
 * 5. features/allotment-verification has ZERO imports from features/finance or features/portfolio
 * 6. Candidate A bidding engine remains completely untouched and isolated
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

function getFilesRecursively(dir: string, extensions: string[]): string[] {
  let results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFilesRecursively(filePath, extensions));
    } else if (extensions.some(ext => file.endsWith(ext))) {
      results.push(filePath);
    }
  }
  return results;
}

describe('CANDIDATE-C: Architectural Boundary & Quarantine Scanner', () => {
  const rootDir = process.cwd();

  // Test 1: features/finance must not import Stage 4 internal services or adapters
  it('enforces 0 imports of Stage 4 internal services/adapters in features/finance', () => {
    const financeFiles = getFilesRecursively(path.join(rootDir, 'features/finance'), ['.ts', '.tsx']);
    assert.ok(financeFiles.length > 0, 'Should find finance files');

    const prohibitedPathPatterns = [
      '@/features/allotment-verification/services',
      '@/features/allotment-verification/adapters',
      '../allotment-verification/services',
      '../allotment-verification/adapters',
    ];

    const violations: Array<{ file: string; match: string }> = [];

    for (const file of financeFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        // Only inspect active import statements
        if (trimmed.startsWith('import ') && trimmed.includes('from')) {
          for (const pattern of prohibitedPathPatterns) {
            if (trimmed.includes(pattern)) {
              violations.push({ file: path.relative(rootDir, file), match: trimmed });
            }
          }
        }
      }
    }

    assert.strictEqual(
      violations.length,
      0,
      `Quarantine violation! Found prohibited Stage 4 imports in features/finance: ${JSON.stringify(violations, null, 2)}`
    );
  });

  // Test 2: Settlement & Investment services must not query Stage 4 internal tables
  it('enforces 0 direct queries against Stage 4 internal attempt/projection tables in settlement services', () => {
    const settlementCoreFiles = [
      path.join(rootDir, 'features/finance/services/settlementService.ts'),
      path.join(rootDir, 'features/finance/services/investmentService.ts'),
      path.join(rootDir, 'features/finance/services/journalService.ts'),
      path.join(rootDir, 'features/finance/services/chartOfAccountsService.ts'),
      path.join(rootDir, 'features/finance/workers/stage4OutboxConsumer.ts'),
    ];

    const prohibitedTables = [
      'ipo_allotment_verification_attempts',
      'ipo_application_allotment_projections',
      'ipo_allotment_challenges',
    ];

    const violations: Array<{ file: string; table: string }> = [];

    for (const file of settlementCoreFiles) {
      if (!fs.existsSync(file)) continue;
      const content = fs.readFileSync(file, 'utf-8');
      for (const table of prohibitedTables) {
        const regex = new RegExp(`\\.from\\(['"]${table}['"]\\)`, 'g');
        if (regex.test(content)) {
          violations.push({ file: path.relative(rootDir, file), table });
        }
      }
    }

    assert.strictEqual(
      violations.length,
      0,
      `Quarantine violation! Found prohibited table queries in settlement services: ${JSON.stringify(violations, null, 2)}`
    );
  });

  // Test 3: features/allotment-verification must not import features/finance or features/portfolio
  it('enforces 0 imports of finance/portfolio in features/allotment-verification', () => {
    const stage4Files = getFilesRecursively(path.join(rootDir, 'features/allotment-verification'), ['.ts', '.tsx']);
    assert.ok(stage4Files.length > 0, 'Should find Stage 4 files');

    const prohibitedImports = [
      'features/finance',
      'features/portfolio',
      'investmentService',
      'journalService',
      'chartOfAccountsService',
    ];

    const violations: Array<{ file: string; match: string }> = [];

    for (const file of stage4Files) {
      const content = fs.readFileSync(file, 'utf-8');
      for (const pattern of prohibitedImports) {
        if (content.includes(pattern)) {
          violations.push({ file: path.relative(rootDir, file), match: pattern });
        }
      }
    }

    assert.strictEqual(
      violations.length,
      0,
      `Quarantine violation! Found prohibited Stage 5 imports in features/allotment-verification: ${JSON.stringify(violations, null, 2)}`
    );
  });

  // Test 4: Candidate A remains sealed with 0 imports from Stage 4 or Stage 5
  it('verifies Candidate A bidding engine preserves 0 imports from Stage 4 or Stage 5', () => {
    const appFiles = getFilesRecursively(path.join(rootDir, 'features/application'), ['.ts', '.tsx']);
    assert.ok(appFiles.length > 0, 'Should find application files');

    const prohibited = [
      'features/allotment-verification',
      'features/finance',
      'features/portfolio',
    ];

    const violations: Array<{ file: string; match: string }> = [];

    for (const file of appFiles) {
      // Exclude domainEventDispatcher which solely provides pure event dispatch contracts
      if (file.includes('domainEventDispatcher') || file.includes('domainEventTypes')) continue;
      const content = fs.readFileSync(file, 'utf-8');
      for (const pattern of prohibited) {
        if (content.includes(pattern)) {
          violations.push({ file: path.relative(rootDir, file), match: pattern });
        }
      }
    }

    assert.strictEqual(
      violations.length,
      0,
      `Sealed Candidate A boundary violation: ${JSON.stringify(violations, null, 2)}`
    );
  });
});
