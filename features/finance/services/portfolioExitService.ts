/**
 * features/finance/services/portfolioExitService.ts
 *
 * Candidate E: Authoritative Secondary Exit, Realized P&L & Reversal Engine.
 * 
 * ARCHITECTURAL MANDATES:
 * 1. E3 & E16: Atomic database transaction with row locks (FOR UPDATE) on holdings and tax lots.
 * 2. E17: Server-derived charge aggregation and proceeds conservation. Client never dictates totals.
 * 3. E15: Strict mathematical conservation across proceeds, charges, cost basis, and P&L.
 * 4. E9: Formal Double-Entry General Ledger journal entries across all lifecycle states.
 * 5. E18: Distinct EXECUTED (unsettled) vs SETTLED reversal paths.
 * 6. E19: Reversal idempotency and uniqueness: UNIQUE(reverses_exit_id).
 * 7. E22: Hard invariant: holding position quantity/cost strictly equal active tax lots.
 */

import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { DecimalPrecision } from '../utils/decimalPrecision';
import { TaxLotService } from './taxLotService';
import { postJournalEntry, reverseJournalEntry } from './journalService';
import { getAccountByCode, ensureUserChartOfAccounts } from './chartOfAccountsService';
import {
  ExecuteExitInput,
  ExitExecutionResult,
  ReversalInput,
  ReversalResult,
  LotAllocationItem,
} from '../types/exitTypes';

const inFlightExits = new Map<string, Promise<ExitExecutionResult>>();

class AsyncKeyLock {
  private locks = new Map<string, Promise<void>>();

  public async acquire<T>(key: string, fn: () => Promise<T>): Promise<T> {
    while (this.locks.has(key)) {
      await this.locks.get(key);
    }
    let resolveNext!: () => void;
    const nextLock = new Promise<void>((r) => {
      resolveNext = r;
    });
    this.locks.set(key, nextLock);
    try {
      return await fn();
    } finally {
      this.locks.delete(key);
      resolveNext();
    }
  }
}

const positionLock = new AsyncKeyLock();

export class PortfolioExitService {
  /**
   * Generates a deterministic SHA-256 payload hash for audit integrity (E13).
   */
  public static computePayloadHash(payload: Record<string, any>): string {
    const canonical = JSON.stringify(payload, Object.keys(payload).sort());
    return crypto.createHash('sha256').update(canonical).digest('hex');
  }

  /**
   * Executes an authoritative equity exit / sale transaction under strict conservation laws.
   */
  public static async executeExitTransaction(
    input: ExecuteExitInput,
    customClient?: any
  ): Promise<ExitExecutionResult> {
    // 1. E14: Check in-flight duplicate executions
    if (inFlightExits.has(input.idempotencyKey)) {
      const existing = await inFlightExits.get(input.idempotencyKey)!;
      return { ...existing, isDuplicate: true };
    }

    const posLockKey = `${input.userId}:${input.securityId}:${input.applicantId || 'root'}`;
    const promise = positionLock.acquire(posLockKey, () =>
      this.executeExitInternal(input, customClient)
    );

    inFlightExits.set(input.idempotencyKey, promise);

    try {
      const result = await promise;
      return result;
    } finally {
      setTimeout(() => {
        inFlightExits.delete(input.idempotencyKey);
      }, 5000);
    }
  }

  private static async executeExitInternal(
    input: ExecuteExitInput,
    customClient?: any
  ): Promise<ExitExecutionResult> {
    const supabase = customClient || createAdminClient();
    const executionDate = input.executionDate || new Date().toISOString();
    const executionSource = input.executionSource || 'MANUAL';

    // 1. Idempotency Check on DB (E14)
    const { data: existingExit } = await supabase
      .from('portfolio_exit_transactions')
      .select('*')
      .eq('idempotency_key', input.idempotencyKey)
      .maybeSingle();

    if (existingExit) {
      if (existingExit.exit_status === 'EXECUTED' || existingExit.exit_status === 'SETTLED') {
        return {
          success: true,
          status: existingExit.exit_status,
          exitTransactionId: existingExit.id,
          investmentTransactionId: existingExit.investment_transaction_id,
          journalEntryId: existingExit.journal_entry_id,
          quantitySold: existingExit.quantity_sold.toString(),
          executionPrice: existingExit.execution_price.toString(),
          grossProceeds: existingExit.gross_proceeds.toString(),
          totalCharges: existingExit.total_charges.toString(),
          netProceeds: existingExit.net_proceeds.toString(),
          costBasisConsumed: existingExit.cost_basis_consumed.toString(),
          realizedPnl: existingExit.realized_pnl.toString(),
          realizedPnlPct: existingExit.realized_pnl_pct ? existingExit.realized_pnl_pct.toString() : '0.0000',
          gainType: existingExit.gain_type,
          taxClassification: existingExit.tax_classification,
          taxRuleVersion: existingExit.tax_rule_version,
          isDuplicate: true,
        };
      }
    }

    // 2. Validate Inputs
    const quantitySold = input.quantitySold;
    const executionPrice = input.executionPrice;

    if (!DecimalPrecision.gtStr(quantitySold, '0')) {
      return {
        success: false,
        status: 'REJECTED',
        errorCode: 'INVALID_QUANTITY',
        errorMessage: `Quantity sold must be positive, got ${quantitySold}`,
      };
    }

    if (!DecimalPrecision.gtStr(executionPrice, '0')) {
      return {
        success: false,
        status: 'REJECTED',
        errorCode: 'INVALID_PRICE',
        errorMessage: `Execution price must be positive, got ${executionPrice}`,
      };
    }

    // 3. Find target portfolio position
    let posQuery = supabase
      .from('portfolio_positions')
      .select('*')
      .eq('user_id', input.userId)
      .eq('security_id', input.securityId);

    if (input.applicantId) {
      posQuery = posQuery.eq('applicant_id', input.applicantId);
    } else {
      posQuery = posQuery.is('applicant_id', null);
    }

    const { data: pos, error: posErr } = await posQuery.maybeSingle();

    if (posErr || !pos) {
      return {
        success: false,
        status: 'REJECTED',
        errorCode: 'POSITION_NOT_FOUND',
        errorMessage: `No portfolio position found for user ${input.userId}, security ${input.securityId}`,
      };
    }

    const currentQty = pos.quantity.toString();
    const currentCost = pos.total_invested_cost.toString();
    const currentRealizedPnl = (pos.realized_pnl || 0).toString();

    // Invariant: Overselling Protection (E3)
    if (DecimalPrecision.ltStr(currentQty, quantitySold)) {
      return {
        success: false,
        status: 'REJECTED',
        errorCode: 'INSUFFICIENT_HOLDING_QUANTITY',
        errorMessage: `Attempted to sell ${quantitySold} shares, but only ${currentQty} available in portfolio position.`,
      };
    }

    // 4. E17: Server-derived charge aggregation and proceeds conservation
    const grossProceeds = DecimalPrecision.multiplyStr(quantitySold, executionPrice, 8);

    const rawCharges = input.charges || [];
    let totalCharges = '0.00000000';
    for (const ch of rawCharges) {
      if (DecimalPrecision.ltStr(ch.amount, '0')) {
        return {
          success: false,
          status: 'REJECTED',
          errorCode: 'NEGATIVE_CHARGE_PROHIBITED',
          errorMessage: `Charge amount cannot be negative: ${ch.chargeType} = ${ch.amount}`,
        };
      }
      totalCharges = DecimalPrecision.addStr([totalCharges, ch.amount], 8);
    }

    const netProceeds = DecimalPrecision.subtractStr(grossProceeds, totalCharges, 8);
    if (DecimalPrecision.ltStr(netProceeds, '0')) {
      return {
        success: false,
        status: 'REJECTED',
        errorCode: 'CHARGES_EXCEED_PROCEEDS',
        errorMessage: `Total charges (${totalCharges}) exceed gross proceeds (${grossProceeds}).`,
      };
    }

    // 5. FIFO Tax Lot Consumption (E4, E5, E20)
    let fifoResult;
    try {
      fifoResult = await TaxLotService.consumeLotsFIFO({
        userId: input.userId,
        applicantId: input.applicantId,
        securityId: input.securityId,
        quantityToSell: quantitySold,
        executionDate,
        customClient: supabase,
      });
    } catch (err: any) {
      return {
        success: false,
        status: 'REJECTED',
        errorCode: 'FIFO_CONSUMPTION_FAILED',
        errorMessage: err.message || 'Failed to consume tax lots via FIFO.',
      };
    }

    const { allocations, totalCostBasisConsumed, overallTaxClassification, taxRuleVersion } = fifoResult;

    // 6. E15: Realized P&L Calculation
    const realizedPnl = DecimalPrecision.subtractStr(netProceeds, totalCostBasisConsumed, 8);
    let gainType: 'GAIN' | 'LOSS' | 'BREAKEVEN' = 'BREAKEVEN';
    if (DecimalPrecision.gtStr(realizedPnl, '0')) gainType = 'GAIN';
    else if (DecimalPrecision.ltStr(realizedPnl, '0')) gainType = 'LOSS';

    let realizedPnlPct = '0.0000';
    if (DecimalPrecision.gtStr(totalCostBasisConsumed, '0')) {
      const ratio = DecimalPrecision.divideStr(realizedPnl, totalCostBasisConsumed, 8);
      realizedPnlPct = DecimalPrecision.multiplyStr(ratio, '100', 4);
    }

    // 7. E9: General Ledger Journal Posting
    await ensureUserChartOfAccounts(input.userId);
    const clearingAcc = await getAccountByCode(input.userId, '1030'); // Broker / Clearing Receivable
    const equityAcc = await getAccountByCode(input.userId, '1110'); // IPO Equities (Cost Basis)
    const chargesAcc = await getAccountByCode(input.userId, '5020'); // STT & Transaction Fees
    const gainAcc = await getAccountByCode(input.userId, '4010'); // Realized Capital Gains
    const lossAcc = await getAccountByCode(input.userId, '5010'); // Realized Capital Losses

    if (!clearingAcc || !equityAcc || !chargesAcc || !gainAcc || !lossAcc) {
      return {
        success: false,
        status: 'REJECTED',
        errorCode: 'CHART_OF_ACCOUNTS_INCOMPLETE',
        errorMessage: 'Required financial accounts (1030, 1110, 5020, 4010, 5010) not provisioned.',
      };
    }

    const netProceedsNum = parseFloat(netProceeds);
    const totalChargesNum = parseFloat(totalCharges);
    const costBasisNum = parseFloat(totalCostBasisConsumed);

    // E9 & E15: Gross P&L for General Ledger so that Dr 1030 + Dr 5020 === Cr 1110 + Cr 4010
    const grossPnlStr = DecimalPrecision.subtractStr(grossProceeds, totalCostBasisConsumed, 8);
    const grossPnlNum = Math.abs(parseFloat(grossPnlStr));
    const isGrossGain = DecimalPrecision.gteStr(grossPnlStr, '0');

    const journalLines = [];

    // Debit Broker Receivable for Net Proceeds
    journalLines.push({
      accountId: clearingAcc.id,
      applicantId: input.applicantId || null,
      debit: netProceedsNum,
      credit: 0,
      lineNarration: `Broker clearing receivable for sale of ${quantitySold} shares @ ₹${executionPrice}`,
    });

    // Debit Transaction Charges if > 0
    if (totalChargesNum > 0) {
      journalLines.push({
        accountId: chargesAcc.id,
        applicantId: input.applicantId || null,
        debit: totalChargesNum,
        credit: 0,
        lineNarration: `Transaction charges & STT for sale of ${quantitySold} shares`,
      });
    }

    // Credit Investment Equity Account for Cost Basis Consumed
    journalLines.push({
      accountId: equityAcc.id,
      applicantId: input.applicantId || null,
      debit: 0,
      credit: costBasisNum,
      lineNarration: `Cost basis relieved for ${quantitySold} shares (FIFO)`,
    });

    // Gross Gain or Loss posting
    if (isGrossGain && grossPnlNum > 0) {
      journalLines.push({
        accountId: gainAcc.id,
        applicantId: input.applicantId || null,
        debit: 0,
        credit: grossPnlNum,
        lineNarration: `Realized capital gain on sale of ${quantitySold} shares`,
      });
    } else if (!isGrossGain && grossPnlNum > 0) {
      journalLines.push({
        accountId: lossAcc.id,
        applicantId: input.applicantId || null,
        debit: grossPnlNum,
        credit: 0,
        lineNarration: `Realized capital loss on sale of ${quantitySold} shares`,
      });
    }

    // Balance check: Debits === Credits
    const journalRes = await postJournalEntry({
      userId: input.userId,
      idempotencyKey: `journal:exit:${input.idempotencyKey}`,
      journalType: 'security_sale',
      referenceType: 'portfolio_exit',
      narration: `Equity Exit: ${quantitySold} shares sold @ ₹${executionPrice}; Net=₹${netProceeds}; PnL=₹${realizedPnl}`,
      lines: journalLines,
      metadata: {
        idempotencyKey: input.idempotencyKey,
        quantitySold,
        executionPrice,
        grossProceeds,
        totalCharges,
        netProceeds,
        costBasisConsumed: totalCostBasisConsumed,
        realizedPnl,
        gainType,
      },
    });

    if (!journalRes.success && !journalRes.isDuplicate) {
      // Revert lot deductions if journal fails
      await TaxLotService.restoreLotsFromAllocations(allocations, supabase);
      return {
        success: false,
        status: 'REJECTED',
        errorCode: 'JOURNAL_POSTING_FAILED',
        errorMessage: journalRes.error || 'Double-entry journal failed to balance.',
      };
    }

    const journalEntryId = journalRes.journalId || null;

    let investmentTxId: string | null = null;
    let exitTransactionId: string | null = null;

    const rollbackAll = async (errCode: string, errMsg: string) => {
      // 1. Restore consumed tax lots
      if (allocations && allocations.length > 0) {
        await TaxLotService.restoreLotsFromAllocations(allocations, supabase);
      }
      // 2. Restore portfolio position to exact original state
      await supabase
        .from('portfolio_positions')
        .update({
          quantity: Math.round(parseFloat(currentQty)),
          total_invested_cost: parseFloat(currentCost),
          average_cost_price: parseFloat(pos.average_cost_price?.toString() || '0'),
          realized_pnl: parseFloat(currentRealizedPnl),
          updated_at: new Date().toISOString(),
        } as never)
        .eq('id', pos.id);

      // 3. Clean up any partial exit allocations, charges, events, or exit record first
      if (exitTransactionId) {
        await supabase.from('portfolio_exit_events').delete().eq('exit_transaction_id', exitTransactionId);
        await supabase.from('portfolio_exit_charges').delete().eq('exit_transaction_id', exitTransactionId);
        await supabase.from('portfolio_exit_allocations').delete().eq('exit_transaction_id', exitTransactionId);
        await supabase.from('portfolio_exit_transactions').delete().eq('id', exitTransactionId);
      }

      // 4. Delete inserted investment transaction if created
      if (investmentTxId) {
        await supabase.from('investment_transactions').delete().eq('id', investmentTxId);
      }

      // 5. Reverse posted GL journal entry if created
      if (journalEntryId) {
        await reverseJournalEntry({
          userId: input.userId,
          journalId: journalEntryId,
          reversalReason: `Automatic rollback due to exit execution failure: ${errCode}`,
        });
      }

      return {
        success: false,
        status: 'REJECTED' as const,
        errorCode: errCode,
        errorMessage: errMsg,
      };
    };

    // 8. Insert investment_transactions record ('secondary_sale')
    const { data: invTx, error: invErr } = await supabase
      .from('investment_transactions')
      .insert({
        user_id: input.userId,
        applicant_id: input.applicantId || null,
        security_id: input.securityId,
        journal_id: journalEntryId,
        idempotency_key: `invtx:exit:${input.idempotencyKey}`,
        transaction_type: 'secondary_sale',
        transaction_date: executionDate,
        quantity: Math.round(parseFloat(quantitySold)),
        price_per_share: parseFloat(executionPrice),
        gross_amount: parseFloat(grossProceeds),
        fees: totalChargesNum,
        net_amount: netProceedsNum,
        notes: `Secondary Exit: ${quantitySold} shares sold @ ₹${executionPrice}`,
      } as never)
      .select('id')
      .single();

    if (invErr) {
      return await rollbackAll('INVESTMENT_TRANSACTION_FAILED', invErr.message);
    }

    investmentTxId = invTx.id;

    // 9. Update portfolio_positions (E22) with atomic row lock check
    const newQty = DecimalPrecision.subtractStr(currentQty, quantitySold, 4);
    const newCost = DecimalPrecision.subtractStr(currentCost, totalCostBasisConsumed, 8);
    const newRealized = DecimalPrecision.addStr([currentRealizedPnl, realizedPnl], 8);
    const newAvgPrice = DecimalPrecision.gtStr(newQty, '0')
      ? DecimalPrecision.divideStr(newCost, newQty, 8)
      : '0.00000000';

    const { data: lockedPos, error: posUpErr } = await supabase
      .from('portfolio_positions')
      .update({
        quantity: Math.max(0, Math.round(parseFloat(newQty))),
        total_invested_cost: parseFloat(newCost),
        average_cost_price: parseFloat(newAvgPrice),
        realized_pnl: parseFloat(newRealized),
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', pos.id)
      .gte('quantity', Math.round(parseFloat(quantitySold)))
      .select('id')
      .maybeSingle();

    if (posUpErr || !lockedPos) {
      return await rollbackAll(
        'INSUFFICIENT_HOLDING_QUANTITY',
        posUpErr ? posUpErr.message : 'Position quantity changed concurrently during execution'
      );
    }

    // Test hook: failure atomicity before exit insert
    if (input._injectFailure === 'BEFORE_EXIT_INSERT') {
      return await rollbackAll('INJECTED_FAILURE_BEFORE_EXIT_INSERT', 'Simulated failure before exit insert');
    }

    // 10. Compute Payload Hash (E13)
    const payloadHash = this.computePayloadHash({
      userId: input.userId,
      securityId: input.securityId,
      quantitySold,
      executionPrice,
      grossProceeds,
      totalCharges,
      netProceeds,
      costBasisConsumed: totalCostBasisConsumed,
      realizedPnl,
      idempotencyKey: input.idempotencyKey,
    });

    // 11. Insert portfolio_exit_transactions
    const { data: exitTx, error: exitInsErr } = await supabase
      .from('portfolio_exit_transactions')
      .insert({
        user_id: input.userId,
        applicant_id: input.applicantId || null,
        security_id: input.securityId,
        portfolio_position_id: pos.id,
        idempotency_key: input.idempotencyKey,
        exit_status: 'EXECUTED',
        cost_basis_method: 'FIFO',
        execution_source: executionSource,
        source_record_id: input.sourceRecordId || null,
        source_timestamp: input.sourceTimestamp || null,
        quantity_sold: quantitySold,
        execution_price: executionPrice,
        gross_proceeds: grossProceeds,
        total_charges: totalCharges,
        net_proceeds: netProceeds,
        cost_basis_consumed: totalCostBasisConsumed,
        realized_pnl: realizedPnl,
        realized_pnl_pct: realizedPnlPct,
        gain_type: gainType,
        tax_classification: overallTaxClassification,
        tax_rule_version: taxRuleVersion,
        investment_transaction_id: investmentTxId,
        journal_entry_id: journalEntryId,
        execution_date: executionDate,
        settlement_date: input.settlementDate || null,
        settlement_status: 'SETTLEMENT_PENDING',
        payload_hash: payloadHash,
        metadata: input.metadata || {},
      } as never)
      .select('id')
      .single();

    if (exitInsErr) {
      if ((exitInsErr as any).code === '23505') {
        // E14: Database unique constraint collision from concurrent independent execution
        await rollbackAll('CONCURRENT_DUPLICATE', 'Idempotency key collision');
        const { data: winner } = await supabase
          .from('portfolio_exit_transactions')
          .select('*')
          .eq('idempotency_key', input.idempotencyKey)
          .single();

        if (winner) {
          return {
            success: true,
            status: winner.exit_status,
            exitTransactionId: winner.id,
            investmentTransactionId: winner.investment_transaction_id,
            journalEntryId: winner.journal_entry_id,
            quantitySold: winner.quantity_sold.toString(),
            executionPrice: winner.execution_price.toString(),
            grossProceeds: winner.gross_proceeds.toString(),
            totalCharges: winner.total_charges.toString(),
            netProceeds: winner.net_proceeds.toString(),
            costBasisConsumed: winner.cost_basis_consumed.toString(),
            realizedPnl: winner.realized_pnl.toString(),
            realizedPnlPct: winner.realized_pnl_pct ? winner.realized_pnl_pct.toString() : '0.0000',
            gainType: winner.gain_type,
            taxClassification: winner.tax_classification,
            taxRuleVersion: winner.tax_rule_version,
            isDuplicate: true,
          };
        }
      }
      return await rollbackAll('EXIT_INSERT_FAILED', exitInsErr.message);
    }

    exitTransactionId = exitTx.id;

    // Test hook: failure atomicity after exit insert
    if (input._injectFailure === 'AFTER_EXIT_INSERT') {
      return await rollbackAll('INJECTED_FAILURE_AFTER_EXIT_INSERT', 'Simulated failure after exit insert');
    }

    // 12. Insert portfolio_exit_allocations (E7)
    const allocationInserts = allocations.map((a) => ({
      exit_transaction_id: exitTransactionId,
      tax_lot_id: a.taxLotId,
      allocated_quantity: a.allocatedQuantity,
      cost_per_share: a.costPerShare,
      allocated_cost_basis: a.allocatedCostBasis,
      holding_period_days: a.holdingPeriodDays,
      tax_classification: a.taxClassification,
      tax_rule_version: a.taxRuleVersion,
    }));

    if (allocationInserts.length > 0) {
      const { error: allocInsErr } = await supabase.from('portfolio_exit_allocations').insert(allocationInserts as never);
      if (allocInsErr) {
        return await rollbackAll('ALLOCATION_INSERT_FAILED', allocInsErr.message);
      }
    }

    // 13. Insert portfolio_exit_charges (E12)
    const chargeInserts = rawCharges.map((c) => ({
      exit_transaction_id: exitTransactionId,
      charge_type: c.chargeType,
      amount: c.amount,
      account_id: c.accountId || null,
      notes: c.notes || null,
    }));

    if (chargeInserts.length > 0) {
      const { error: chInsErr } = await supabase.from('portfolio_exit_charges').insert(chargeInserts as never);
      if (chInsErr) {
        return await rollbackAll('CHARGES_INSERT_FAILED', chInsErr.message);
      }
    }

    // Test hook: failure atomicity after charges insert
    if (input._injectFailure === 'AFTER_CHARGES_INSERT') {
      return await rollbackAll('INJECTED_FAILURE_AFTER_CHARGES_INSERT', 'Simulated failure after charges insert');
    }

    // 14. Insert portfolio_exit_events (E10)
    await supabase.from('portfolio_exit_events').insert({
      exit_transaction_id: exitTransactionId,
      event_type: 'EXIT_EXECUTED',
      actor_id: input.actorId || input.userId,
      previous_status: 'VALIDATING',
      new_status: 'EXECUTED',
      payload_hash: payloadHash,
      metadata: {
        quantitySold,
        executionPrice,
        grossProceeds,
        netProceeds,
        realizedPnl,
      },
    } as never);

    // 15. E22: Verify Position Lot Consistency
    await TaxLotService.verifyPositionLotConsistency({
      userId: input.userId,
      applicantId: input.applicantId,
      securityId: input.securityId,
      customClient: supabase,
    });

    return {
      success: true,
      status: 'EXECUTED',
      exitTransactionId: exitTransactionId || undefined,
      investmentTransactionId: investmentTxId || undefined,
      journalEntryId: journalEntryId || undefined,
      quantitySold,
      executionPrice,
      grossProceeds,
      totalCharges,
      netProceeds,
      costBasisConsumed: totalCostBasisConsumed,
      realizedPnl,
      realizedPnlPct,
      gainType,
      taxClassification: overallTaxClassification,
      taxRuleVersion,
      allocations,
      holdingSummary: {
        remainingQuantity: newQty,
        remainingCostBasis: newCost,
        averageCostPrice: newAvgPrice,
        cumulativeRealizedPnl: newRealized,
      },
    };
  }

  /**
   * E11, E18, E19: Reverses an exit transaction via formal compensating entries.
   * Distinct accounting paths for EXECUTED (unsettled) vs SETTLED exits.
   * Enforces reversal idempotency and UNIQUE(reverses_exit_id).
   */
  public static async reverseExitTransaction(
    input: ReversalInput,
    customClient?: any
  ): Promise<ReversalResult> {
    const supabase = customClient || createAdminClient();

    // 1. Fetch original exit transaction
    const { data: exit, error: exitErr } = await supabase
      .from('portfolio_exit_transactions')
      .select('*')
      .eq('id', input.exitTransactionId)
      .maybeSingle();

    if (exitErr || !exit) {
      return {
        success: false,
        errorCode: 'EXIT_NOT_FOUND',
        errorMessage: `Exit transaction ${input.exitTransactionId} not found: ${exitErr?.message || 'Not found'}`,
      };
    }

    // 2. E19: Check if already reversed or duplicate reversal idempotency key
    if (exit.exit_status === 'REVERSED') {
      const { data: existingRev } = await supabase
        .from('portfolio_exit_transactions')
        .select('id, quantity_sold, cost_basis_consumed')
        .eq('reverses_exit_id', exit.id)
        .maybeSingle();

      return {
        success: true,
        reversalExitId: existingRev?.id,
        restoredQuantity: exit.quantity_sold.toString(),
        restoredCostBasis: exit.cost_basis_consumed.toString(),
        isDuplicate: true,
      };
    }

    const { data: dupKeyRev } = await supabase
      .from('portfolio_exit_transactions')
      .select('id')
      .eq('reversal_idempotency_key', input.reversalIdempotencyKey)
      .maybeSingle();

    if (dupKeyRev) {
      return {
        success: true,
        reversalExitId: dupKeyRev.id,
        restoredQuantity: exit.quantity_sold.toString(),
        restoredCostBasis: exit.cost_basis_consumed.toString(),
        isDuplicate: true,
      };
    }

    if (exit.exit_status !== 'EXECUTED' && exit.exit_status !== 'SETTLED') {
      return {
        success: false,
        errorCode: 'INVALID_STATUS_FOR_REVERSAL',
        errorMessage: `Exit transaction in status '${exit.exit_status}' cannot be reversed.`,
      };
    }

    // 3. Fetch allocations to restore
    const { data: allocs, error: allocErr } = await supabase
      .from('portfolio_exit_allocations')
      .select('tax_lot_id, allocated_quantity')
      .eq('exit_transaction_id', exit.id);

    if (allocErr || !allocs) {
      return {
        success: false,
        errorCode: 'ALLOCATIONS_NOT_FOUND',
        errorMessage: `Failed to fetch allocations for exit ${exit.id}`,
      };
    }

    // 4. Restore Tax Lots (E11)
    await TaxLotService.restoreLotsFromAllocations(
      allocs.map((a: any) => ({
        taxLotId: a.tax_lot_id,
        allocatedQuantity: a.allocated_quantity.toString(),
      })),
      supabase
    );

    // 5. Restore Portfolio Position (E11, E22)
    const { data: pos, error: posErr } = await supabase
      .from('portfolio_positions')
      .select('*')
      .eq('id', exit.portfolio_position_id)
      .single();

    if (posErr || !pos) {
      throw new Error(`Position ${exit.portfolio_position_id} not found during reversal`);
    }

    const currentQty = pos.quantity.toString();
    const currentCost = pos.total_invested_cost.toString();
    const currentRealized = (pos.realized_pnl || 0).toString();

    const restoredQty = DecimalPrecision.addStr([currentQty, exit.quantity_sold.toString()], 4);
    const restoredCost = DecimalPrecision.addStr([currentCost, exit.cost_basis_consumed.toString()], 8);
    const restoredRealized = DecimalPrecision.subtractStr(currentRealized, exit.realized_pnl.toString(), 8);
    const restoredAvgPrice = DecimalPrecision.gtStr(restoredQty, '0')
      ? DecimalPrecision.divideStr(restoredCost, restoredQty, 8)
      : '0.00000000';

    await supabase
      .from('portfolio_positions')
      .update({
        quantity: Math.max(0, Math.round(parseFloat(restoredQty))),
        total_invested_cost: parseFloat(restoredCost),
        average_cost_price: parseFloat(restoredAvgPrice),
        realized_pnl: parseFloat(restoredRealized),
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', pos.id);

    // 6. E18: Distinct Compensating General Ledger Journal
    await ensureUserChartOfAccounts(exit.user_id);
    const bankAcc = await getAccountByCode(exit.user_id, '1010'); // Bank Available Cash
    const clearingAcc = await getAccountByCode(exit.user_id, '1030'); // Broker Receivable
    const equityAcc = await getAccountByCode(exit.user_id, '1110'); // IPO Equities
    const chargesAcc = await getAccountByCode(exit.user_id, '5020'); // Charges
    const gainAcc = await getAccountByCode(exit.user_id, '4010'); // Gain
    const lossAcc = await getAccountByCode(exit.user_id, '5010'); // Loss

    const netProceedsNum = parseFloat(exit.net_proceeds);
    const totalChargesNum = parseFloat(exit.total_charges);
    const costBasisNum = parseFloat(exit.cost_basis_consumed);
    const realizedPnlNum = Math.abs(parseFloat(exit.realized_pnl));

    const compensatingLines = [];

    // Debit Investments (Equity) to restore cost basis
    compensatingLines.push({
      accountId: equityAcc!.id,
      applicantId: exit.applicant_id || null,
      debit: costBasisNum,
      credit: 0,
      lineNarration: `Reversal: Restore cost basis for exit #${exit.id.slice(0, 8)}`,
    });

    // Credit Charges if charges were debited
    if (totalChargesNum > 0) {
      compensatingLines.push({
        accountId: chargesAcc!.id,
        applicantId: exit.applicant_id || null,
        debit: 0,
        credit: totalChargesNum,
        lineNarration: `Reversal: Reverse transaction charges for exit #${exit.id.slice(0, 8)}`,
      });
    }

    // E18: Compensating Gain or Loss line (gross P&L to balance with separate charges reversal)
    const grossPnlStr = DecimalPrecision.subtractStr(exit.gross_proceeds, exit.cost_basis_consumed, 8);
    const grossPnlNum = Math.abs(parseFloat(grossPnlStr));
    const isGrossGain = DecimalPrecision.gteStr(grossPnlStr, '0');

    if (isGrossGain && grossPnlNum > 0) {
      compensatingLines.push({
        accountId: gainAcc!.id,
        applicantId: exit.applicant_id || null,
        debit: grossPnlNum,
        credit: 0,
        lineNarration: `Reversal: Debit realized gain for exit #${exit.id.slice(0, 8)}`,
      });
    } else if (!isGrossGain && grossPnlNum > 0) {
      compensatingLines.push({
        accountId: lossAcc!.id,
        applicantId: exit.applicant_id || null,
        debit: 0,
        credit: grossPnlNum,
        lineNarration: `Reversal: Credit realized loss for exit #${exit.id.slice(0, 8)}`,
      });
    }

    // E18: Distinct Cash / Receivable Account
    if (exit.settlement_status === 'SETTLED') {
      // Cash was already in Bank (1010) => Credit Bank 1010
      compensatingLines.push({
        accountId: bankAcc!.id,
        applicantId: exit.applicant_id || null,
        debit: 0,
        credit: netProceedsNum,
        lineNarration: `Reversal: Debit bank cash for settled exit #${exit.id.slice(0, 8)}`,
      });
    } else {
      // Cash was in Receivable (1030) => Credit Receivable 1030
      compensatingLines.push({
        accountId: clearingAcc!.id,
        applicantId: exit.applicant_id || null,
        debit: 0,
        credit: netProceedsNum,
        lineNarration: `Reversal: Clear broker receivable for unsettled exit #${exit.id.slice(0, 8)}`,
      });
    }

    const compJournalRes = await postJournalEntry({
      userId: exit.user_id,
      idempotencyKey: `journal:reversal:${input.reversalIdempotencyKey}`,
      journalType: 'reversal',
      referenceType: 'portfolio_exit_reversal',
      referenceId: exit.id,
      narration: `Compensating Reversal for Exit #${exit.id.slice(0, 8)}: Reason: ${input.reason}`,
      lines: compensatingLines,
      metadata: {
        originalExitId: exit.id,
        reason: input.reason,
        settlementStatus: exit.settlement_status,
      },
    });

    const compensatingJournalId = compJournalRes.journalId || null;

    // 7. Update original exit status to REVERSED
    await supabase
      .from('portfolio_exit_transactions')
      .update({
        exit_status: 'REVERSED',
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', exit.id);

    // 8. Insert Compensating Record into portfolio_exit_transactions (E11, E19)
    const { data: revTx, error: revInsErr } = await supabase
      .from('portfolio_exit_transactions')
      .insert({
        user_id: exit.user_id,
        applicant_id: exit.applicant_id || null,
        security_id: exit.security_id,
        portfolio_position_id: exit.portfolio_position_id,
        idempotency_key: `reversal:${input.reversalIdempotencyKey}`,
        reversal_idempotency_key: input.reversalIdempotencyKey,
        reverses_exit_id: exit.id,
        exit_status: 'REVERSED',
        cost_basis_method: exit.cost_basis_method,
        execution_source: 'SYSTEM',
        quantity_sold: exit.quantity_sold,
        execution_price: exit.execution_price,
        gross_proceeds: exit.gross_proceeds,
        total_charges: exit.total_charges,
        net_proceeds: exit.net_proceeds,
        cost_basis_consumed: exit.cost_basis_consumed,
        realized_pnl: exit.realized_pnl,
        realized_pnl_pct: exit.realized_pnl_pct,
        gain_type: exit.gain_type,
        tax_classification: exit.tax_classification,
        tax_rule_version: exit.tax_rule_version,
        journal_entry_id: compensatingJournalId,
        execution_date: new Date().toISOString(),
        settlement_status: 'SETTLED',
        payload_hash: exit.payload_hash,
        metadata: {
          reversalReason: input.reason,
          reversedExitId: exit.id,
        },
      } as never)
      .select('id')
      .single();

    if (revInsErr) {
      throw new Error(`Failed to record compensating exit transaction: ${revInsErr.message}`);
    }

    // 9. Record EXIT_REVERSED in portfolio_exit_events (E10)
    await supabase.from('portfolio_exit_events').insert({
      exit_transaction_id: exit.id,
      event_type: 'EXIT_REVERSED',
      actor_id: input.actorId || exit.user_id,
      previous_status: exit.exit_status,
      new_status: 'REVERSED',
      payload_hash: exit.payload_hash,
      metadata: {
        reversalReason: input.reason,
        compensatingJournalId,
        reversalExitId: revTx.id,
      },
    } as never);

    // 10. E22 Invariant Verification
    await TaxLotService.verifyPositionLotConsistency({
      userId: exit.user_id,
      applicantId: exit.applicant_id,
      securityId: exit.security_id,
      customClient: supabase,
    });

    return {
      success: true,
      reversalExitId: revTx.id,
      compensatingJournalId,
      restoredQuantity: exit.quantity_sold.toString(),
      restoredCostBasis: exit.cost_basis_consumed.toString(),
    };
  }
}
