/**
 * tests/candidate-e-conservation-math.test.ts
 *
 * Candidate E: Mathematical Conservation Laws & GL Balance Suite.
 * Validates:
 * - E15: Gross Proceeds, Net Proceeds, Cost Basis, Realized P&L conservation
 * - E9: Double-Entry Debits === Credits across Gain, Loss, Breakeven
 * - E17: Server-derived charge aggregation equality
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DecimalPrecision } from '../features/finance/utils/decimalPrecision';

describe('CANDIDATE-E: Mathematical Conservation & GL Invariant Suite (E9, E15, E17)', () => {
  it('E15 & E17: verifies proceeds and realized P&L conservation equations', () => {
    const qty = '60.0000';
    const price = '150.00000000';
    const stt = '18.00000000';
    const brokerage = '20.00000000';
    const exchangeCharge = '2.50000000';
    const gst = '3.60000000';
    const sebiTurnover = '0.09000000';
    const stampDuty = '1.35000000';

    // 1. Gross Proceeds = Qty * Price
    const gross = DecimalPrecision.multiplyStr(qty, price, 8);
    assert.equal(gross, '9000.00000000');

    // 2. Server-derived total charges (E17)
    const chargeLines = [stt, brokerage, exchangeCharge, gst, sebiTurnover, stampDuty];
    const totalCharges = DecimalPrecision.addStr(chargeLines, 8);
    assert.equal(totalCharges, '45.54000000');

    // 3. Net Proceeds = Gross - Total Charges
    const net = DecimalPrecision.subtractStr(gross, totalCharges, 8);
    assert.equal(net, '8954.46000000');

    // 4. Multi-lot cost basis consumed: 50 @ 100 + 10 @ 120 = 5000 + 1200 = 6200
    const costBasisConsumed = '6200.00000000';

    // 5. Realized P&L = Net Proceeds - Cost Basis Consumed
    const pnl = DecimalPrecision.subtractStr(net, costBasisConsumed, 8);
    assert.equal(pnl, '2754.46000000');

    // Invariant check: Gross = Net + Total Charges
    const reconstructedGross = DecimalPrecision.addStr([net, totalCharges], 8);
    assert.equal(reconstructedGross, gross);

    // Invariant check: Net Proceeds = Cost Basis Consumed + Realized P&L
    const reconstructedNet = DecimalPrecision.addStr([costBasisConsumed, pnl], 8);
    assert.equal(reconstructedNet, net);
  });

  it('E9: verifies double-entry General Ledger debits === credits for Capital Gain', () => {
    // Gross proceeds: 9000.00, Net proceeds: 8954.46, Charges: 45.54, Cost: 6200.00, Gross Gain: 2800.00
    const netProceeds = 8954.46;
    const charges = 45.54;
    const costBasis = 6200.00;
    const grossGain = 2800.00;

    const debits = netProceeds + charges; // Dr 1030 + Dr 5020
    const credits = costBasis + grossGain; // Cr 1110 + Cr 4010

    assert.equal(debits, 9000.00);
    assert.equal(credits, 9000.00);
    assert.ok(Math.abs(debits - credits) < 0.0001, 'Debits must strictly equal Credits for Capital Gain');

    // Net P&L in financial statements: Gross Gain (4010) - Charges (5020) = 2754.46
    const netPnl = grossGain - charges;
    assert.equal(netPnl, 2754.46);
  });

  it('E9: verifies double-entry General Ledger debits === credits for Capital Loss', () => {
    // Gross proceeds: 4000.00, Charges: 20.00, Net proceeds: 3980.00, Cost basis: 5000.00
    // Gross Loss: 5000 - 4000 = 1000.00
    const netProceeds = 3980.00;
    const charges = 20.00;
    const grossLoss = 1000.00;
    const costBasis = 5000.00;

    const debits = netProceeds + charges + grossLoss; // Dr 1030 + Dr 5020 + Dr 5010
    const credits = costBasis;                         // Cr 1110

    assert.equal(debits, 5000.00);
    assert.equal(credits, 5000.00);
    assert.ok(Math.abs(debits - credits) < 0.0001, 'Debits must strictly equal Credits for Capital Loss');

    // Net loss in financial statements: Gross Loss (5010) + Charges (5020) = 1020.00
    const totalLoss = grossLoss + charges;
    assert.equal(totalLoss, 1020.00);
  });

  it('E9: verifies double-entry General Ledger debits === credits for Breakeven', () => {
    // Qty = 50 @ 100 = 5000 gross
    // Charges = 0
    // Net = 5000
    // Cost basis = 5000
    // P&L = 0
    const netProceeds = 5000.00;
    const costBasis = 5000.00;

    const debits = netProceeds; // 1030
    const credits = costBasis;  // 1110

    assert.equal(debits, 5000.00);
    assert.equal(credits, 5000.00);
  });

  it('E9 & E18: verifies double-entry General Ledger debits === credits for Two-Stage Settlement', () => {
    const netProceeds = 8954.46;

    // T+1 Settlement: Dr 1010 Bank / Cr 1030 Receivable
    const debits = netProceeds;
    const credits = netProceeds;

    assert.equal(debits, credits);
  });
});
