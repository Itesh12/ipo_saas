/**
 * features/finance/actions/capitalActions.ts
 *
 * Phase 5 Stage 2: Server Actions for Capital & General Ledger mutations.
 * Enforces authentication, Zod validation, atomic double-entry posting, and zero fabricated history.
 */

'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { JournalService } from '../services/journalService';
import { ChartOfAccountsService } from '../services/chartOfAccountsService';
import {
  declareOpeningBalanceSchema,
  capitalDepositSchema,
  capitalWithdrawalSchema,
  journalReversalSchema,
} from '../schemas/finance.schemas';
import type { PostJournalParams } from '../types/finance.types';

/**
 * Declare explicit opening bank cash balance.
 * Zero fabricated records: explicitly marked as unverified historical baseline with user notes.
 */
export async function declareOpeningBalanceAction(formData: FormData) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Authentication required' };
    }
    const userId = user.id;

    const rawData = {
      amount: formData.get('amount'),
      asOfDate: formData.get('asOfDate'),
      accountCode: formData.get('accountCode') || '1010',
      bankName: formData.get('bankName') || undefined,
      notes: formData.get('notes') || undefined,
    };

    const validated = declareOpeningBalanceSchema.parse(rawData);

    // Ensure COA exists
    const accounts = await ChartOfAccountsService.getUserAccounts(userId);
    const bankAccount = accounts.find((a) => a.account_code === (validated.accountCode || '1010'));
    if (!bankAccount) {
      return { success: false, error: 'Bank account not found' };
    }

    const idempotencyKey = `opbal_${userId}_${validated.asOfDate}_${validated.amount}`;

    // Dr. Bank Available Cash (1010)
    // Cr. Historical Unverified Opening Balance (3020)
    const journalPayload: PostJournalParams = {
      userId,
      transactionDate: `${validated.asOfDate}T00:00:00Z`,
      journalType: 'opening_balance',
      referenceType: 'opening_balance',
      narration: `Declared Opening Bank Balance: ${validated.bankName || 'Trading Bank'} (${validated.notes || 'Baseline cash'})`,
      idempotencyKey,
      lines: [
        {
          accountId: bankAccount.id,
          debit: validated.amount,
          credit: 0,
          lineNarration: `Opening balance cash in ${validated.bankName || 'Bank'}`,
        },
        {
          accountId: '3020', // Handled by service if using standard code
          debit: 0,
          credit: validated.amount,
          lineNarration: 'Historical Unverified Equity baseline',
        },
      ],
    };

    const res = await JournalService.postJournalEntry(journalPayload);
    if (!res.success) {
      return { success: false, error: res.error };
    }

    revalidatePath('/capital');
    revalidatePath('/portfolio');
    return { success: true, entryId: res.journalId };
  } catch (err) {
    console.error('[declareOpeningBalanceAction] error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to declare balance' };
  }
}

/**
 * Record a capital deposit (fresh funds introduced by user into trading bank account)
 */
export async function recordCapitalDepositAction(formData: FormData) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Authentication required' };
    }
    const userId = user.id;

    const rawData = {
      amount: formData.get('amount') ? Number(formData.get('amount')) : 0,
      depositDate: formData.get('depositDate') || new Date().toISOString().split('T')[0],
      source: formData.get('source') || 'bank_transfer',
      referenceNumber: formData.get('referenceNumber') || undefined,
      notes: formData.get('notes') || undefined,
    };

    const validated = capitalDepositSchema.parse(rawData);

    const accounts = await ChartOfAccountsService.getUserAccounts(userId);
    const bankAccount = accounts.find((a) => a.account_code === '1010');
    const equityAccount = accounts.find((a) => a.account_code === '3010');

    if (!bankAccount || !equityAccount) {
      return { success: false, error: 'Accounts not found' };
    }

    const idempotencyKey = `dep_${userId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const journalPayload: PostJournalParams = {
      userId,
      transactionDate: validated.depositDate ? `${validated.depositDate}T00:00:00Z` : new Date().toISOString(),
      journalType: 'capital_deposit',
      referenceType: 'capital_deposit',
      narration: `Capital Deposit (${validated.source}): ${validated.notes || validated.referenceNumber || 'Funds infused'}`,
      idempotencyKey,
      metadata: {
        source: validated.source,
        referenceNumber: validated.referenceNumber,
      },
      lines: [
        {
          accountId: bankAccount.id,
          debit: validated.amount,
          credit: 0,
          lineNarration: 'Cash infused into trading account',
        },
        {
          accountId: equityAccount.id,
          debit: 0,
          credit: validated.amount,
          lineNarration: "Owner's capital contribution",
        },
      ],
    };

    const res = await JournalService.postJournalEntry(journalPayload);
    if (!res.success) {
      return { success: false, error: res.error };
    }

    revalidatePath('/capital');
    revalidatePath('/portfolio');
    return { success: true, entryId: res.journalId };
  } catch (err) {
    console.error('[recordCapitalDepositAction] error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Deposit failed' };
  }
}

/**
 * Record capital withdrawal (funds withdrawn from trading bank account)
 */
export async function recordCapitalWithdrawalAction(formData: FormData) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Authentication required' };
    }
    const userId = user.id;

    const rawData = {
      amount: formData.get('amount') ? Number(formData.get('amount')) : 0,
      withdrawalDate: formData.get('withdrawalDate') || new Date().toISOString().split('T')[0],
      destination: formData.get('destination') || 'savings_account',
      notes: formData.get('notes') || undefined,
    };

    const validated = capitalWithdrawalSchema.parse(rawData);

    const accounts = await ChartOfAccountsService.getUserAccounts(userId);
    const bankAccount = accounts.find((a) => a.account_code === '1010');
    const equityAccount = accounts.find((a) => a.account_code === '3010');

    if (!bankAccount || !equityAccount) {
      return { success: false, error: 'Accounts not found' };
    }

    const idempotencyKey = `wdr_${userId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Dr. Owner's Equity (3010)
    // Cr. Bank Available Cash (1010)
    const journalPayload: PostJournalParams = {
      userId,
      transactionDate: validated.withdrawalDate ? `${validated.withdrawalDate}T00:00:00Z` : new Date().toISOString(),
      journalType: 'capital_withdrawal',
      referenceType: 'capital_withdrawal',
      narration: `Capital Withdrawal to ${validated.destination}: ${validated.notes || 'Drawings'}`,
      idempotencyKey,
      lines: [
        {
          accountId: equityAccount.id,
          debit: validated.amount,
          credit: 0,
          lineNarration: "Owner's capital withdrawal / drawings",
        },
        {
          accountId: bankAccount.id,
          debit: 0,
          credit: validated.amount,
          lineNarration: 'Cash withdrawn from trading bank account',
        },
      ],
    };

    const res = await JournalService.postJournalEntry(journalPayload);
    if (!res.success) {
      return { success: false, error: res.error };
    }

    revalidatePath('/capital');
    revalidatePath('/portfolio');
    return { success: true, entryId: res.journalId };
  } catch (err) {
    console.error('[recordCapitalWithdrawalAction] error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Withdrawal failed' };
  }
}

/**
 * Reverse a posted journal entry (Strict double-entry reversal with linked reason)
 */
export async function reverseJournalEntryAction(formData: FormData) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Authentication required' };
    }
    const userId = user.id;

    const rawData = {
      originalEntryId: formData.get('originalEntryId'),
      reason: formData.get('reason'),
    };

    const validated = journalReversalSchema.parse(rawData);

    const res = await JournalService.reverseJournalEntry(validated.originalEntryId, userId, validated.reason);

    if (!res.success) {
      return { success: false, error: res.error };
    }

    revalidatePath('/capital');
    revalidatePath('/portfolio');
    return { success: true, reversalEntryId: res.reversalJournalId };
  } catch (err) {
    console.error('[reverseJournalEntryAction] error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Reversal failed' };
  }
}

