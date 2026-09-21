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

    // 1. Validate Inputs (E17)
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

    // 2. Server-derived charge aggregation and proceeds conservation (E17)
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

    // Ensure Chart of Accounts exists for GL posting
    await ensureUserChartOfAccounts(input.userId);

    // 3. Compute Payload Hash (E13)
    const payloadHash = this.computePayloadHash({
      userId: input.userId,
      securityId: input.securityId,
      quantitySold,
      executionPrice,
      grossProceeds,
      totalCharges,
      netProceeds,
      idempotencyKey: input.idempotencyKey,
    });

    // 4. Authoritative Database Atomic RPC Execution (E3, E16, E14, E4, E9, E10)
    // Runs inside a single PostgreSQL ACID transaction with FOR UPDATE locks on portfolio_positions and portfolio_tax_lots
    const { data: rpcData, error: rpcError } = await supabase.rpc('execute_portfolio_exit_atomic', {
      p_user_id: input.userId,
      p_applicant_id: input.applicantId || null,
      p_security_id: input.securityId,
      p_quantity_sold: parseFloat(quantitySold),
      p_execution_price: parseFloat(executionPrice),
      p_idempotency_key: input.idempotencyKey,
      p_total_charges: parseFloat(totalCharges),
      p_net_proceeds: parseFloat(netProceeds),
      p_execution_source: executionSource,
      p_tax_rule_version: 'IN_EQUITY_2024_V1',
      p_source_record_id: input.sourceRecordId || null,
      p_source_timestamp: input.sourceTimestamp || null,
      p_execution_date: executionDate,
      p_settlement_date: input.settlementDate || null,
      p_payload_hash: payloadHash,
      p_metadata: input.metadata || {},
      p_charges: input.charges || [],
      p_inject_failure: input._injectFailure || null,
    });

    if (rpcError) {
      let errorCode = 'EXIT_RPC_FAILED';
      const msg = rpcError.message || '';
      if (msg.includes('INJECTED_FAILURE_FOR_TEST:')) {
        const injected = msg.split('INJECTED_FAILURE_FOR_TEST:')[1].trim();
        errorCode = injected.startsWith('INJECTED_FAILURE_') ? injected : `INJECTED_FAILURE_${injected}`;
      } else if (msg.includes('POSITION_NOT_FOUND')) errorCode = 'POSITION_NOT_FOUND';
      else if (msg.includes('INSUFFICIENT_HOLDING_QUANTITY')) errorCode = 'INSUFFICIENT_HOLDING_QUANTITY';
      else if (msg.includes('INSUFFICIENT_LOT_QUANTITY')) errorCode = 'INSUFFICIENT_LOT_QUANTITY';

      return {
        success: false,
        status: 'REJECTED',
        errorCode,
        errorMessage: msg,
      };
    }

    const formattedAllocations = (rpcData.allocations || []).map((a: any) => ({
      taxLotId: a.taxLotId || a.tax_lot_id,
      allocatedQuantity: (a.allocatedQuantity || a.allocated_quantity || '0').toString(),
      costPerShare: (a.costPerShare || a.cost_per_share || '0').toString(),
      allocatedCostBasis: (a.allocatedCostBasis || a.allocated_cost_basis || '0').toString(),
      holdingPeriodDays: a.holdingPeriodDays ?? a.holding_period_days ?? 0,
      taxClassification: a.taxClassification || a.tax_classification,
      taxRuleVersion: a.taxRuleVersion || a.tax_rule_version || rpcData.taxRuleVersion || 'IN_EQUITY_2024_V1',
    }));

    // Populate holdingSummary from updated position
    let posQuery = supabase
      .from('portfolio_positions')
      .select('quantity, total_invested_cost, average_cost_price, realized_pnl')
      .eq('user_id', input.userId)
      .eq('security_id', input.securityId);

    if (input.applicantId) {
      posQuery = posQuery.eq('applicant_id', input.applicantId);
    } else {
      posQuery = posQuery.is('applicant_id', null);
    }
    const { data: currentPos } = await posQuery.maybeSingle();

    const holdingSummary = currentPos
      ? {
          remainingQuantity: (currentPos.quantity ?? 0).toString(),
          remainingCostBasis: (currentPos.total_invested_cost ?? 0).toString(),
          averageCostPrice: (currentPos.average_cost_price ?? 0).toString(),
          cumulativeRealizedPnl: (currentPos.realized_pnl ?? 0).toString(),
        }
      : undefined;

    return {
      success: true,
      status: rpcData.status || 'EXECUTED',
      exitTransactionId: rpcData.exitId,
      investmentTransactionId: rpcData.investmentTransactionId,
      journalEntryId: rpcData.journalEntryId,
      quantitySold: rpcData.quantitySold,
      executionPrice: rpcData.executionPrice,
      grossProceeds: rpcData.grossProceeds,
      totalCharges: rpcData.totalCharges,
      netProceeds: rpcData.netProceeds,
      costBasisConsumed: rpcData.costBasisConsumed,
      realizedPnl: rpcData.realizedPnl,
      realizedPnlPct: rpcData.realizedPnlPct || '0.0000',
      gainType: rpcData.gainType,
      taxClassification: rpcData.taxClassification,
      taxRuleVersion: rpcData.taxRuleVersion || 'IN_EQUITY_2024_V1',
      isDuplicate: rpcData.isDuplicate ? true : undefined,
      allocations: formattedAllocations,
      holdingSummary,
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
