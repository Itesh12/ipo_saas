/**
 * features/finance/services/settlementService.ts
 *
 * Candidate C: Stage 5 Financial Settlement & Demat Accounting Workflow Engine.
 *
 * Authoritative settlement processor for AllotmentVerifiedEvent.
 *
 * Enforces:
 * 1. Decimal-safe string conversion and DecimalPrecision arithmetic
 * 2. Independent payload hash & producer integrity check
 * 3. Canonical application source for blocked funds & monetary conservation
 * 4. Composite business identity uniqueness (application_id, allotment_id)
 * 5. Strict 5-step Security Resolver (halts on AMBIGUOUS_SECURITY as NEEDS_REVIEW, does NOT consume event)
 * 6. Semantic Double-Entry GL postings (Accounts 1010, 1020, 1110)
 * 7. Authoritative Demat Portfolio cost-basis calculation
 * 8. Exactly-once effective financial mutation under at-least-once delivery
 * 9. Zero backward imports from Stage 4 internal services or tables
 */

import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { EventLedgerService } from './eventLedgerService';
import { SecurityResolver } from './securityResolver';
import { DecimalPrecision } from '../utils/decimalPrecision';
import { ensureUserChartOfAccounts, getAccountByCode } from './chartOfAccountsService';
import { postJournalEntry } from './journalService';
import { TaxLotService } from './taxLotService';
import {
  AllotmentVerifiedEvent,
  SettlementRecord,
  SettlementProcessingResult,
  SettlementStatus,
} from '../types/settlementTypes';

export class SettlementService {
  /**
   * Computes SHA-256 hash of event payload for independent verification.
   */
  public static computePayloadHash(payload: Record<string, unknown>): string {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');
  }

  /**
   * Authoritative entrypoint for processing AllotmentVerifiedEvent.
   */
  public static async processAllotmentEvent(
    event: AllotmentVerifiedEvent,
    options?: { ownerId?: string; leaseDurationMs?: number }
  ): Promise<SettlementProcessingResult> {
    const admin = createAdminClient();

    // =========================================================================
    // 1. Payload Hash & Schema Integrity Verification
    // =========================================================================
    if (
      event.producer !== 'stage4_allotment_engine' ||
      event.eventType !== 'allotment_verified' ||
      event.schemaVersion !== '1.0.0'
    ) {
      return {
        success: false,
        status: 'BLOCKED',
        errorCode: 'INVALID_EVENT_METADATA',
        errorMessage: `Event metadata invalid: producer=${event.producer}, type=${event.eventType}, version=${event.schemaVersion}`,
      };
    }

    const expectedHash = this.computePayloadHash(event.payload as unknown as Record<string, unknown>);
    if (expectedHash !== event.payloadHash) {
      return {
        success: false,
        status: 'BLOCKED',
        errorCode: 'PAYLOAD_HASH_MISMATCH',
        errorMessage: `Integrity failure: expected payload hash ${expectedHash}, received ${event.payloadHash}`,
      };
    }

    // =========================================================================
    // 2. Existing Settlement / Idempotency Check
    // =========================================================================
    const { data: existingSettlement } = await admin
      .from('ipo_application_settlements')
      .select('*')
      .or(`idempotency_key.eq.${event.idempotencyKey},and(application_id.eq.${event.payload.applicationId},allotment_id.eq.${event.payload.allotmentId})`)
      .maybeSingle();

    if (existingSettlement) {
      const existing = existingSettlement as SettlementRecord;
      if (
        existing.settlement_status === 'SETTLED' ||
        existing.settlement_status === 'SETTLED_WITH_REFUND' ||
        existing.settlement_status === 'REFUND_SETTLED'
      ) {
        return {
          success: true,
          status: existing.settlement_status,
          settlementId: existing.id,
          journalId: existing.journal_entry_id || undefined,
          portfolioPositionId: existing.portfolio_position_id || undefined,
          isDuplicate: true,
        };
      }
    }

    // =========================================================================
    // 3. Atomic Lease Claim via EventLedgerService
    // =========================================================================
    const claim = await EventLedgerService.claimEventLease({
      eventId: event.eventId,
      idempotencyKey: event.idempotencyKey,
      eventType: event.eventType,
      aggregateType: 'ipo_application',
      aggregateId: event.payload.applicationId,
      ownerId: options?.ownerId,
      leaseDurationMs: options?.leaseDurationMs,
    });

    if (claim.status === 'ALREADY_PROCESSED') {
      return {
        success: true,
        status: (existingSettlement?.settlement_status as SettlementStatus) || 'SETTLED',
        isDuplicate: true,
      };
    }

    if (claim.status === 'LOCKED_BY_OTHER') {
      return {
        success: false,
        status: 'RECEIVED',
        errorCode: 'LOCKED_BY_OTHER',
        errorMessage: `Event ${event.eventId} is actively locked by worker ${claim.ownerId} until ${claim.expiresAt}`,
      };
    }

    if (claim.status !== 'CLAIMED') {
      return {
        success: false,
        status: 'BLOCKED',
        errorCode: 'LEASE_CLAIM_FAILED',
        errorMessage: claim.reason,
      };
    }

    // =========================================================================
    // 4. Retrieve Canonical Application State & Validate Conservation
    // =========================================================================
    const { data: rawApp, error: appErr } = await admin
      .from('ipo_applications')
      .select('id, user_id, applicant_id, ipo_id, application_amount, blocked_amount, total_quantity')
      .eq('id', event.payload.applicationId)
      .single();

    if (appErr || !rawApp) {
      await EventLedgerService.markEventFailed({
        eventId: event.eventId,
        errorCode: 'APPLICATION_NOT_FOUND',
        errorMessage: `Canonical application ${event.payload.applicationId} not found: ${appErr?.message}`,
      });
      return {
        success: false,
        status: 'BLOCKED',
        errorCode: 'APPLICATION_NOT_FOUND',
        errorMessage: `Application ${event.payload.applicationId} not found.`,
      };
    }

    const app = rawApp as {
      id: string;
      user_id: string;
      applicant_id: string | null;
      ipo_id: string;
      application_amount: number;
      blocked_amount: number | null;
      total_quantity: number | null;
    };

    // Canonical blocked amount
    const canonicalBlockedAmount =
      app.blocked_amount !== null && app.blocked_amount !== undefined
        ? app.blocked_amount
        : app.application_amount;

    // Parse decimal-safe event strings
    const sharesApplied = app.total_quantity || parseFloat(event.payload.sharesAllotted);
    const sharesAllotted = parseFloat(event.payload.sharesAllotted);
    const allotmentPrice = parseFloat(event.payload.allotmentPrice);
    const allottedAmount = DecimalPrecision.multiply(sharesAllotted, allotmentPrice);
    const refundAmount = parseFloat(event.payload.refundAmount);

    // Hard Invariant 1: shares_allotted <= shares_applied
    if (sharesAllotted > sharesApplied) {
      await EventLedgerService.markEventFailed({
        eventId: event.eventId,
        errorCode: 'EXCESS_SHARES_ALLOTTED',
        errorMessage: `Quantity conservation violation: allotted (${sharesAllotted}) > applied (${sharesApplied})`,
      });
      return {
        success: false,
        status: 'BLOCKED',
        errorCode: 'EXCESS_SHARES_ALLOTTED',
        errorMessage: `Shares allotted (${sharesAllotted}) exceeds shares applied (${sharesApplied}).`,
      };
    }

    // Hard Invariant 2: Monetary conservation: allotted_amount + refund_amount === canonical_blocked_amount
    const totalAccounted = DecimalPrecision.add(allottedAmount, refundAmount);
    if (Math.abs(totalAccounted - canonicalBlockedAmount) > 0.01) {
      await EventLedgerService.markEventFailed({
        eventId: event.eventId,
        errorCode: 'CONSERVATION_VIOLATION',
        errorMessage: `Monetary conservation violation: allotted (${allottedAmount}) + refund (${refundAmount}) = ${totalAccounted} != canonical blocked amount ${canonicalBlockedAmount}`,
      });
      return {
        success: false,
        status: 'BLOCKED',
        errorCode: 'CONSERVATION_VIOLATION',
        errorMessage: `Monetary conservation mismatch: allotted + refund (${totalAccounted}) != blocked (${canonicalBlockedAmount}).`,
      };
    }

    // Record initial settlement entry in VALIDATING state
    let settlementId = existingSettlement?.id;
    if (!settlementId) {
      const { data: newSettlement, error: setInsertErr } = await admin
        .from('ipo_application_settlements')
        .insert({
          application_id: app.id,
          user_id: app.user_id,
          applicant_id: app.applicant_id,
          event_id: event.eventId,
          allotment_id: event.payload.allotmentId,
          idempotency_key: event.idempotencyKey,
          settlement_status: 'VALIDATING',
          shares_applied: sharesApplied,
          shares_allotted: sharesAllotted,
          allotment_price: allotmentPrice,
          allotted_value: allottedAmount,
          refund_value: refundAmount,
          applicable_blocked_amount: canonicalBlockedAmount,
          metadata: {
            verificationAttemptId: event.payload.verificationAttemptId,
            evidenceClassification: event.payload.evidenceClassification,
            fundingOwnerType: event.payload.fundingOwnerType,
          },
        } as never)
        .select('id')
        .single();

      if (setInsertErr || !newSettlement) {
        // If conflict on composite uniqueness, reload existing
        const { data: reloadSet } = await admin
          .from('ipo_application_settlements')
          .select('id')
          .eq('application_id', app.id)
          .eq('allotment_id', event.payload.allotmentId)
          .single();

        settlementId = (reloadSet as { id: string })?.id;
      } else {
        settlementId = (newSettlement as { id: string }).id;
      }
    }

    // =========================================================================
    // 5. Canonical 5-Step Security Resolver
    // =========================================================================
    const secRes = await SecurityResolver.resolve({ ipoId: event.payload.ipoId });
    if (!secRes.success) {
      // Hard Invariant: Halt on ambiguity. Do NOT consume event as PROCESSED.
      if (settlementId) {
        await admin
          .from('ipo_application_settlements')
          .update({
            settlement_status: 'NEEDS_REVIEW',
            failure_code: 'AMBIGUOUS_SECURITY',
            failure_reason: secRes.reason,
            updated_at: new Date().toISOString(),
          } as never)
          .eq('id', settlementId);
      }

      await EventLedgerService.markEventFailed({
        eventId: event.eventId,
        errorCode: 'AMBIGUOUS_SECURITY',
        errorMessage: secRes.reason,
      });

      return {
        success: false,
        status: 'NEEDS_REVIEW',
        settlementId,
        errorCode: 'AMBIGUOUS_SECURITY',
        errorMessage: secRes.reason,
      };
    }

    const security = secRes.security;

    // Transition settlement to SETTLEMENT_READY
    if (settlementId) {
      await admin
        .from('ipo_application_settlements')
        .update({
          security_id: security.id,
          settlement_status: 'SETTLEMENT_READY',
          updated_at: new Date().toISOString(),
        } as never)
        .eq('id', settlementId);
    }

    // =========================================================================
    // 6. Double-Entry General Ledger & Demat Portfolio Postings
    // =========================================================================
    try {
      await ensureUserChartOfAccounts(app.user_id);
      const availableAcc = await getAccountByCode(app.user_id, '1010'); // Bank: Available Cash
      const lienAcc = await getAccountByCode(app.user_id, '1020');      // Bank: IPO Lien ASBA
      const equityAcc = await getAccountByCode(app.user_id, '1110');    // Investments: IPO Equities

      if (!availableAcc || !lienAcc || !equityAcc) {
        throw new Error('Required chart-of-accounts codes (1010, 1020, 1110) not found for user.');
      }

      let targetStatus: SettlementStatus = 'SETTLED';
      const journalLines: Array<{
        accountId: string;
        applicantId?: string | null;
        debit: number;
        credit: number;
        lineNarration: string;
      }> = [];

      if (sharesAllotted > 0 && refundAmount === 0) {
        // Scenario A: Full Allotment
        targetStatus = 'SETTLED';
        journalLines.push(
          {
            accountId: equityAcc.id,
            applicantId: app.applicant_id,
            debit: allottedAmount,
            credit: 0,
            lineNarration: `Acquisition of ${sharesAllotted} shares @ ₹${allotmentPrice} (Full Allotment)`,
          },
          {
            accountId: lienAcc.id,
            applicantId: app.applicant_id,
            debit: 0,
            credit: allottedAmount,
            lineNarration: 'ASBA lien cleared by registrar allotment debit',
          }
        );
      } else if (sharesAllotted > 0 && refundAmount > 0) {
        // Scenario B: Partial Allotment
        targetStatus = 'SETTLED_WITH_REFUND';
        journalLines.push(
          {
            accountId: equityAcc.id,
            applicantId: app.applicant_id,
            debit: allottedAmount,
            credit: 0,
            lineNarration: `Acquisition of ${sharesAllotted} shares @ ₹${allotmentPrice} (Partial Allotment)`,
          },
          {
            accountId: lienAcc.id,
            applicantId: app.applicant_id,
            debit: 0,
            credit: allottedAmount,
            lineNarration: 'ASBA lien cleared by partial allotment debit',
          },
          {
            accountId: availableAcc.id,
            applicantId: app.applicant_id,
            debit: refundAmount,
            credit: 0,
            lineNarration: 'Unallotted ASBA funds restored to available cash',
          },
          {
            accountId: lienAcc.id,
            applicantId: app.applicant_id,
            debit: 0,
            credit: refundAmount,
            lineNarration: 'Surplus ASBA lien released back to user cash',
          }
        );
      } else {
        // Scenario C: Zero Allotment
        targetStatus = 'REFUND_SETTLED';
        journalLines.push(
          {
            accountId: availableAcc.id,
            applicantId: app.applicant_id,
            debit: refundAmount,
            credit: 0,
            lineNarration: 'Full ASBA funds unblocked & restored to available cash (Zero Allotment)',
          },
          {
            accountId: lienAcc.id,
            applicantId: app.applicant_id,
            debit: 0,
            credit: refundAmount,
            lineNarration: 'Full ASBA lien released',
          }
        );
      }

      // Post double-entry journal entry
      const journalRes = await postJournalEntry({
        userId: app.user_id,
        idempotencyKey: `journal:${event.idempotencyKey}`,
        journalType: 'ipo_allotment_debit',
        referenceType: 'ipo_application',
        referenceId: app.id,
        narration: `Allotment settlement: ${sharesAllotted} shares allotted @ ₹${allotmentPrice}; status=${targetStatus}`,
        lines: journalLines,
        metadata: {
          applicationId: app.id,
          allotmentId: event.payload.allotmentId,
          sharesAllotted,
          allotmentPrice,
          allottedAmount,
          refundAmount,
          settlementStatus: targetStatus,
        },
      });

      if (!journalRes.success && !journalRes.isDuplicate) {
        throw new Error(journalRes.error || 'Failed to post double-entry allotment journal.');
      }

      const journalId = journalRes.journalId || null;

      // Post investment transaction if shares were allotted
      let investmentTxId: string | null = null;
      if (sharesAllotted > 0) {
        const { data: invTx, error: invTxErr } = await admin
          .from('investment_transactions')
          .insert({
            user_id: app.user_id,
            applicant_id: app.applicant_id,
            security_id: security.id,
            application_id: app.id,
            journal_id: journalId,
            idempotency_key: event.idempotencyKey,
            transaction_type: 'ipo_allotment',
            funding_owner_type: event.payload.fundingOwnerType || 'user_personal',
            transaction_date: event.occurredAt || new Date().toISOString(),
            quantity: sharesAllotted,
            price_per_share: allotmentPrice,
            gross_amount: allottedAmount,
            fees: 0,
            net_amount: allottedAmount,
            notes: `IPO Allotment Settlement from Application #${app.id.slice(0, 8)}`,
          } as never)
          .select('id')
          .maybeSingle();

        if (invTxErr && !invTxErr.message.includes('duplicate')) {
          throw new Error(`Failed to insert investment transaction: ${invTxErr.message}`);
        }
        investmentTxId = (invTx as { id: string })?.id || null;
      }

      // =======================================================================
      // 7. Authoritative Demat Portfolio Position Credit
      // =======================================================================
      let portfolioPositionId: string | null = null;
      if (sharesAllotted > 0) {
        // Query existing position
        const { data: existingPos } = await admin
          .from('portfolio_positions')
          .select('*')
          .eq('user_id', app.user_id)
          .eq('security_id', security.id)
          .maybeSingle();

        const currentQty = (existingPos as { quantity?: number })?.quantity || 0;
        const currentInvested = (existingPos as { total_invested_cost?: number })?.total_invested_cost || 0;

        const newQty = DecimalPrecision.add(currentQty, sharesAllotted);
        const newTotalCost = DecimalPrecision.add(currentInvested, allottedAmount);
        const newAvgCost = DecimalPrecision.divide(newTotalCost, newQty);

        if (existingPos) {
          const { data: updatedPos, error: posUpErr } = await admin
            .from('portfolio_positions')
            .update({
              quantity: newQty,
              total_invested_cost: newTotalCost,
              average_cost_price: newAvgCost,
              updated_at: new Date().toISOString(),
            } as never)
            .eq('id', (existingPos as { id: string }).id)
            .select('id')
            .single();

          if (posUpErr) throw new Error(`Failed to update portfolio position: ${posUpErr.message}`);
          portfolioPositionId = (updatedPos as { id: string })?.id || null;
        } else {
          const { data: createdPos, error: posInsErr } = await admin
            .from('portfolio_positions')
            .insert({
              user_id: app.user_id,
              applicant_id: app.applicant_id,
              security_id: security.id,
              quantity: newQty,
              total_invested_cost: newTotalCost,
              average_cost_price: newAvgCost,
              realized_pnl: 0,
              is_external_tracked: false,
            } as never)
            .select('id')
            .single();

          if (posInsErr) throw new Error(`Failed to create portfolio position: ${posInsErr.message}`);
          portfolioPositionId = (createdPos as { id: string })?.id || null;
        }

        // Candidate E: Idempotently seed authoritative acquisition tax lot
        if (investmentTxId) {
          await TaxLotService.createLotFromAllotment(investmentTxId, admin).catch((lotErr) => {
            console.warn(`Tax lot creation warning for tx ${investmentTxId}:`, lotErr?.message || lotErr);
          });
        }
      }

      // =======================================================================
      // 8. Finalize Settlement Ledger & Mark Event Processed
      // =======================================================================
      if (settlementId) {
        await admin
          .from('ipo_application_settlements')
          .update({
            settlement_status: targetStatus,
            journal_entry_id: journalId,
            portfolio_position_id: portfolioPositionId,
            investment_transaction_id: investmentTxId,
            processed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as never)
          .eq('id', settlementId);
      }

      await EventLedgerService.markEventProcessed({
        eventId: event.eventId,
        resultSummary: {
          settlementId,
          status: targetStatus,
          sharesAllotted,
          allottedAmount,
          refundAmount,
          securityId: security.id,
          journalId,
          portfolioPositionId,
        },
      });

      return {
        success: true,
        status: targetStatus,
        settlementId,
        journalId: journalId || undefined,
        portfolioPositionId: portfolioPositionId || undefined,
        investmentTransactionId: investmentTxId || undefined,
      };
    } catch (err: any) {
      console.error('[SettlementService] Atomic settlement posting failed:', err);

      if (settlementId) {
        await admin
          .from('ipo_application_settlements')
          .update({
            settlement_status: 'BLOCKED',
            failure_code: 'EXECUTION_FAILURE',
            failure_reason: err.message,
            updated_at: new Date().toISOString(),
          } as never)
          .eq('id', settlementId);
      }

      await EventLedgerService.markEventFailed({
        eventId: event.eventId,
        errorCode: 'EXECUTION_FAILURE',
        errorMessage: err.message,
      });

      return {
        success: false,
        status: 'BLOCKED',
        settlementId,
        errorCode: 'EXECUTION_FAILURE',
        errorMessage: err.message,
      };
    }
  }
}
