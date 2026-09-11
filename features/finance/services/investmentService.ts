/**
 * Investment & Securities Pipeline Service
 * Converts Phase 4 allotment & mandate events into authoritative double-entry journals,
 * securities master entries, and portfolio positions.
 */

import { createClient } from "@/lib/supabase/server";
import { postJournalEntry } from "./journalService";
import { getAccountByCode, ensureUserChartOfAccounts } from "./chartOfAccountsService";
import { FundingOwnerType } from "../types/finance.types";

/**
 * Handles the 'funds_blocked' domain event.
 * Reclassifies funds from Available to IPO Lien if funded by user.
 */
export async function handleFundsBlockedEvent(params: {
  userId: string;
  applicationId: string;
  applicantId: string;
  blockedAmount: number;
  fundingOwnerType?: FundingOwnerType;
}): Promise<{ success: boolean; journalId?: string; error?: string }> {
  const { userId, applicationId, applicantId, blockedAmount, fundingOwnerType = "user_personal" } = params;

  if (blockedAmount <= 0) {
    return { success: true }; // Nothing to reclassify
  }

  // If tracking-only (e.g. friend's external application), do not touch user's bank ledger
  if (fundingOwnerType === "external_tracked") {
    return { success: true };
  }

  await ensureUserChartOfAccounts(userId);

  const availableAcc = await getAccountByCode(userId, "1010");
  const lienAcc = await getAccountByCode(userId, "1020");

  if (!availableAcc || !lienAcc) {
    return { success: false, error: "Standard bank accounts not found for user." };
  }

  const idempotencyKey = `phase4:app:${applicationId}:mandate:block`;

  return postJournalEntry({
    userId,
    idempotencyKey,
    journalType: "ipo_funds_blocked",
    referenceType: "ipo_application",
    referenceId: applicationId,
    narration: `ASBA mandate hold placed for IPO Application #${applicationId.slice(0, 8)}.`,
    lines: [
      {
        accountId: lienAcc.id,
        applicantId,
        debit: blockedAmount,
        credit: 0,
        lineNarration: "Funds encumbered under bank lien for IPO mandate",
      },
      {
        accountId: availableAcc.id,
        applicantId,
        debit: 0,
        credit: blockedAmount,
        lineNarration: "Available cash reduced by ASBA lien",
      },
    ],
    metadata: {
      applicationId,
      applicantId,
      fundingOwnerType,
      blockedAmount,
    },
  });
}

/**
 * Handles the 'allotment_recorded' domain event.
 * Ensures security master existence, creates investment transaction, updates holding position,
 * and executes General Ledger debit from lien to equity.
 */
export async function handleAllotmentRecordedEvent(params: {
  userId: string;
  applicationId: string;
  allotmentId: string;
  ipoId: string;
  applicantId?: string | null;
  sharesAllotted: number;
  allotmentPrice: number;
  allotmentAmount: number;
  refundAmount: number;
  fundingOwnerType?: FundingOwnerType;
}): Promise<{ success: boolean; transactionId?: string; error?: string }> {
  const {
    userId,
    applicationId,
    allotmentId,
    ipoId,
    applicantId = null,
    sharesAllotted,
    allotmentPrice,
    allotmentAmount,
    refundAmount,
    fundingOwnerType = "user_personal",
  } = params;

  if (sharesAllotted <= 0) {
    // If zero shares allotted, handle potential unblock/refund
    if (refundAmount > 0) {
      await handleFundsUnblockedEvent({
        userId,
        applicationId,
        applicantId,
        unblockedAmount: refundAmount,
        fundingOwnerType,
      });
    }
    return { success: true };
  }

  const supabase = await createClient();

  // 1. Resolve or Create Security in securities master
  let securityId: string;
  const { data: existingSec } = await supabase
    .from("securities")
    .select("id")
    .eq("ipo_id", ipoId)
    .maybeSingle();

  if (existingSec) {
    securityId = (existingSec as unknown as { id: string }).id;
  } else {
    // Fetch IPO details to populate security master
    const { data: rawIpo } = await supabase
      .from("ipos")
      .select("company_name, symbol, lot_size, face_value")
      .eq("id", ipoId)
      .single();

    const ipo = rawIpo as unknown as {
      company_name: string;
      symbol: string | null;
      lot_size: number;
      face_value: number | null;
    } | null;

    if (!ipo) {
      return { success: false, error: "Target IPO not found to create security master." };
    }

    const cleanSymbol = (ipo.symbol || ipo.company_name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10)).toUpperCase();

    const { data: newSec, error: secErr } = await supabase
      .from("securities")
      .insert({
        ipo_id: ipoId,
        symbol: cleanSymbol,
        exchange: "NSE",
        company_name: ipo.company_name,
        face_value: ipo.face_value,
        lot_size: ipo.lot_size || 1,
      } as never)
      .select("id")
      .single();

    if (secErr || !newSec) {
      return { success: false, error: `Failed to create security record: ${secErr?.message}` };
    }

    securityId = (newSec as unknown as { id: string }).id;
  }

  const isExternalTracked = fundingOwnerType === "external_tracked";
  const txIdempotencyKey = `phase4:app:${applicationId}:allotment:${allotmentId}`;

  // 2. Post General Ledger Entry if user bank was involved
  let journalId: string | null = null;

  if (!isExternalTracked && allotmentAmount > 0) {
    await ensureUserChartOfAccounts(userId);
    const availableAcc = await getAccountByCode(userId, "1010");
    const lienAcc = await getAccountByCode(userId, "1020");
    const equityAcc = await getAccountByCode(userId, "1110");

    if (!availableAcc || !lienAcc || !equityAcc) {
      return { success: false, error: "Required financial accounts not found." };
    }

    const journalLines = [
      {
        accountId: equityAcc.id,
        applicantId,
        debit: allotmentAmount,
        credit: 0,
        lineNarration: `Acquisition of ${sharesAllotted} shares @ ₹${allotmentPrice}`,
      },
      {
        accountId: lienAcc.id,
        applicantId,
        debit: 0,
        credit: allotmentAmount,
        lineNarration: "ASBA lien cleared by registrar allotment debit",
      },
    ];

    // If surplus refund/unblock is occurring alongside partial allotment
    if (refundAmount > 0) {
      journalLines.push(
        {
          accountId: availableAcc.id,
          applicantId,
          debit: refundAmount,
          credit: 0,
          lineNarration: `Unallotted ASBA funds restored to available cash`,
        },
        {
          accountId: lienAcc.id,
          applicantId,
          debit: 0,
          credit: refundAmount,
          lineNarration: `Surplus ASBA lien released`,
        }
      );
    }

    const journalRes = await postJournalEntry({
      userId,
      idempotencyKey: `phase4:app:${applicationId}:allotment_debit:${allotmentId}`,
      journalType: "ipo_allotment_debit",
      referenceType: "ipo_application",
      referenceId: applicationId,
      narration: `Allotment settlement: ${sharesAllotted} shares allotted @ ₹${allotmentPrice}.`,
      lines: journalLines,
      metadata: {
        applicationId,
        allotmentId,
        sharesAllotted,
        allotmentPrice,
        allotmentAmount,
        refundAmount,
      },
    });

    if (!journalRes.success) {
      return { success: false, error: journalRes.error || "Failed to post allotment journal." };
    }

    journalId = journalRes.journalId || null;
  }

  // 3. Create Investment Transaction (Idempotent)
  const { data: existingTx } = await supabase
    .from("investment_transactions")
    .select("id")
    .eq("idempotency_key", txIdempotencyKey)
    .maybeSingle();

  let transactionId: string;

  if (existingTx) {
    transactionId = (existingTx as unknown as { id: string }).id;
  } else {
    const { data: createdTx, error: txErr } = await supabase
      .from("investment_transactions")
      .insert({
        user_id: userId,
        applicant_id: applicantId,
        security_id: securityId,
        application_id: applicationId,
        journal_id: journalId,
        idempotency_key: txIdempotencyKey,
        transaction_type: "ipo_allotment",
        funding_owner_type: fundingOwnerType,
        transaction_date: new Date().toISOString(),
        quantity: sharesAllotted,
        price_per_share: allotmentPrice,
        gross_amount: allotmentAmount,
        fees: 0,
        net_amount: allotmentAmount,
        notes: `IPO Allotment from Application #${applicationId.slice(0, 8)}`,
      } as never)
      .select("id")
      .single();

    if (txErr || !createdTx) {
      return { success: false, error: `Failed to record investment transaction: ${txErr?.message}` };
    }

    transactionId = (createdTx as unknown as { id: string }).id;

    // 4. Update Portfolio Position
    await updatePortfolioPositionFromTransaction(
      userId,
      applicantId,
      securityId,
      sharesAllotted,
      allotmentAmount,
      isExternalTracked
    );
  }

  return { success: true, transactionId };
}

/**
 * Handles the 'funds_unblocked' domain event.
 * Restores remaining lien funds to available bank cash.
 */
export async function handleFundsUnblockedEvent(params: {
  userId: string;
  applicationId: string;
  applicantId?: string | null;
  unblockedAmount: number;
  fundingOwnerType?: FundingOwnerType;
}): Promise<{ success: boolean; journalId?: string; error?: string }> {
  const { userId, applicationId, applicantId = null, unblockedAmount, fundingOwnerType = "user_personal" } = params;

  if (unblockedAmount <= 0 || fundingOwnerType === "external_tracked") {
    return { success: true };
  }

  await ensureUserChartOfAccounts(userId);

  const availableAcc = await getAccountByCode(userId, "1010");
  const lienAcc = await getAccountByCode(userId, "1020");

  if (!availableAcc || !lienAcc) {
    return { success: false, error: "Standard bank accounts not found." };
  }

  const idempotencyKey = `phase4:app:${applicationId}:mandate:unblock`;

  return postJournalEntry({
    userId,
    idempotencyKey,
    journalType: "ipo_funds_unblocked",
    referenceType: "ipo_application",
    referenceId: applicationId,
    narration: `ASBA lien of ₹${unblockedAmount} released back to available cash.`,
    lines: [
      {
        accountId: availableAcc.id,
        applicantId,
        debit: unblockedAmount,
        credit: 0,
        lineNarration: "Unblocked ASBA funds restored to available cash",
      },
      {
        accountId: lienAcc.id,
        applicantId,
        debit: 0,
        credit: unblockedAmount,
        lineNarration: "ASBA lien dissolved by bank",
      },
    ],
    metadata: {
      applicationId,
      applicantId,
      unblockedAmount,
    },
  });
}

/**
 * Materializes or updates a portfolio position from an allotment transaction.
 */
async function updatePortfolioPositionFromTransaction(
  userId: string,
  applicantId: string | null,
  securityId: string,
  quantityDelta: number,
  costDelta: number,
  isExternalTracked: boolean
): Promise<void> {
  const supabase = await createClient();

  // Look up existing position
  let query = supabase
    .from("portfolio_positions")
    .select("id, quantity, total_invested_cost")
    .eq("user_id", userId)
    .eq("security_id", securityId);

  if (applicantId) {
    query = query.eq("applicant_id", applicantId);
  } else {
    query = query.is("applicant_id", null);
  }

  const { data: existingPos } = await query.maybeSingle();

  if (existingPos) {
    const posRecord = existingPos as unknown as { id: string; quantity: number; total_invested_cost: number };
    const newQty = posRecord.quantity + quantityDelta;
    const newCost = posRecord.total_invested_cost + costDelta;
    const newAvg = newQty > 0 ? Math.round((newCost / newQty) * 100) / 100 : 0;

    await supabase
      .from("portfolio_positions")
      .update({
        quantity: newQty,
        total_invested_cost: newCost,
        average_cost_price: newAvg,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", posRecord.id);
  } else {
    const avgPrice = quantityDelta > 0 ? Math.round((costDelta / quantityDelta) * 100) / 100 : 0;

    await supabase.from("portfolio_positions").insert({
      user_id: userId,
      applicant_id: applicantId,
      security_id: securityId,
      quantity: quantityDelta,
      average_cost_price: avgPrice,
      total_invested_cost: costDelta,
      realized_pnl: 0,
      is_external_tracked: isExternalTracked,
    } as never);
  }
}

export class InvestmentService {
  static async handleFundsBlockedEvent(params: {
    eventId?: string;
    userId: string;
    applicationId: string;
    applicantId: string;
    amount?: number;
    blockedAmount?: number;
    blockedDate?: string;
    fundingOwnerType?: FundingOwnerType;
  }) {
    return handleFundsBlockedEvent({
      userId: params.userId,
      applicationId: params.applicationId,
      applicantId: params.applicantId,
      blockedAmount: params.blockedAmount ?? params.amount ?? 0,
      fundingOwnerType: params.fundingOwnerType,
    });
  }

  static async handleAllotmentRecordedEvent(params: {
    eventId?: string;
    userId: string;
    applicationId: string;
    applicantId?: string | null;
    ipoId: string;
    allotmentId?: string;
    allotmentStatus?: "allotted" | "partially_allotted" | "not_allotted";
    sharesAllotted: number;
    allotmentPrice: number;
    amountBlocked?: number;
    allotmentDate?: string;
    fundingOwnerType?: FundingOwnerType;
  }) {
    const sharesAllotted = params.sharesAllotted || 0;
    const allotmentPrice = params.allotmentPrice || 0;
    const allotmentAmount = Math.round(sharesAllotted * allotmentPrice * 100) / 100;
    const amountBlocked = params.amountBlocked || allotmentAmount;
    const refundAmount = Math.max(0, Math.round((amountBlocked - allotmentAmount) * 100) / 100);

    return handleAllotmentRecordedEvent({
      userId: params.userId,
      applicationId: params.applicationId,
      applicantId: params.applicantId,
      allotmentId: params.allotmentId || `allot_${params.applicationId}`,
      ipoId: params.ipoId,
      sharesAllotted,
      allotmentPrice,
      allotmentAmount,
      refundAmount,
      fundingOwnerType: params.fundingOwnerType,
    });
  }

  static async handleFundsUnblockedEvent(params: {
    eventId?: string;
    userId: string;
    applicationId: string;
    applicantId: string;
    refundAmount: number;
    unblockedDate?: string;
    fundingOwnerType?: FundingOwnerType;
  }) {
    return handleFundsUnblockedEvent({
      userId: params.userId,
      applicationId: params.applicationId,
      applicantId: params.applicantId,
      unblockedAmount: params.refundAmount,
      fundingOwnerType: params.fundingOwnerType,
    });
  }
}

