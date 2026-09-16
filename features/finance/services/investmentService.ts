/**
 * Investment & Securities Pipeline Service
 * Converts Phase 4 allotment & mandate events into authoritative double-entry journals,
 * securities master entries, and portfolio positions.
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { postJournalEntry } from "./journalService";
import { getAccountByCode, ensureUserChartOfAccounts } from "./chartOfAccountsService";
import { FundingOwnerType } from "../types/finance.types";
import { EventLedgerService } from "./eventLedgerService";
import { SecurityResolver } from "./securityResolver";
import { DecimalPrecision } from "../utils/decimalPrecision";
import { AllotmentVerifiedEvent } from "@/features/application/types/domainEventTypes";

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

/**
 * Recalculates and materializes portfolio position strictly derived from:
 * position = sum(all valid investment transactions)
 * Enforces high-precision DecimalPrecision calculation.
 */
export async function recalculateDerivedPortfolioPosition(params: {
  userId: string;
  applicantId: string | null;
  securityId: string;
  isExternalTracked?: boolean;
}): Promise<{ netQuantity: number; totalInvestedCost: number; averageCostPrice: number }> {
  const admin = createAdminClient();
  let query = admin
    .from("investment_transactions")
    .select("id, transaction_type, quantity, gross_amount, fees, notes")
    .eq("user_id", params.userId)
    .eq("security_id", params.securityId);

  if (params.applicantId) {
    query = query.eq("applicant_id", params.applicantId);
  } else {
    query = query.is("applicant_id", null);
  }

  const { data: txs, error } = await query;
  if (error || !txs) {
    throw new Error(`Failed to query investment transactions for position recalculation: ${error?.message}`);
  }

  let netQuantity = 0;
  let totalCost = 0;

  for (const tx of txs) {
    const isOutflow =
      tx.transaction_type === "secondary_sale" ||
      (tx.transaction_type === "split_adjustment" &&
        (tx.notes?.includes("adjustment_direction=negative") || tx.notes?.includes("-")));

    if (isOutflow) {
      netQuantity = DecimalPrecision.subtract(netQuantity, tx.quantity);
      totalCost = DecimalPrecision.subtract(totalCost, tx.gross_amount);
    } else {
      netQuantity = DecimalPrecision.add(netQuantity, tx.quantity);
      totalCost = DecimalPrecision.add(totalCost, tx.gross_amount, tx.fees || 0);
    }
  }

  const averageCostPrice = netQuantity > 0 ? DecimalPrecision.divide(totalCost, netQuantity) : 0;

  // Materialize into portfolio_positions
  let posQuery = admin
    .from("portfolio_positions")
    .select("id")
    .eq("user_id", params.userId)
    .eq("security_id", params.securityId);

  if (params.applicantId) {
    posQuery = posQuery.eq("applicant_id", params.applicantId);
  } else {
    posQuery = posQuery.is("applicant_id", null);
  }

  const { data: existingPos } = await posQuery.maybeSingle();

  if (existingPos) {
    await admin
      .from("portfolio_positions")
      .update({
        quantity: Math.max(0, Math.round(netQuantity)),
        total_invested_cost: totalCost,
        average_cost_price: averageCostPrice,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", existingPos.id);
  } else {
    await admin.from("portfolio_positions").insert({
      user_id: params.userId,
      applicant_id: params.applicantId,
      security_id: params.securityId,
      quantity: Math.max(0, Math.round(netQuantity)),
      average_cost_price: averageCostPrice,
      total_invested_cost: totalCost,
      realized_pnl: 0,
      is_external_tracked: params.isExternalTracked ?? false,
    } as never);
  }

  return { netQuantity, totalInvestedCost: totalCost, averageCostPrice };
}

/**
 * Phase 10 / Stage 5A: Canonical Allotment Verified Financial Processing.
 * Implements decoupled 3-phase execution:
 * Tx1: Atomic lease claim via EventLedgerService
 * Tx2: Isolated financial mutation (double-entry journal, investment transaction, derived position)
 * Tx3: Decoupled finalization (PROCESSED or FAILED)
 */
export async function processAllotmentVerifiedFinancialEvent(
  event: AllotmentVerifiedEvent,
  options?: { ownerId?: string; leaseDurationMs?: number }
): Promise<{
  success: boolean;
  status: "PROCESSED" | "ALREADY_PROCESSED" | "LOCKED_BY_OTHER" | "FAILED";
  transactionId?: string;
  adjustmentId?: string;
  errorCode?: string;
  errorMessage?: string;
}> {
  const admin = createAdminClient();

  // 1. Phase 1: Atomic lease claim in processed_domain_events
  const claim = await EventLedgerService.claimEventLease({
    eventId: event.eventId,
    idempotencyKey: event.idempotencyKey,
    eventType: event.eventType,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    ownerId: options?.ownerId,
    leaseDurationMs: options?.leaseDurationMs,
  });

  if (claim.status === "ALREADY_PROCESSED") {
    return { success: true, status: "ALREADY_PROCESSED" };
  }

  if (claim.status === "LOCKED_BY_OTHER") {
    return {
      success: false,
      status: "LOCKED_BY_OTHER",
      errorMessage: `Event ${event.eventId} is actively locked by worker ${claim.ownerId} until ${claim.expiresAt}`,
    };
  }

  if (claim.status !== "CLAIMED") {
    return { success: false, status: "FAILED", errorMessage: claim.reason };
  }

  // 2. Phase 2: Isolated financial operation
  try {
    // 2A. Query Application Details
    const { data: rawApp, error: appErr } = await admin
      .from("ipo_applications")
      .select("id, user_id, applicant_id, ipo_id, application_amount, blocked_amount, refund_amount")
      .eq("id", event.payload.applicationId)
      .single();

    if (appErr || !rawApp) {
      throw new Error(`Target application ${event.payload.applicationId} not found: ${appErr?.message}`);
    }

    const app = rawApp as {
      id: string;
      user_id: string;
      applicant_id: string | null;
      ipo_id: string;
      application_amount: number;
      blocked_amount: number | null;
      refund_amount: number | null;
    };

    // 2B. Resolve Security (Guardrail 4: Deterministic 4-step hierarchy, halt on ambiguity)
    const secRes = await SecurityResolver.resolve({ ipoId: event.payload.ipoId });
    if (!secRes.success) {
      await EventLedgerService.markEventFailed({
        eventId: event.eventId,
        errorCode: "AMBIGUOUS_SECURITY",
        errorMessage: secRes.reason,
      });
      return {
        success: false,
        status: "FAILED",
        errorCode: "AMBIGUOUS_SECURITY",
        errorMessage: secRes.reason,
      };
    }

    const security = secRes.security;
    const sharesAllotted = event.payload.sharesAllotted;
    const allotmentPrice = event.payload.allotmentPrice;
    const grossAmount = DecimalPrecision.multiply(sharesAllotted, allotmentPrice);
    const reportedRefund = event.payload.reportedRefundAmount || 0;

    // If zero shares allotted:
    if (sharesAllotted <= 0) {
      if (reportedRefund > 0) {
        await handleFundsUnblockedEvent({
          userId: app.user_id,
          applicationId: app.id,
          applicantId: app.applicant_id,
          unblockedAmount: reportedRefund,
        });
      }
      await EventLedgerService.markEventProcessed({
        eventId: event.eventId,
        resultSummary: {
          status: "not_allotted",
          refundAmount: reportedRefund,
          securityId: security.id,
        },
      });
      return { success: true, status: "PROCESSED" };
    }

    // 2C. Check for previous allotment transaction on this application
    const { data: existingTxs } = await admin
      .from("investment_transactions")
      .select("*")
      .eq("application_id", app.id)
      .eq("transaction_type", "ipo_allotment")
      .order("created_at", { ascending: true });

    let finalTransactionId: string | undefined;
    let finalAdjustmentId: string | undefined;

    if (!existingTxs || existingTxs.length === 0) {
      // 2D-1: First allotment delivery
      await ensureUserChartOfAccounts(app.user_id);
      const availableAcc = await getAccountByCode(app.user_id, "1010");
      const lienAcc = await getAccountByCode(app.user_id, "1020");
      const equityAcc = await getAccountByCode(app.user_id, "1110");

      if (!availableAcc || !lienAcc || !equityAcc) {
        throw new Error("Required financial accounts not found for user.");
      }

      const journalLines = [
        {
          accountId: equityAcc.id,
          applicantId: app.applicant_id,
          debit: grossAmount,
          credit: 0,
          lineNarration: `Acquisition of ${sharesAllotted} shares @ ₹${allotmentPrice}`,
        },
        {
          accountId: lienAcc.id,
          applicantId: app.applicant_id,
          debit: 0,
          credit: grossAmount,
          lineNarration: "ASBA lien cleared by registrar allotment debit",
        },
      ];

      if (reportedRefund > 0) {
        journalLines.push(
          {
            accountId: availableAcc.id,
            applicantId: app.applicant_id,
            debit: reportedRefund,
            credit: 0,
            lineNarration: "Unallotted ASBA funds restored to available cash",
          },
          {
            accountId: lienAcc.id,
            applicantId: app.applicant_id,
            debit: 0,
            credit: reportedRefund,
            lineNarration: "Surplus ASBA lien released",
          }
        );
      }

      const journalRes = await postJournalEntry({
        userId: app.user_id,
        idempotencyKey: `journal:${event.idempotencyKey}`,
        journalType: "ipo_allotment_debit",
        referenceType: "ipo_application",
        referenceId: app.id,
        narration: `Allotment settlement: ${sharesAllotted} shares allotted @ ₹${allotmentPrice}.`,
        lines: journalLines,
        metadata: {
          applicationId: app.id,
          allotmentId: event.payload.allotmentId,
          sharesAllotted,
          allotmentPrice,
          grossAmount,
          reportedRefund,
        },
      });

      if (!journalRes.success && !journalRes.isDuplicate) {
        throw new Error(journalRes.error || "Failed to post allotment journal.");
      }

      const { data: newTx, error: txErr } = await admin
        .from("investment_transactions")
        .insert({
          user_id: app.user_id,
          applicant_id: app.applicant_id,
          security_id: security.id,
          application_id: app.id,
          journal_id: journalRes.journalId || null,
          idempotency_key: event.idempotencyKey,
          transaction_type: "ipo_allotment",
          funding_owner_type: "user_personal",
          transaction_date: event.timestamp || new Date().toISOString(),
          quantity: sharesAllotted,
          price_per_share: allotmentPrice,
          gross_amount: grossAmount,
          fees: 0,
          net_amount: grossAmount,
          notes: `IPO Allotment from Application #${app.id.slice(0, 8)}`,
        } as never)
        .select("id")
        .single();

      if (txErr || !newTx) {
        throw new Error(`Failed to insert investment transaction: ${txErr?.message}`);
      }

      finalTransactionId = (newTx as { id: string }).id;
    } else {
      // 2D-2: Correction / Adjustment Model (Guardrail 2: Deterministic Adjustment Idempotency)
      const primaryTx = existingTxs[0] as {
        id: string;
        quantity: number;
        price_per_share: number;
        gross_amount: number;
      };

      const previousQty = primaryTx.quantity;
      const deltaQty = DecimalPrecision.subtract(sharesAllotted, previousQty);

      if (deltaQty !== 0) {
        // Deterministic adjustment identity
        const adjustmentKey = `ALLOTMENT_ADJUSTMENT:${app.id}:${primaryTx.id}:${event.payload.allotmentId}`;

        // Check if adjustment already posted
        const { data: existingAdj } = await admin
          .from("investment_transactions")
          .select("id")
          .eq("idempotency_key", adjustmentKey)
          .maybeSingle();

        if (existingAdj) {
          finalAdjustmentId = (existingAdj as { id: string }).id;
        } else {
          const absDeltaQty = Math.abs(deltaQty);
          const adjGrossAmount = DecimalPrecision.multiply(absDeltaQty, allotmentPrice);

          // Post adjustment journal
          await ensureUserChartOfAccounts(app.user_id);
          const availableAcc = await getAccountByCode(app.user_id, "1010");
          const lienAcc = await getAccountByCode(app.user_id, "1020");
          const equityAcc = await getAccountByCode(app.user_id, "1110");

          if (availableAcc && lienAcc && equityAcc) {
            const adjLines =
              deltaQty < 0
                ? [
                    {
                      accountId: availableAcc.id,
                      applicantId: app.applicant_id,
                      debit: adjGrossAmount,
                      credit: 0,
                      lineNarration: `Reversal of over-allotted equity restored to cash`,
                    },
                    {
                      accountId: equityAcc.id,
                      applicantId: app.applicant_id,
                      debit: 0,
                      credit: adjGrossAmount,
                      lineNarration: `Equity adjustment reduction for ${absDeltaQty} shares`,
                    },
                  ]
                : [
                    {
                      accountId: equityAcc.id,
                      applicantId: app.applicant_id,
                      debit: adjGrossAmount,
                      credit: 0,
                      lineNarration: `Additional equity allotment of ${absDeltaQty} shares`,
                    },
                    {
                      accountId: lienAcc.id,
                      applicantId: app.applicant_id,
                      debit: 0,
                      credit: adjGrossAmount,
                      lineNarration: `Lien cleared for additional allotment shares`,
                    },
                  ];

            await postJournalEntry({
              userId: app.user_id,
              idempotencyKey: `journal:${adjustmentKey}`,
              journalType: "manual_adjustment",
              referenceType: "ipo_application",
              referenceId: app.id,
              narration: `Allotment adjustment: ${previousQty} shares corrected to ${sharesAllotted} (delta: ${deltaQty}).`,
              lines: adjLines,
              metadata: {
                applicationId: app.id,
                previousQuantity: previousQty,
                correctedQuantity: sharesAllotted,
                deltaQuantity: deltaQty,
              },
            });
          }

          // Insert adjustment investment transaction
          const { data: adjTx, error: adjTxErr } = await admin
            .from("investment_transactions")
            .insert({
              user_id: app.user_id,
              applicant_id: app.applicant_id,
              security_id: security.id,
              application_id: app.id,
              idempotency_key: adjustmentKey,
              transaction_type: "split_adjustment",
              funding_owner_type: "user_personal",
              transaction_date: event.timestamp || new Date().toISOString(),
              quantity: absDeltaQty,
              price_per_share: allotmentPrice,
              gross_amount: adjGrossAmount,
              fees: 0,
              net_amount: adjGrossAmount,
              notes: `ALLOTMENT_ADJUSTMENT: ${previousQty} -> ${sharesAllotted} shares; adjustment_direction=${deltaQty < 0 ? "negative" : "positive"}`,
            } as never)
            .select("id")
            .single();

          if (adjTxErr || !adjTx) {
            throw new Error(`Failed to insert adjustment transaction: ${adjTxErr?.message}`);
          }

          finalAdjustmentId = (adjTx as { id: string }).id;
        }
      }
      finalTransactionId = primaryTx.id;
    }

    // 2E. Recalculate Portfolio Position derived from ALL valid transactions
    await recalculateDerivedPortfolioPosition({
      userId: app.user_id,
      applicantId: app.applicant_id,
      securityId: security.id,
    });

    // 3. Phase 3: Decoupled finalization (PROCESSED)
    await EventLedgerService.markEventProcessed({
      eventId: event.eventId,
      resultSummary: {
        transactionId: finalTransactionId,
        adjustmentId: finalAdjustmentId,
        sharesAllotted,
        securityId: security.id,
      },
    });

    return {
      success: true,
      status: "PROCESSED",
      transactionId: finalTransactionId,
      adjustmentId: finalAdjustmentId,
    };
  } catch (err: any) {
    // 4. Phase 3 Failure: Rollback occurs; persist failure separately
    console.error(`[processAllotmentVerifiedFinancialEvent] Financial operation failed for event ${event.eventId}:`, err);
    await EventLedgerService.markEventFailed({
      eventId: event.eventId,
      errorCode: "FINANCIAL_PROCESSING_FAILED",
      errorMessage: err.message || "Unknown financial processing failure",
    });

    return {
      success: false,
      status: "FAILED",
      errorCode: "FINANCIAL_PROCESSING_FAILED",
      errorMessage: err.message || "Unknown financial processing failure",
    };
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

  /**
   * Stage 5 Canonical Entrypoint for verified allotment events.
   */
  static async processAllotmentVerifiedFinancialEvent(
    event: AllotmentVerifiedEvent,
    options?: { ownerId?: string; leaseDurationMs?: number }
  ) {
    return processAllotmentVerifiedFinancialEvent(event, options);
  }
}

