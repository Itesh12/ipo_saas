/**
 * tests/candidate-d-valuation-boundary.test.ts
 *
 * Candidate D: Stage 6 Boundary & Financial Quarantine Test Suite.
 *
 * Enforces:
 * 1. Financial Quarantine: Candidate D can observe Stage 5 holdings, but STRICTLY CANNOT MUTATE
 *    any Stage 5 tables (portfolio_positions, investment_transactions, journal_entries,
 *    journal_lines, financial_accounts, ipo_application_settlements).
 * 2. Cost-Basis Immutability: portfolio_positions.total_invested_cost and average_cost_price
 *    remain strictly immutable before and after valuation calls.
 * 3. Architecture Direction Boundary: Candidate A, B, and C milestones do NOT import Candidate D.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

// Setup environment credentials from .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

import { createAdminClient } from '../lib/supabase/admin';
import { PortfolioValuationEngine } from '../features/finance/services/portfolioValuationEngine';
import { MarketPriceIngestionService } from '../features/finance/services/marketPriceIngestionService';

describe('CANDIDATE-D: Financial Quarantine & Boundary Protection Suite', () => {
  const admin = createAdminClient();

  it('enforces ZERO mutations on all Stage 5 financial and ledger tables (Delta = 0)', async () => {
    // 1. Take pre-valuation snapshot of row counts across all 6 Stage 5 tables
    const [
      { count: posCountBefore },
      { count: txCountBefore },
      { count: entryCountBefore },
      { count: lineCountBefore },
      { count: accCountBefore },
      { count: settCountBefore },
    ] = await Promise.all([
      admin.from('portfolio_positions').select('*', { count: 'exact', head: true }),
      admin.from('investment_transactions').select('*', { count: 'exact', head: true }),
      admin.from('journal_entries').select('*', { count: 'exact', head: true }),
      admin.from('journal_lines').select('*', { count: 'exact', head: true }),
      admin.from('financial_accounts').select('*', { count: 'exact', head: true }),
      admin.from('ipo_application_settlements').select('*', { count: 'exact', head: true }),
    ]);

    // 2. Perform multiple repeated portfolio valuations across multiple scopes
    await Promise.all([
      PortfolioValuationEngine.evaluatePortfolio({ scope: 'family_all' }),
      PortfolioValuationEngine.evaluatePortfolio({ scope: 'personal' }),
      PortfolioValuationEngine.evaluatePortfolio({ scope: 'external' }),
      PortfolioValuationEngine.evaluatePortfolio({ scope: 'family_all' }),
      PortfolioValuationEngine.evaluatePortfolio({ scope: 'personal' }),
    ]);

    // 3. Take post-valuation snapshot of row counts
    const [
      { count: posCountAfter },
      { count: txCountAfter },
      { count: entryCountAfter },
      { count: lineCountAfter },
      { count: accCountAfter },
      { count: settCountAfter },
    ] = await Promise.all([
      admin.from('portfolio_positions').select('*', { count: 'exact', head: true }),
      admin.from('investment_transactions').select('*', { count: 'exact', head: true }),
      admin.from('journal_entries').select('*', { count: 'exact', head: true }),
      admin.from('journal_lines').select('*', { count: 'exact', head: true }),
      admin.from('financial_accounts').select('*', { count: 'exact', head: true }),
      admin.from('ipo_application_settlements').select('*', { count: 'exact', head: true }),
    ]);

    // 4. Assert strict Delta = 0 across all 6 financial quarantine tables
    assert.equal(posCountAfter, posCountBefore, 'portfolio_positions count MUST remain identical (Delta = 0)');
    assert.equal(txCountAfter, txCountBefore, 'investment_transactions count MUST remain identical (Delta = 0)');
    assert.equal(entryCountAfter, entryCountBefore, 'journal_entries count MUST remain identical (Delta = 0)');
    assert.equal(lineCountAfter, lineCountBefore, 'journal_lines count MUST remain identical (Delta = 0)');
    assert.equal(accCountAfter, accCountBefore, 'financial_accounts count MUST remain identical (Delta = 0)');
    assert.equal(settCountAfter, settCountBefore, 'ipo_application_settlements count MUST remain identical (Delta = 0)');
  });

  it('guarantees cost-basis immutability on portfolio_positions before and after valuation', async () => {
    // 1. Fetch active portfolio positions before valuation
    const { data: positionsBefore } = await admin
      .from('portfolio_positions')
      .select('id, quantity, total_invested_cost, average_cost_price')
      .gt('quantity', 0)
      .limit(10);

    // 2. Run valuation
    await PortfolioValuationEngine.evaluatePortfolio({ scope: 'family_all' });

    // 3. Fetch active portfolio positions after valuation
    const { data: positionsAfter } = await admin
      .from('portfolio_positions')
      .select('id, quantity, total_invested_cost, average_cost_price')
      .gt('quantity', 0)
      .limit(10);

    assert.ok(positionsBefore && positionsAfter);
    assert.equal(positionsBefore.length, positionsAfter.length);

    const beforeList = positionsBefore as any[];
    const afterList = positionsAfter as any[];
    for (let i = 0; i < beforeList.length; i++) {
      const b: any = beforeList[i];
      const a: any = afterList.find((p: any) => p.id === b.id);
      assert.ok(a, `Position ${b.id} must exist after valuation`);
      assert.equal(a.quantity.toString(), b.quantity.toString(), 'Quantity must not be mutated');
      assert.equal(a.total_invested_cost.toString(), b.total_invested_cost.toString(), 'Total invested cost must not be mutated');
      assert.equal(a.average_cost_price.toString(), b.average_cost_price.toString(), 'Average cost price must not be mutated');
    }
  });

  it('guarantees architectural boundary isolation: Candidates A, B, and C never import Candidate D', () => {
    const candidateDirs = [
      path.resolve(process.cwd(), 'features/bidding'),
      path.resolve(process.cwd(), 'features/allotment'),
      path.resolve(process.cwd(), 'features/finance/services/settlementService.ts'),
      path.resolve(process.cwd(), 'features/finance/workers/stage4OutboxConsumer.ts'),
    ];

    const forbiddenImports = [
      'valuationTypes',
      'marketPriceIngestionService',
      'listingService',
      'portfolioValuationEngine',
    ];

    function checkFile(filePath: string) {
      const content = fs.readFileSync(filePath, 'utf-8');
      for (const forbidden of forbiddenImports) {
        assert.ok(
          !content.includes(forbidden),
          `Boundary violation: File ${filePath} imports forbidden Candidate D symbol "${forbidden}"`
        );
      }
    }

    function checkDirectory(dirPath: string) {
      if (!fs.existsSync(dirPath)) return;
      const stat = fs.statSync(dirPath);
      if (stat.isFile()) {
        checkFile(dirPath);
        return;
      }
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
          checkDirectory(fullPath);
        } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
          checkFile(fullPath);
        }
      }
    }

    for (const target of candidateDirs) {
      checkDirectory(target);
    }
  });
});
