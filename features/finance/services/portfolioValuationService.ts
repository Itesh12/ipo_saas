/**
 * Portfolio Valuation & Capital Metrics Service
 * Computes live portfolio holdings, cost basis, unrealized/realized P&L,
 * and ledger-derived capital breakdowns across 4-tier ownership scopes.
 */

import { createClient } from "@/lib/supabase/server";
import { marketDataProvider } from "./marketDataProvider";
import {
  HoldingItem,
  PortfolioSummary,
  CapitalBreakdown,
} from "../types/finance.types";

/**
 * Retrieves portfolio holdings for a user with real-time market valuation.
 */
export async function getUserPortfolioHoldings(
  userId: string,
  options?: {
    applicantId?: string | null;
    includeExternalTracked?: boolean;
    scope?: "personal" | "family_all" | "applicant" | "external";
  }
): Promise<{ summary: PortfolioSummary; holdings: HoldingItem[] }> {
  const supabase = await createClient();

  let query = supabase
    .from("portfolio_positions")
    .select(`
      id,
      user_id,
      applicant_id,
      security_id,
      quantity,
      average_cost_price,
      total_invested_cost,
      realized_pnl,
      is_external_tracked,
      updated_at,
      securities (
        id,
        symbol,
        company_name,
        exchange,
        isin
      ),
      applicant_profiles (
        id,
        display_name,
        relationship
      )
    `)
    .eq("user_id", userId)
    .gt("quantity", 0);

  if (options?.applicantId) {
    query = query.eq("applicant_id", options.applicantId);
  }

  const { data: rawPositions, error } = await query;

  if (error || !rawPositions) {
    return {
      summary: {
        totalInvested: 0,
        currentMarketValue: null,
        totalUnrealizedPnl: null,
        totalUnrealizedPnlPct: null,
        totalRealizedPnl: 0,
        activeHoldingsCount: 0,
        unpricedHoldingsCount: 0,
        ownershipScope: options?.scope || "personal",
      },
      holdings: [],
    };
  }

  type RawPosItem = {
    id: string;
    user_id: string;
    applicant_id: string | null;
    security_id: string;
    quantity: number;
    average_cost_price: number;
    total_invested_cost: number;
    realized_pnl: number;
    is_external_tracked: boolean;
    updated_at: string;
    securities: {
      id: string;
      symbol: string;
      company_name: string;
      exchange: string;
      isin: string | null;
    } | null;
    applicant_profiles: {
      id: string;
      display_name: string;
      relationship: string;
    } | null;
  };

  let positions = rawPositions as unknown as RawPosItem[];

  // Filter based on ownership scope
  if (options?.scope === "external") {
    positions = positions.filter((p) => p.is_external_tracked);
  } else if (options?.scope === "personal") {
    positions = positions.filter((p) => !p.is_external_tracked);
  } else if (!options?.includeExternalTracked && options?.scope !== "family_all") {
    positions = positions.filter((p) => !p.is_external_tracked);
  }

  // Batch fetch verified market quotes
  const securityIds = positions.map((p) => p.security_id);
  const quotesMap = await marketDataProvider.getBatchQuotes(securityIds);

  let totalInvestedPriced = 0;
  let totalMarketValue = 0;
  let hasAnyMarketPrice = false;
  let unpricedCount = 0;
  let totalInvestedOverall = 0;
  let totalRealized = 0;

  const holdings: HoldingItem[] = positions.map((pos) => {
    const quote = quotesMap.get(pos.security_id) || null;
    const currentPrice = quote ? quote.currentPrice : null;

    let marketValue: number | null = null;
    let unrealizedPnl: number | null = null;
    let unrealizedPnlPct: number | null = null;

    totalInvestedOverall = Math.round((totalInvestedOverall + pos.total_invested_cost) * 100) / 100;
    totalRealized = Math.round((totalRealized + pos.realized_pnl) * 100) / 100;

    if (currentPrice !== null && currentPrice > 0) {
      hasAnyMarketPrice = true;
      marketValue = Math.round(pos.quantity * currentPrice * 100) / 100;
      unrealizedPnl = Math.round((marketValue - pos.total_invested_cost) * 100) / 100;
      unrealizedPnlPct =
        pos.total_invested_cost > 0
          ? Math.round((unrealizedPnl / pos.total_invested_cost) * 10000) / 100
          : 0;

      totalInvestedPriced = Math.round((totalInvestedPriced + pos.total_invested_cost) * 100) / 100;
      totalMarketValue = Math.round((totalMarketValue + marketValue) * 100) / 100;
    } else {
      unpricedCount += 1;
    }

    return {
      id: pos.id,
      securityId: pos.security_id,
      symbol: pos.securities?.symbol || "UNKNOWN",
      companyName: pos.securities?.company_name || "Unknown Company",
      exchange: pos.securities?.exchange || "NSE",
      isin: pos.securities?.isin || null,
      applicantId: pos.applicant_id,
      applicantDisplayName: pos.applicant_profiles?.display_name || null,
      applicantRelationship: pos.applicant_profiles?.relationship || null,
      quantity: pos.quantity,
      averageCostPrice: pos.average_cost_price,
      totalInvestedCost: pos.total_invested_cost,
      currentPrice,
      marketValue,
      unrealizedPnl,
      unrealizedPnlPct,
      realizedPnl: pos.realized_pnl,
      isExternalTracked: pos.is_external_tracked,
      updatedAt: pos.updated_at,
    };
  });

  const totalUnrealizedPnl = hasAnyMarketPrice ? Math.round((totalMarketValue - totalInvestedPriced) * 100) / 100 : null;
  const totalUnrealizedPnlPct =
    hasAnyMarketPrice && totalInvestedPriced > 0
      ? Math.round(((totalMarketValue - totalInvestedPriced) / totalInvestedPriced) * 10000) / 100
      : null;

  return {
    summary: {
      totalInvested: totalInvestedOverall,
      currentMarketValue: hasAnyMarketPrice ? totalMarketValue : null,
      totalUnrealizedPnl,
      totalUnrealizedPnlPct,
      totalRealizedPnl: totalRealized,
      activeHoldingsCount: holdings.length,
      unpricedHoldingsCount: unpricedCount,
      ownershipScope: options?.scope || "personal",
    },
    holdings,
  };
}

/**
 * Computes authoritative ledger-derived capital balances.
 * Derived from Account 1010 (Available) and Account 1020 (IPO Lien) in the General Ledger.
 */
export async function getUserCapitalBreakdown(userId: string): Promise<CapitalBreakdown> {
  const supabase = await createClient();

  // Query sum of debits and credits for standard accounts
  const { data: rawLines, error } = await supabase
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
    .eq("journal_entries.status", "posted");

  if (error || !rawLines) {
    return {
      availableBankCash: 0,
      encumberedIpoLiens: 0,
      totalDeployedInvestments: 0,
      totalLiquidAndEncumberedCash: 0,
      currency: "INR",
      isInitialized: false,
    };
  }

  type RawLineItem = {
    debit: number;
    credit: number;
    financial_accounts: {
      account_code: string;
      user_id: string;
    };
  };

  const lines = rawLines as unknown as RawLineItem[];

  let available1010 = 0;
  let lien1020 = 0;
  let invested1110 = 0;
  const hasAnyTransactions = lines.length > 0;

  for (const line of lines) {
    const code = line.financial_accounts.account_code;
    const net = line.debit - line.credit;

    if (code === "1010") {
      available1010 = Math.round((available1010 + net) * 100) / 100;
    } else if (code === "1020") {
      lien1020 = Math.round((lien1020 + net) * 100) / 100;
    } else if (code === "1110") {
      invested1110 = Math.round((invested1110 + net) * 100) / 100;
    }
  }

  return {
    availableBankCash: available1010,
    encumberedIpoLiens: lien1020,
    totalDeployedInvestments: invested1110,
    totalLiquidAndEncumberedCash: Math.round((available1010 + lien1020) * 100) / 100,
    currency: "INR",
    isInitialized: hasAnyTransactions,
  };
}

export type OwnershipScope = "personal" | "family_all" | "applicant" | "external";

export class PortfolioValuationService {
  static async getUserPortfolioHoldings(
    userId: string,
    scope: OwnershipScope = "personal",
    applicantId?: string | null
  ) {
    return getUserPortfolioHoldings(userId, {
      scope,
      applicantId,
    });
  }

  static async getUserCapitalBreakdown(userId: string) {
    const res = await getUserCapitalBreakdown(userId);
    return {
      availableCash: res.availableBankCash,
      blockedLien: res.encumberedIpoLiens,
      investedAllotted: res.totalDeployedInvestments,
      totalBookNetWorth: Math.round((res.availableBankCash + res.encumberedIpoLiens + res.totalDeployedInvestments) * 100) / 100,
    };
  }
}

