/**
 * Chart of Accounts (COA) Service
 * Initializes and manages user-scoped financial accounts across all 5 classifications.
 */

import { createClient } from "@/lib/supabase/server";
import { FinancialAccountRow, AccountClassification, OwnershipCategory } from "../types/finance.types";

interface StandardAccountTemplate {
  code: string;
  name: string;
  classification: AccountClassification;
  ownershipCategory: OwnershipCategory;
  isSystem: boolean;
}

export const STANDARD_CHART_OF_ACCOUNTS: StandardAccountTemplate[] = [
  {
    code: "1010",
    name: "Bank: Available Cash",
    classification: "asset",
    ownershipCategory: "user_personal",
    isSystem: true,
  },
  {
    code: "1020",
    name: "Bank: IPO Lien / Encumbered (ASBA)",
    classification: "asset",
    ownershipCategory: "user_personal",
    isSystem: true,
  },
  {
    code: "1030",
    name: "Receivables: In-Transit Unblock / Refund",
    classification: "asset",
    ownershipCategory: "user_personal",
    isSystem: true,
  },
  {
    code: "1110",
    name: "Investments: IPO Equities (Cost Basis)",
    classification: "asset",
    ownershipCategory: "user_personal",
    isSystem: true,
  },
  {
    code: "2010",
    name: "Liabilities: Clearing & Broker Payables",
    classification: "liability",
    ownershipCategory: "user_personal",
    isSystem: true,
  },
  {
    code: "3010",
    name: "Equity: User Capital & Deposits",
    classification: "equity",
    ownershipCategory: "user_personal",
    isSystem: true,
  },
  {
    code: "4010",
    name: "Revenue: Realized Capital Gains",
    classification: "revenue",
    ownershipCategory: "user_personal",
    isSystem: true,
  },
  {
    code: "4020",
    name: "Revenue: Dividends Received",
    classification: "revenue",
    ownershipCategory: "user_personal",
    isSystem: true,
  },
  {
    code: "5010",
    name: "Expense: Realized Capital Losses",
    classification: "expense",
    ownershipCategory: "user_personal",
    isSystem: true,
  },
  {
    code: "5020",
    name: "Expense: STT & Transaction Fees",
    classification: "expense",
    ownershipCategory: "user_personal",
    isSystem: true,
  },
];

/**
 * Ensures standard Chart of Accounts exists for the specified user.
 * Idempotently creates missing accounts.
 */
export async function ensureUserChartOfAccounts(userId: string): Promise<FinancialAccountRow[]> {
  let supabase: any;
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    supabase = createAdminClient();
  } catch {
    supabase = await createClient();
  }

  // 1. Fetch existing accounts
  const { data: existing, error } = await supabase
    .from("financial_accounts")
    .select("*")
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Failed to fetch accounts: ${error.message}`);
  }

  const existingAccounts = (existing || []) as FinancialAccountRow[];
  const existingCodes = new Set(existingAccounts.map((a) => a.account_code));

  // 2. Identify missing standard accounts
  const missing = STANDARD_CHART_OF_ACCOUNTS.filter((t) => !existingCodes.has(t.code));

  if (missing.length > 0) {
    const payloads = missing.map((t) => ({
      user_id: userId,
      account_code: t.code,
      account_name: t.name,
      classification: t.classification,
      ownership_category: t.ownershipCategory,
      currency: "INR",
      is_system_account: t.isSystem,
      is_active: true,
    }));

    const { data: created, error: insertErr } = await supabase
      .from("financial_accounts")
      .insert(payloads as never)
      .select();

    if (insertErr) {
      throw new Error(`Failed to initialize standard accounts: ${insertErr.message}`);
    }

    if (created) {
      existingAccounts.push(...(created as FinancialAccountRow[]));
    }
  }

  return existingAccounts;
}

/**
 * Retrieves a user's financial accounts, optionally filtered by classification or ownership.
 */
export async function getUserAccounts(
  userId: string,
  filters?: {
    classification?: AccountClassification;
    ownershipCategory?: OwnershipCategory;
  }
): Promise<FinancialAccountRow[]> {
  const accounts = await ensureUserChartOfAccounts(userId);

  return accounts.filter((acc) => {
    if (filters?.classification && acc.classification !== filters.classification) {
      return false;
    }
    if (filters?.ownershipCategory && acc.ownership_category !== filters.ownershipCategory) {
      return false;
    }
    return true;
  });
}

/**
 * Retrieves a specific account by code for a user.
 */
export async function getAccountByCode(
  userId: string,
  accountCode: string
): Promise<FinancialAccountRow | null> {
  const accounts = await ensureUserChartOfAccounts(userId);
  return accounts.find((a) => a.account_code === accountCode) || null;
}

export class ChartOfAccountsService {
  static STANDARD_ACCOUNTS = STANDARD_CHART_OF_ACCOUNTS;

  static async ensureUserChartOfAccounts(userId: string) {
    return ensureUserChartOfAccounts(userId);
  }

  static async getUserAccounts(userId: string, filters?: {
    classification?: AccountClassification;
    ownershipCategory?: OwnershipCategory;
  }) {
    return getUserAccounts(userId, filters);
  }

  static async getAccountByCode(userId: string, accountCode: string) {
    return getAccountByCode(userId, accountCode);
  }
}

