/**
 * Double-Entry General Ledger Journal Service
 * Handles transactional posting, balance validation, idempotent deduplication, and immutable reversals.
 */

import { createClient } from "@/lib/supabase/server";
import {
  PostJournalParams,
  JournalLineInput,
  JournalEntryRow,
  JournalLineRow,
} from "../types/finance.types";

/**
 * Generates a standard sequential-style journal reference number.
 * e.g. JRN-20260910-4A9B2C
 */
export function generateJournalNumber(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `JRN-${dateStr}-${suffix}`;
}

export interface JournalBundle {
  header: JournalEntryRow;
  lines: JournalLineRow[];
}

/**
 * Posts a complete double-entry journal with strict balance enforcement and idempotency.
 */
export async function postJournalEntry(
  params: PostJournalParams
): Promise<{ success: boolean; journalId?: string; isDuplicate?: boolean; error?: string }> {
  const {
    userId,
    journalNumber = generateJournalNumber(),
    idempotencyKey,
    journalType,
    referenceType,
    referenceId = null,
    transactionDate = new Date().toISOString(),
    narration,
    lines,
    metadata = {},
  } = params;

  // 1. Invariant validations
  if (!lines || lines.length < 2) {
    return { success: false, error: "A double-entry journal requires at least two lines." };
  }

  let totalDebit = 0;
  let totalCredit = 0;

  for (const line of lines) {
    if (line.debit < 0 || line.credit < 0) {
      return { success: false, error: "Negative debits or credits are prohibited." };
    }
    if ((line.debit > 0 && line.credit > 0) || (line.debit === 0 && line.credit === 0)) {
      return {
        success: false,
        error: "Each journal line must contain either a debit or a credit, never both and never zero.",
      };
    }
    totalDebit = Math.round((totalDebit + line.debit) * 100) / 100;
    totalCredit = Math.round((totalCredit + line.credit) * 100) / 100;
  }

  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    return {
      success: false,
      error: `Unbalanced journal: Total Debits (₹${totalDebit}) must equal Total Credits (₹${totalCredit}).`,
    };
  }

  const supabase = await createClient();

  // 2. Check Idempotency Key
  const { data: existingJournal } = await supabase
    .from("journal_entries")
    .select("id, status")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existingJournal) {
    const journalRecord = existingJournal as unknown as { id: string; status: string };
    return {
      success: true,
      journalId: journalRecord.id,
      isDuplicate: true,
    };
  }

  // 3. Prepare line payload
  const formattedLines = lines.map((l) => ({
    account_id: l.accountId,
    applicant_id: l.applicantId || null,
    debit: l.debit,
    credit: l.credit,
    line_narration: l.lineNarration || narration,
  }));

  // 4. Call atomic database stored procedure
  const { data: rpcResult, error: rpcError } = await (
    supabase.rpc as unknown as (
      name: string,
      args: Record<string, unknown>
    ) => Promise<{ data: unknown; error: { message: string } | null }>
  )("post_journal_entry_atomic", {
    p_user_id: userId,
    p_journal_number: journalNumber,
    p_idempotency_key: idempotencyKey,
    p_journal_type: journalType,
    p_reference_type: referenceType,
    p_reference_id: referenceId,
    p_transaction_date: transactionDate,
    p_narration: narration,
    p_lines: formattedLines,
    p_metadata: metadata,
  });

  if (rpcError) {
    return { success: false, error: `Failed to post journal entry: ${rpcError.message}` };
  }

  return { success: true, journalId: rpcResult as string };
}

/**
 * Reverses a posted journal entry immutably.
 * Creates an offsetting journal entry and marks the original as reversed.
 */
export async function reverseJournalEntry(params: {
  userId: string;
  journalId: string;
  reversalReason: string;
}): Promise<{ success: boolean; reversalJournalId?: string; error?: string }> {
  const { userId, journalId, reversalReason } = params;
  const supabase = await createClient();

  // 1. Fetch original journal and its lines
  const { data: original, error: origError } = await supabase
    .from("journal_entries")
    .select(`
      id,
      journal_number,
      status,
      reference_type,
      reference_id,
      narration
    `)
    .eq("id", journalId)
    .eq("user_id", userId)
    .single();

  if (origError || !original) {
    return { success: false, error: "Target journal not found." };
  }

  const origHeader = original as unknown as {
    id: string;
    journal_number: string;
    status: string;
    reference_type: string;
    reference_id: string | null;
    narration: string;
  };

  if (origHeader.status !== "posted") {
    return { success: false, error: `Only 'posted' journals can be reversed (current status: ${origHeader.status}).` };
  }

  const { data: rawLines, error: linesError } = await supabase
    .from("journal_lines")
    .select("*")
    .eq("journal_id", journalId);

  if (linesError || !rawLines || rawLines.length === 0) {
    return { success: false, error: "No constituent lines found for the target journal." };
  }

  const lines = rawLines as unknown as JournalLineRow[];

  // 2. Build offsetting inverted lines
  const invertedLines: JournalLineInput[] = lines.map((l) => ({
    accountId: l.account_id,
    applicantId: l.applicant_id,
    debit: l.credit,   // Inverted
    credit: l.debit,   // Inverted
    currency: l.currency,
    lineNarration: `Reversal of [${origHeader.journal_number}]: ${l.line_narration || origHeader.narration}`,
  }));

  const reversalIdempotencyKey = `reversal:journal:${journalId}`;
  const reversalJournalNumber = generateJournalNumber();

  // 3. Post the reversal journal
  const postRes = await postJournalEntry({
    userId,
    journalNumber: reversalJournalNumber,
    idempotencyKey: reversalIdempotencyKey,
    journalType: "reversal",
    referenceType: origHeader.reference_type,
    referenceId: origHeader.reference_id,
    narration: `Reversal of Journal [${origHeader.journal_number}]: ${reversalReason}`,
    lines: invertedLines,
    metadata: {
      reversesJournalId: journalId,
      reversalReason,
    },
  });

  if (!postRes.success || !postRes.journalId) {
    return { success: false, error: postRes.error || "Failed to post reversal journal." };
  }

  // 4. Update cross-references
  await supabase
    .from("journal_entries")
    .update({
      status: "reversed",
      reversed_by_journal_id: postRes.journalId,
      reversal_reason: reversalReason,
    } as never)
    .eq("id", journalId);

  await supabase
    .from("journal_entries")
    .update({
      reverses_journal_id: journalId,
    } as never)
    .eq("id", postRes.journalId);

  return { success: true, reversalJournalId: postRes.journalId };
}

/**
 * Retrieves journals for a user with their lines.
 */
export async function getUserJournals(
  userId: string,
  limit: number = 50
): Promise<JournalBundle[]> {
  const supabase = await createClient();

  const { data: entries, error } = await supabase
    .from("journal_entries")
    .select(`
      *,
      journal_lines (
        *,
        financial_accounts (
          account_code,
          account_name,
          classification
        )
      )
    `)
    .eq("user_id", userId)
    .order("transaction_date", { ascending: false })
    .limit(limit);

  if (error || !entries) {
    return [];
  }

  const rawEntries = entries as unknown as Array<
    JournalEntryRow & {
      journal_lines: JournalLineRow[];
    }
  >;

  return rawEntries.map((e) => ({
    header: e,
    lines: e.journal_lines || [],
  }));
}

export class JournalService {
  /**
   * Validates balance and constraints for a set of journal lines.
   */
  static validateJournalBalance(lines: Array<{
    accountId?: string;
    debitAmount?: number;
    creditAmount?: number;
    debit?: number;
    credit?: number;
  }>): { valid: boolean; totalDebit: number; totalCredit: number; error?: string } {
    if (!lines || lines.length < 2) {
      return {
        valid: false,
        totalDebit: 0,
        totalCredit: 0,
        error: "A double-entry journal requires at least two lines.",
      };
    }

    let totalDebit = 0;
    let totalCredit = 0;

    for (const line of lines) {
      const d = Number(line.debitAmount ?? line.debit ?? 0);
      const c = Number(line.creditAmount ?? line.credit ?? 0);

      if (d < 0 || c < 0) {
        return { valid: false, totalDebit: 0, totalCredit: 0, error: "Negative amounts prohibited" };
      }

      if (d > 0 && c > 0) {
        return {
          valid: false,
          totalDebit: 0,
          totalCredit: 0,
          error: "A line cannot have both debit and credit amounts",
        };
      }

      if (d === 0 && c === 0) {
        return {
          valid: false,
          totalDebit: 0,
          totalCredit: 0,
          error: "Each line must have either debit > 0 or credit > 0",
        };
      }

      totalDebit += d;
      totalCredit += c;
    }

    totalDebit = Math.round(totalDebit * 100) / 100;
    totalCredit = Math.round(totalCredit * 100) / 100;

    if (Math.abs(totalDebit - totalCredit) > 0.001) {
      return {
        valid: false,
        totalDebit,
        totalCredit,
        error: `Journal entry is not balanced: Total debits (₹${totalDebit}) must equal total credits (₹${totalCredit})`,
      };
    }

    return {
      valid: true,
      totalDebit,
      totalCredit,
    };
  }

  static async postJournalEntry(params: PostJournalParams) {
    return postJournalEntry(params);
  }

  static async reverseJournalEntry(originalEntryId: string, userId: string, reason: string) {
    return reverseJournalEntry({
      userId,
      journalId: originalEntryId,
      reversalReason: reason,
    });
  }

  static async getUserJournals(userId: string, limit?: number) {
    return getUserJournals(userId, limit);
  }

  /**
   * Evaluates the PostgreSQL Deferred Header Constraint Trigger invariant:
   * trg_journal_header_balance -> verify_journal_header_balance()
   */
  static validatePostgresHeaderBalance(
    header: { id?: string; status: 'draft' | 'posted' | 'reversed' },
    lines: Array<{ debit: number; credit: number }>
  ): { valid: boolean; error?: string } {
    if (header.status === 'posted') {
      if (!lines || lines.length < 2) {
        return {
          valid: false,
          error: `Posted journal ${header.id || ''} must contain at least 2 lines (found ${lines?.length ?? 0} lines).`,
        };
      }

      const debitSum = Math.round(lines.reduce((s, l) => s + (l.debit || 0), 0) * 100) / 100;
      const creditSum = Math.round(lines.reduce((s, l) => s + (l.credit || 0), 0) * 100) / 100;

      if (Math.abs(debitSum - creditSum) > 0.001) {
        return {
          valid: false,
          error: `Unbalanced journal ${header.id || ''}: Total Debits (₹${debitSum}) does not equal Total Credits (₹${creditSum}).`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Evaluates PostgreSQL Immutability Trigger for Journal Entries:
   * trg_protect_posted_journal_entries -> protect_posted_journal_entries()
   */
  static validatePostgresJournalImmutability(
    operation: 'UPDATE' | 'DELETE',
    oldEntry: { id: string; status: string; journal_number: string; user_id: string },
    newEntry?: { status?: string; journal_number?: string; user_id?: string; reversed_by_journal_id?: string | null }
  ): { allowed: boolean; error?: string } {
    if (operation === 'UPDATE') {
      if (oldEntry.status === 'posted' && newEntry && newEntry.status !== 'posted' && newEntry.status !== 'reversed') {
        return {
          allowed: false,
          error: `Posted journal ${oldEntry.id} is immutable. Use an offsetting reversal journal.`,
        };
      }
      if (oldEntry.status === 'posted' && newEntry && (oldEntry.journal_number !== newEntry.journal_number || oldEntry.user_id !== newEntry.user_id)) {
        return {
          allowed: false,
          error: `Cannot mutate core identifiers of posted journal ${oldEntry.id}.`,
        };
      }
    } else if (operation === 'DELETE') {
      if (oldEntry.status === 'posted' || oldEntry.status === 'reversed') {
        return {
          allowed: false,
          error: `Posted or reversed journal ${oldEntry.id} cannot be deleted.`,
        };
      }
    }
    return { allowed: true };
  }

  /**
   * Evaluates PostgreSQL Immutability Trigger for Journal Lines:
   * trg_protect_posted_journal_lines -> protect_posted_journal_lines()
   */
  static validatePostgresLineImmutability(
    operation: 'UPDATE' | 'DELETE',
    parentJournalStatus: string
  ): { allowed: boolean; error?: string } {
    if (parentJournalStatus === 'posted' || parentJournalStatus === 'reversed') {
      return {
        allowed: false,
        error: 'Journal lines belonging to a posted journal are immutable. Post a reversal journal.',
      };
    }
    return { allowed: true };
  }

  /**
   * Evaluates PostgreSQL Deferred Line Mutation Trigger checking cross-journal balance:
   * verify_journal_lines_mutation()
   */
  static validatePostgresLineJournalMutation(params: {
    oldJournalId: string;
    oldJournalStatus: string;
    oldJournalLinesAfterMove: Array<{ debit: number; credit: number }>;
    newJournalId: string;
    newJournalStatus: string;
    newJournalLinesAfterMove: Array<{ debit: number; credit: number }>;
  }): { allowed: boolean; error?: string } {
    if (params.oldJournalStatus === 'posted') {
      const oldDebits = Math.round(params.oldJournalLinesAfterMove.reduce((s, l) => s + (l.debit || 0), 0) * 100) / 100;
      const oldCredits = Math.round(params.oldJournalLinesAfterMove.reduce((s, l) => s + (l.credit || 0), 0) * 100) / 100;

      if (params.oldJournalLinesAfterMove.length < 2 || Math.abs(oldDebits - oldCredits) > 0.001) {
        return {
          allowed: false,
          error: `Line update unbalanced the origin journal ${params.oldJournalId}.`,
        };
      }
    }

    if (params.newJournalStatus === 'posted') {
      const newDebits = Math.round(params.newJournalLinesAfterMove.reduce((s, l) => s + (l.debit || 0), 0) * 100) / 100;
      const newCredits = Math.round(params.newJournalLinesAfterMove.reduce((s, l) => s + (l.credit || 0), 0) * 100) / 100;

      if (params.newJournalLinesAfterMove.length < 2 || Math.abs(newDebits - newCredits) > 0.001) {
        return {
          allowed: false,
          error: `Unbalanced journal ${params.newJournalId}: Debits (₹${newDebits}) != Credits (₹${newCredits}).`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Generates inverted lines for an immutable reversal journal.
   */
  static buildInvertedReversalLines<T extends { debit: number; credit: number }>(lines: T[]): Array<T & { debit: number; credit: number }> {
    return lines.map((l) => ({
      ...l,
      debit: l.credit,
      credit: l.debit,
    }));
  }
}

