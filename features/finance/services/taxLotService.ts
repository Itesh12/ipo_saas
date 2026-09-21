/**
 * features/finance/services/taxLotService.ts
 *
 * Candidate E: Authoritative Tax Lot & FIFO Cost-Basis Engine.
 * 
 * ARCHITECTURAL MANDATES:
 * 1. E1: Exactly-one tax lot per acquisition lineage: UNIQUE(source_transaction_id, security_id).
 * 2. E2: Database-level lot quantity & cost invariants (0 <= remaining <= original, is_exhausted consistency).
 * 3. E3 & E4: Deterministic FIFO consumption: ORDER BY acquisition_date ASC, created_at ASC, id ASC.
 * 4. E5: FIFO is authoritative; WAC is derived analytics only.
 * 5. E20: Versioned, config-driven tax classification via TaxClassificationService.
 * 6. E21: Strict Candidate C acquisition lineage validation.
 * 7. E22: Hard invariant: holding position quantity/cost strictly equal active tax lots.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { DecimalPrecision } from '../utils/decimalPrecision';
import { TaxClassificationService, DEFAULT_TAX_RULE_VERSION } from './taxClassificationService';
import { LotAllocationItem, TaxLotRecord } from '../types/exitTypes';

const AUTHORIZED_ACQUISITION_TYPES = new Set([
  'ipo_allotment',
  'secondary_purchase',
  'external_holding',
  'bonus_shares',
]);

export interface ConsumeLotsParams {
  userId: string;
  applicantId?: string | null;
  securityId: string;
  quantityToSell: string; // Decimal string > 0
  executionDate?: string;
  policyVersion?: string;
  customClient?: any;
}

export interface ConsumeLotsResult {
  allocations: LotAllocationItem[];
  totalCostBasisConsumed: string;
  overallTaxClassification: 'STCG' | 'LTCG' | 'MIXED';
  taxRuleVersion: string;
}

export interface ConsistencyCheckResult {
  consistent: boolean;
  positionQuantity: string;
  lotsQuantity: string;
  positionCostBasis: string;
  lotsCostBasis: string;
  quantityDelta: string;
  costDelta: string;
  error?: string;
}

export class TaxLotService {
  /**
   * E1 & E21: Idempotently creates an acquisition tax lot from an authoritative investment transaction.
   * Strictly validates lineage: authorized acquisition type, positive quantity, and position existence.
   */
  public static async createLotFromAllotment(
    sourceTransactionId: string,
    customClient?: any
  ): Promise<{ success: boolean; lotId?: string; isDuplicate?: boolean; error?: string }> {
    const supabase = customClient || createAdminClient();

    // 1. Fetch source transaction (E21)
    const { data: tx, error: txErr } = await supabase
      .from('investment_transactions')
      .select(`
        id,
        user_id,
        applicant_id,
        security_id,
        transaction_type,
        transaction_date,
        quantity,
        price_per_share,
        gross_amount
      `)
      .eq('id', sourceTransactionId)
      .maybeSingle();

    if (txErr || !tx) {
      return {
        success: false,
        error: `INVALID_SOURCE_TRANSACTION: Source transaction ${sourceTransactionId} not found: ${txErr?.message || 'Not found'}`,
      };
    }

    // 2. E21 Lineage Validation: Must be an authorized acquisition type
    if (!AUTHORIZED_ACQUISITION_TYPES.has(tx.transaction_type)) {
      return {
        success: false,
        error: `INELIGIBLE_ACQUISITION_TYPE: Transaction type '${tx.transaction_type}' cannot create an acquisition tax lot.`,
      };
    }

    const qtyStr = tx.quantity.toString();
    const priceStr = tx.price_per_share.toString();

    if (!DecimalPrecision.gtStr(qtyStr, '0')) {
      return {
        success: false,
        error: `INVALID_QUANTITY: Acquisition quantity must be positive, got ${qtyStr}.`,
      };
    }

    if (DecimalPrecision.ltStr(priceStr, '0')) {
      return {
        success: false,
        error: `INVALID_PRICE: Acquisition price must be non-negative, got ${priceStr}.`,
      };
    }

    // 3. E21 Validate position existence and ownership match
    let posQuery = supabase
      .from('portfolio_positions')
      .select('id, user_id, applicant_id, security_id, quantity, total_invested_cost')
      .eq('user_id', tx.user_id)
      .eq('security_id', tx.security_id);

    if (tx.applicant_id) {
      posQuery = posQuery.eq('applicant_id', tx.applicant_id);
    } else {
      posQuery = posQuery.is('applicant_id', null);
    }

    const { data: pos, error: posErr } = await posQuery.maybeSingle();
    if (posErr || !pos) {
      return {
        success: false,
        error: `POSITION_MISMATCH: Authoritative portfolio position for user ${tx.user_id}, security ${tx.security_id} not found.`,
      };
    }

    // 4. Check for existing lot by lineage (E1)
    const { data: existingLot } = await supabase
      .from('portfolio_tax_lots')
      .select('id')
      .eq('source_transaction_id', tx.id)
      .eq('security_id', tx.security_id)
      .maybeSingle();

    if (existingLot) {
      return {
        success: true,
        lotId: existingLot.id,
        isDuplicate: true,
      };
    }

    // 5. Calculate lot amounts
    const totalLotCost = DecimalPrecision.multiplyStr(qtyStr, priceStr, 8);

    // 6. Insert tax lot
    const { data: newLot, error: insErr } = await supabase
      .from('portfolio_tax_lots')
      .insert({
        user_id: tx.user_id,
        applicant_id: tx.applicant_id || null,
        security_id: tx.security_id,
        source_transaction_id: tx.id,
        acquisition_date: tx.transaction_date,
        original_quantity: qtyStr,
        remaining_quantity: qtyStr,
        cost_per_share: priceStr,
        total_lot_cost: totalLotCost,
        is_exhausted: false,
        metadata: {
          transactionType: tx.transaction_type,
          grossAmount: tx.gross_amount,
        },
      } as never)
      .select('id')
      .single();

    if (insErr) {
      if (insErr.code === '23505') {
        // Unique violation => idempotent duplicate
        const { data: dupLot } = await supabase
          .from('portfolio_tax_lots')
          .select('id')
          .eq('source_transaction_id', tx.id)
          .eq('security_id', tx.security_id)
          .single();
        return {
          success: true,
          lotId: dupLot?.id,
          isDuplicate: true,
        };
      }
      return {
        success: false,
        error: `TAX_LOT_INSERT_FAILED: ${insErr.message}`,
      };
    }

    return {
      success: true,
      lotId: newLot.id,
      isDuplicate: false,
    };
  }

  /**
   * E3, E4, E5: Consumes candidate tax lots deterministically using FIFO order.
   * ORDER BY acquisition_date ASC, created_at ASC, id ASC.
   * Performs lot deduction and granular allocation plan generation.
   */
  public static async consumeLotsFIFO(
    params: ConsumeLotsParams
  ): Promise<ConsumeLotsResult> {
    const supabase = params.customClient || createAdminClient();
    const executionDate = params.executionDate || new Date().toISOString();
    const policyVersion = params.policyVersion || DEFAULT_TAX_RULE_VERSION;
    const quantityToSell = params.quantityToSell;

    // 1. Deterministic FIFO query on unexhausted candidate lots (E3, E4)
    let lotQuery = supabase
      .from('portfolio_tax_lots')
      .select('*')
      .eq('user_id', params.userId)
      .eq('security_id', params.securityId)
      .eq('is_exhausted', false)
      .order('acquisition_date', { ascending: true })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });

    if (params.applicantId) {
      lotQuery = lotQuery.eq('applicant_id', params.applicantId);
    } else {
      lotQuery = lotQuery.is('applicant_id', null);
    }

    const { data: rawLots, error: lotsErr } = await lotQuery;
    if (lotsErr) {
      throw new Error(`TAX_LOT_QUERY_FAILED: ${lotsErr.message}`);
    }

    const lots: any[] = rawLots || [];

    // 2. Validate total available quantity
    let totalAvailable = '0.0000';
    for (const lot of lots) {
      totalAvailable = DecimalPrecision.addStr([totalAvailable, lot.remaining_quantity], 4);
    }

    if (DecimalPrecision.ltStr(totalAvailable, quantityToSell)) {
      throw new Error(
        `INSUFFICIENT_HOLDING_QUANTITY: Requested ${quantityToSell} shares, but only ${totalAvailable} available across active lots.`
      );
    }

    // 3. FIFO Consumption Loop
    let remainingNeeded = quantityToSell;
    const allocations: LotAllocationItem[] = [];
    let totalCostBasisConsumed = '0.00000000';

    for (const lot of lots) {
      if (DecimalPrecision.lteStr(remainingNeeded, '0')) break;

      const lotRemaining = lot.remaining_quantity.toString();
      const costPerShare = lot.cost_per_share.toString();

      // Allocate minimum of lot remaining and what is needed
      const canTakeAll = DecimalPrecision.lteStr(lotRemaining, remainingNeeded);
      const allocatedQty = canTakeAll ? lotRemaining : remainingNeeded;

      const newLotRemaining = DecimalPrecision.subtractStr(lotRemaining, allocatedQty, 4);
      const isExhausted = DecimalPrecision.lteStr(newLotRemaining, '0');

      // Cost basis for this slice (E15)
      const allocatedCost = DecimalPrecision.multiplyStr(allocatedQty, costPerShare, 8);
      totalCostBasisConsumed = DecimalPrecision.addStr([totalCostBasisConsumed, allocatedCost], 8);

      // E20: Tax classification for this specific slice
      const taxClass = TaxClassificationService.classifyHolding(
        lot.acquisition_date,
        executionDate,
        policyVersion
      );

      allocations.push({
        taxLotId: lot.id,
        allocatedQuantity: allocatedQty,
        costPerShare,
        allocatedCostBasis: allocatedCost,
        holdingPeriodDays: taxClass.holdingPeriodDays,
        taxClassification: taxClass.taxClassification,
        taxRuleVersion: taxClass.taxRuleVersion,
      });

      // Update lot in DB (E2)
      const { error: updErr } = await supabase
        .from('portfolio_tax_lots')
        .update({
          remaining_quantity: newLotRemaining,
          is_exhausted: isExhausted,
          updated_at: new Date().toISOString(),
        } as never)
        .eq('id', lot.id);

      if (updErr) {
        throw new Error(`TAX_LOT_UPDATE_FAILED: Lot ${lot.id} update failed: ${updErr.message}`);
      }

      remainingNeeded = DecimalPrecision.subtractStr(remainingNeeded, allocatedQty, 4);
    }

    if (DecimalPrecision.gtStr(remainingNeeded, '0')) {
      throw new Error(`FIFO_CONSUMPTION_INCOMPLETE: Failed to fully allocate ${quantityToSell} shares.`);
    }

    const overallTaxClassification = TaxClassificationService.aggregateClassification(allocations);

    return {
      allocations,
      totalCostBasisConsumed,
      overallTaxClassification,
      taxRuleVersion: policyVersion,
    };
  }

  /**
   * E11 & E18: Restores consumed lot quantities during exit reversal.
   */
  public static async restoreLotsFromAllocations(
    allocations: Array<{ taxLotId: string; allocatedQuantity: string }>,
    customClient?: any
  ): Promise<void> {
    const supabase = customClient || createAdminClient();

    for (const alloc of allocations) {
      const { data: lot, error: lotErr } = await supabase
        .from('portfolio_tax_lots')
        .select('id, remaining_quantity, original_quantity')
        .eq('id', alloc.taxLotId)
        .single();

      if (lotErr || !lot) {
        throw new Error(`RESTORE_LOT_NOT_FOUND: Lot ${alloc.taxLotId} not found during reversal: ${lotErr?.message}`);
      }

      const currentRem = lot.remaining_quantity.toString();
      const restoredQty = DecimalPrecision.addStr([currentRem, alloc.allocatedQuantity], 4);

      // Verify restored <= original (E2)
      if (DecimalPrecision.gtStr(restoredQty, lot.original_quantity.toString())) {
        throw new Error(
          `LOT_CONSERVATION_VIOLATION: Restored quantity ${restoredQty} exceeds original ${lot.original_quantity} on lot ${lot.id}.`
        );
      }

      const { error: updErr } = await supabase
        .from('portfolio_tax_lots')
        .update({
          remaining_quantity: restoredQty,
          is_exhausted: false,
          updated_at: new Date().toISOString(),
        } as never)
        .eq('id', lot.id);

      if (updErr) {
        throw new Error(`RESTORE_LOT_UPDATE_FAILED: Failed to restore lot ${lot.id}: ${updErr.message}`);
      }
    }
  }

  /**
   * E22: Hard Invariant Checker.
   * Asserts that portfolio_positions (materialized holding) strictly equals
   * the sum of remaining quantities and costs across all active tax lots.
   */
  public static async verifyPositionLotConsistency(params: {
    userId: string;
    applicantId?: string | null;
    securityId: string;
    customClient?: any;
  }): Promise<ConsistencyCheckResult> {
    const supabase = params.customClient || createAdminClient();

    // 1. Fetch portfolio position
    let posQuery = supabase
      .from('portfolio_positions')
      .select('id, quantity, total_invested_cost')
      .eq('user_id', params.userId)
      .eq('security_id', params.securityId);

    if (params.applicantId) {
      posQuery = posQuery.eq('applicant_id', params.applicantId);
    } else {
      posQuery = posQuery.is('applicant_id', null);
    }

    const { data: pos } = await posQuery.maybeSingle();
    const posQty = pos ? pos.quantity.toString() : '0.0000';
    const posCost = pos ? pos.total_invested_cost.toString() : '0.00000000';

    // 2. Fetch all unexhausted lots
    let lotQuery = supabase
      .from('portfolio_tax_lots')
      .select('id, remaining_quantity, cost_per_share')
      .eq('user_id', params.userId)
      .eq('security_id', params.securityId)
      .eq('is_exhausted', false);

    if (params.applicantId) {
      lotQuery = lotQuery.eq('applicant_id', params.applicantId);
    } else {
      lotQuery = lotQuery.is('applicant_id', null);
    }

    const { data: lots, error: lotsErr } = await lotQuery;
    if (lotsErr) {
      return {
        consistent: false,
        positionQuantity: posQty,
        lotsQuantity: '0',
        positionCostBasis: posCost,
        lotsCostBasis: '0',
        quantityDelta: '0',
        costDelta: '0',
        error: `Tax lot query error: ${lotsErr.message}`,
      };
    }

    let lotsQty = '0.0000';
    let lotsCost = '0.00000000';

    for (const lot of lots || []) {
      const rem = lot.remaining_quantity.toString();
      const cost = DecimalPrecision.multiplyStr(rem, lot.cost_per_share.toString(), 8);
      lotsQty = DecimalPrecision.addStr([lotsQty, rem], 4);
      lotsCost = DecimalPrecision.addStr([lotsCost, cost], 8);
    }

    const quantityDelta = DecimalPrecision.subtractStr(posQty, lotsQty, 4);
    const costDelta = DecimalPrecision.subtractStr(posCost, lotsCost, 8);

    const isQtyConsistent = DecimalPrecision.eqStr(quantityDelta, '0');
    // Financial cost tolerance: 0.01
    const isCostConsistent = Math.abs(parseFloat(costDelta)) < 0.01;

    const consistent = isQtyConsistent && isCostConsistent;

    return {
      consistent,
      positionQuantity: posQty,
      lotsQuantity: lotsQty,
      positionCostBasis: posCost,
      lotsCostBasis: lotsCost,
      quantityDelta,
      costDelta,
      error: consistent ? undefined : `Inconsistency detected: Qty delta=${quantityDelta}, Cost delta=${costDelta}`,
    };
  }
}
