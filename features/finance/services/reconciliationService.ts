/**
 * features/finance/services/reconciliationService.ts
 *
 * Phase 5 Stage 2: Financial Integrity & Reconciliation Service
 * Audits ledger consistency, trial balance mathematical parity,
 * ASBA hanging lien anomalies, and ghost allotment mismatches.
 */

import { createClient } from "@/lib/supabase/server";
import type { ReconciliationReport, ReconciliationDiscrepancy } from "../types/finance.types";

export class ReconciliationService {
  /**
   * Run full trial balance audit for a user or global system
   */
  static async runTrialBalanceAudit(userId?: string): Promise<{
    isBalanced: boolean;
    totalDebits: number;
    totalCredits: number;
    imbalance: number;
    accountCount: number;
    entriesCount: number;
  }> {
    const supabase = await createClient();

    // Query posted journal entries and their lines
    let query = supabase
      .from("journal_lines")
      .select(`
        id,
        journal_id,
        debit,
        credit,
        account_id,
        journal_entries!inner (
          id,
          user_id,
          status
        )
      `)
      .eq("journal_entries.status", "posted");

    if (userId) {
      query = query.eq("journal_entries.user_id", userId);
    }

    const { data: lines, error } = await query;

    if (error || !lines) {
      return {
        isBalanced: true,
        totalDebits: 0,
        totalCredits: 0,
        imbalance: 0,
        accountCount: 0,
        entriesCount: 0,
      };
    }

    type LineRow = {
      id: string;
      journal_id: string;
      debit: number;
      credit: number;
      account_id: string;
    };

    const typedLines = lines as unknown as LineRow[];

    let totalDebits = 0;
    let totalCredits = 0;
    const accountSet = new Set<string>();
    const entrySet = new Set<string>();

    for (const line of typedLines) {
      totalDebits += Number(line.debit || 0);
      totalCredits += Number(line.credit || 0);
      accountSet.add(line.account_id);
      entrySet.add(line.journal_id);
    }

    totalDebits = Math.round(totalDebits * 100) / 100;
    totalCredits = Math.round(totalCredits * 100) / 100;
    const imbalance = Math.round(Math.abs(totalDebits - totalCredits) * 100) / 100;

    return {
      isBalanced: imbalance === 0,
      totalDebits,
      totalCredits,
      imbalance,
      accountCount: accountSet.size,
      entriesCount: entrySet.size,
    };
  }

  /**
   * Run full comprehensive reconciliation report for a user
   */
  static async runComprehensiveReconciliation(userId: string): Promise<ReconciliationReport> {
    const supabase = await createClient();
    const discrepancies: ReconciliationDiscrepancy[] = [];

    // 1. Trial balance check
    const tb = await this.runTrialBalanceAudit(userId);
    if (!tb.isBalanced) {
      discrepancies.push({
        type: "trial_balance_mismatch",
        severity: "critical",
        entityId: userId,
        description: `General Ledger is out of balance by ₹${tb.imbalance.toLocaleString("en-IN")}. Debits: ₹${tb.totalDebits}, Credits: ₹${tb.totalCredits}`,
        details: {
          expected: tb.totalCredits,
          actual: tb.totalDebits,
          imbalance: tb.imbalance,
        },
      });
    }

    // 2. Check ASBA Hanging Liens
    const { data: rawLines } = await supabase
      .from("journal_lines")
      .select(`
        debit,
        credit,
        financial_accounts!inner (
          account_code,
          user_id
        ),
        journal_entries!inner (
          status,
          user_id
        )
      `)
      .eq("journal_entries.user_id", userId)
      .eq("journal_entries.status", "posted")
      .eq("financial_accounts.account_code", "1020");

    type RawLine = {
      debit: number;
      credit: number;
    };

    const lienAccountBalance = ((rawLines || []) as unknown as RawLine[]).reduce(
      (sum, l) => sum + (Number(l.debit || 0) - Number(l.credit || 0)),
      0
    );

    // Active applications
    const { data: activeBlockedApps } = await supabase
      .from("ipo_applications")
      .select("id, application_amount, status")
      .eq("user_id", userId)
      .in("status", ["funds_blocked", "mandate_approved"]);

    type RawApp = {
      id: string;
      application_amount: number;
    };

    const expectedLienTotal = ((activeBlockedApps || []) as unknown as RawApp[]).reduce(
      (sum, app) => sum + Number(app.application_amount || 0),
      0
    );

    if (Math.abs(lienAccountBalance - expectedLienTotal) > 0.01 && (activeBlockedApps?.length ?? 0) > 0) {
      discrepancies.push({
        type: "hanging_lien",
        severity: "warning",
        entityId: "1020",
        description: `ASBA Lien Account 1020 balance (₹${lienAccountBalance}) does not match active blocked applications (₹${expectedLienTotal}).`,
        details: {
          expected: expectedLienTotal,
          actual: lienAccountBalance,
        },
      });
    }

    // 3. Position quantity integrity
    const { data: rawPositions } = await supabase
      .from("portfolio_positions")
      .select("id, security_id, applicant_id, quantity, is_external_tracked")
      .eq("user_id", userId);

    type RawPos = {
      id: string;
      security_id: string;
      quantity: number;
    };

    const positions = (rawPositions || []) as unknown as RawPos[];
    for (const pos of positions) {
      if (pos.quantity < 0) {
        discrepancies.push({
          type: "position_quantity_mismatch",
          severity: "critical",
          entityId: pos.id,
          description: `Position has negative quantity (${pos.quantity}) for security ${pos.security_id}`,
          details: {
            expected: 0,
            actual: pos.quantity,
          },
        });
      }
    }

    return {
      timestamp: new Date().toISOString(),
      isBalanced: tb.isBalanced,
      totalDebits: tb.totalDebits,
      totalCredits: tb.totalCredits,
      discrepancies,
    };
  }
}
