/**
 * features/finance/services/portfolioSettlementService.ts
 *
 * Candidate E: Two-Stage Settlement Lifecycle Engine (E8).
 * Handles T -> T+1 Cash Clearing:
 * Dr 1010 Bank: Available Cash
 * Cr 1030 Receivables: Broker / Clearing
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { postJournalEntry } from './journalService';
import { getAccountByCode, ensureUserChartOfAccounts } from './chartOfAccountsService';
import { ConfirmSettlementInput, ConfirmSettlementResult } from '../types/exitTypes';

export class PortfolioSettlementService {
  /**
   * Confirms T+1 cash settlement for an executed exit transaction.
   * Clears broker receivable (1030) into bank available cash (1010).
   */
  public static async confirmExitSettlement(
    input: ConfirmSettlementInput,
    customClient?: any
  ): Promise<ConfirmSettlementResult> {
    const supabase = customClient || createAdminClient();
    const settlementDate = input.settlementDate || new Date().toISOString();

    // 1. Fetch Exit Transaction
    const { data: exit, error: exitErr } = await supabase
      .from('portfolio_exit_transactions')
      .select('*')
      .eq('id', input.exitTransactionId)
      .maybeSingle();

    if (exitErr || !exit) {
      return {
        success: false,
        exitTransactionId: input.exitTransactionId,
        status: 'REJECTED',
        errorCode: 'EXIT_NOT_FOUND',
        errorMessage: `Exit transaction ${input.exitTransactionId} not found.`,
      };
    }

    // Idempotent return if already settled
    if (exit.settlement_status === 'SETTLED') {
      return {
        success: true,
        exitTransactionId: exit.id,
        status: 'SETTLED',
      };
    }

    if (exit.exit_status !== 'EXECUTED' && exit.exit_status !== 'SETTLEMENT_PENDING') {
      return {
        success: false,
        exitTransactionId: exit.id,
        status: exit.exit_status,
        errorCode: 'INVALID_STATUS_FOR_SETTLEMENT',
        errorMessage: `Cannot settle exit in status '${exit.exit_status}'.`,
      };
    }

    // 2. Post Clearing Settlement Journal Entry (E8, E9)
    await ensureUserChartOfAccounts(exit.user_id);
    const bankAcc = await getAccountByCode(exit.user_id, '1010'); // Available Cash
    const clearingAcc = await getAccountByCode(exit.user_id, '1030'); // Broker Receivable

    if (!bankAcc || !clearingAcc) {
      return {
        success: false,
        exitTransactionId: exit.id,
        status: exit.exit_status,
        errorCode: 'ACCOUNTS_MISSING',
        errorMessage: 'Required accounts 1010 or 1030 not found.',
      };
    }

    const netProceedsNum = parseFloat(exit.net_proceeds);

    const settlementJournalRes = await postJournalEntry({
      userId: exit.user_id,
      idempotencyKey: `journal:settle:exit:${exit.id}`,
      journalType: 'capital_deposit',
      referenceType: 'portfolio_exit_settlement',
      referenceId: exit.id,
      transactionDate: settlementDate,
      narration: `T+1 Cash Settlement for Exit #${exit.id.slice(0, 8)}: Received ₹${exit.net_proceeds}`,
      lines: [
        {
          accountId: bankAcc.id,
          applicantId: exit.applicant_id || null,
          debit: netProceedsNum,
          credit: 0,
          lineNarration: `Cash proceeds settled into bank account`,
        },
        {
          accountId: clearingAcc.id,
          applicantId: exit.applicant_id || null,
          debit: 0,
          credit: netProceedsNum,
          lineNarration: `Broker clearing receivable settled`,
        },
      ],
      metadata: {
        exitTransactionId: exit.id,
        netProceeds: exit.net_proceeds,
        settlementReference: input.settlementReference || null,
      },
    });

    if (!settlementJournalRes.success && !settlementJournalRes.isDuplicate) {
      return {
        success: false,
        exitTransactionId: exit.id,
        status: exit.exit_status,
        errorCode: 'SETTLEMENT_JOURNAL_FAILED',
        errorMessage: settlementJournalRes.error || 'Failed to post settlement journal.',
      };
    }

    // 3. Update exit status
    const { error: updErr } = await supabase
      .from('portfolio_exit_transactions')
      .update({
        exit_status: 'SETTLED',
        settlement_status: 'SETTLED',
        settlement_date: settlementDate,
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', exit.id);

    if (updErr) {
      return {
        success: false,
        exitTransactionId: exit.id,
        status: exit.exit_status,
        errorCode: 'EXIT_UPDATE_FAILED',
        errorMessage: `Failed to update exit to SETTLED: ${updErr.message}`,
      };
    }

    // 4. Record SETTLEMENT_CONFIRMED event (E10)
    await supabase.from('portfolio_exit_events').insert({
      exit_transaction_id: exit.id,
      event_type: 'SETTLEMENT_CONFIRMED',
      actor_id: input.actorId || exit.user_id,
      previous_status: exit.exit_status,
      new_status: 'SETTLED',
      payload_hash: exit.payload_hash,
      metadata: {
        settlementDate,
        settlementJournalId: settlementJournalRes.journalId,
        settlementReference: input.settlementReference || null,
      },
    } as never);

    return {
      success: true,
      exitTransactionId: exit.id,
      settlementJournalId: settlementJournalRes.journalId,
      status: 'SETTLED',
    };
  }
}
