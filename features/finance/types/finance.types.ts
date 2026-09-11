/**
 * Phase 5 Finance & Portfolio Feature Types
 */

import { Database } from "@/types/database.types";

export type AccountClassification = Database["public"]["Enums"]["account_classification"];
export type JournalStatus = Database["public"]["Enums"]["journal_status"];
export type JournalType = Database["public"]["Enums"]["journal_type"];
export type InvestmentTransactionType = Database["public"]["Enums"]["investment_transaction_type"];
export type FundingOwnerType = Database["public"]["Enums"]["funding_owner_type"];
export type OwnershipCategory = Database["public"]["Enums"]["ownership_category"];
export type FinanceBackfillState = Database["public"]["Enums"]["finance_backfill_state"];

export type FinancialAccountRow = Database["public"]["Tables"]["financial_accounts"]["Row"];
export type FinancialAccountInsert = Database["public"]["Tables"]["financial_accounts"]["Insert"];

export type JournalEntryRow = Database["public"]["Tables"]["journal_entries"]["Row"];
export type JournalEntryInsert = Database["public"]["Tables"]["journal_entries"]["Insert"];

export type JournalLineRow = Database["public"]["Tables"]["journal_lines"]["Row"];
export type JournalLineInsert = Database["public"]["Tables"]["journal_lines"]["Insert"];

export type SecurityRow = Database["public"]["Tables"]["securities"]["Row"];
export type SecurityInsert = Database["public"]["Tables"]["securities"]["Insert"];

export type InvestmentTransactionRow = Database["public"]["Tables"]["investment_transactions"]["Row"];
export type InvestmentTransactionInsert = Database["public"]["Tables"]["investment_transactions"]["Insert"];

export type PortfolioPositionRow = Database["public"]["Tables"]["portfolio_positions"]["Row"];
export type PortfolioPositionInsert = Database["public"]["Tables"]["portfolio_positions"]["Insert"];

export type SecurityPriceRow = Database["public"]["Tables"]["security_prices"]["Row"];
export type SecurityPriceInsert = Database["public"]["Tables"]["security_prices"]["Insert"];

export interface JournalLineInput {
  accountId: string;
  applicantId?: string | null;
  debit: number;
  credit: number;
  currency?: string;
  lineNarration?: string | null;
}

export interface PostJournalParams {
  userId: string;
  journalNumber?: string;
  idempotencyKey: string;
  journalType: JournalType;
  referenceType: string;
  referenceId?: string | null;
  transactionDate?: string;
  narration: string;
  lines: JournalLineInput[];
  metadata?: Record<string, unknown>;
}

export interface MarketPriceQuote {
  symbol: string;
  exchange: string;
  isin?: string | null;
  currentPrice: number;
  dayOpen?: number | null;
  dayHigh?: number | null;
  dayLow?: number | null;
  previousClose?: number | null;
  capturedAt: string;
  source: string;
  isVerified: boolean;
}

export interface HoldingItem {
  id: string;
  securityId: string;
  symbol: string;
  companyName: string;
  exchange: string;
  isin: string | null;
  applicantId: string | null;
  applicantDisplayName: string | null;
  applicantRelationship: string | null;
  quantity: number;
  averageCostPrice: number;
  totalInvestedCost: number;
  currentPrice: number | null;
  marketValue: number | null;
  unrealizedPnl: number | null;
  unrealizedPnlPct: number | null;
  realizedPnl: number;
  isExternalTracked: boolean;
  updatedAt: string;
}

export interface PortfolioSummary {
  totalInvested: number;
  currentMarketValue: number | null;
  totalUnrealizedPnl: number | null;
  totalUnrealizedPnlPct: number | null;
  totalRealizedPnl: number;
  activeHoldingsCount: number;
  unpricedHoldingsCount: number;
  ownershipScope: "personal" | "family_all" | "applicant" | "external";
}

export interface CapitalBreakdown {
  availableBankCash: number;
  encumberedIpoLiens: number;
  totalDeployedInvestments: number;
  totalLiquidAndEncumberedCash: number;
  currency: string;
  isInitialized: boolean;
}

export interface ReconciliationDiscrepancy {
  type: "trial_balance_mismatch" | "position_quantity_mismatch" | "ghost_allotment" | "hanging_lien";
  severity: "high" | "critical" | "warning";
  entityId: string;
  description: string;
  details: Record<string, unknown>;
}

export interface ReconciliationReport {
  timestamp: string;
  isBalanced: boolean;
  totalDebits: number;
  totalCredits: number;
  discrepancies: ReconciliationDiscrepancy[];
}
