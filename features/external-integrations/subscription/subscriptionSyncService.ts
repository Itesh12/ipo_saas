/**
 * features/external-integrations/subscription/subscriptionSyncService.ts
 *
 * Phase 9 Stage 3C: Subscription & Allotment Orchestration Service (Revision 2.2).
 *
 * Enforces:
 * 1. Durable observation history survives raw ingestion pruning.
 * 2. Designated Stock Exchange (DSE) authority for canonical snapshot materialization.
 * 3. Double-count protection across BSE & NSE feeds.
 * 4. Pre-basis estimates vs official Basis of Allotment facts separation.
 * 5. Published/historical IPO hard-deletion guard.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import {
  RawExchangeSubscriptionPayload,
  NormalizedSubscriptionObservation,
} from './subscriptionTypes';
import { BseSubscriptionAdapter } from './bseSubscriptionAdapter';
import { NseSubscriptionAdapter } from './nseSubscriptionAdapter';
import { AllotmentIntelligenceService } from './allotmentIntelligenceService';

export interface SubscriptionSyncResult {
  observationId: string;
  ipoId: string;
  exchange: string;
  dayNumber: number;
  reportedOverallX: number;
  computedOverallX: number | null;
  anomalyStatus: string;
  snapshotMaterialized: boolean;
  estimatesUpdated: boolean;
  errors: string[];
}

export class SubscriptionSyncService {
  /**
   * Processes a raw subscription payload and writes durable observation + canonical snapshot.
   */
  public static async processRawSubscription(params: {
    rawPayload: RawExchangeSubscriptionPayload;
    ipoId: string;
    sourceObservationId?: string | null;
    sourceObservationUid: string;
    sourceObservationHash: string;
    rawPayloadHash: string;
    supabaseClient?: SupabaseClient;
  }): Promise<SubscriptionSyncResult> {
    const {
      rawPayload,
      ipoId,
      sourceObservationId,
      sourceObservationUid,
      sourceObservationHash,
      rawPayloadHash,
      supabaseClient,
    } = params;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = supabaseClient || (await createClient());
    const errors: string[] = [];

    // 1. Fetch IPO to verify existence and designated exchange
    const { data: ipo, error: ipoErr } = await supabase
      .from('ipos')
      .select('id, company_name, symbol, exchange, designated_exchange, status, publication_status')
      .eq('id', ipoId)
      .maybeSingle();

    if (ipoErr || !ipo) {
      return {
        observationId: '',
        ipoId,
        exchange: rawPayload.exchange,
        dayNumber: rawPayload.dayNumber,
        reportedOverallX: 0,
        computedOverallX: null,
        anomalyStatus: 'invalid',
        snapshotMaterialized: false,
        estimatesUpdated: false,
        errors: [`Target IPO ${ipoId} not found in canonical database: ${ipoErr?.message || 'Not found'}`],
      };
    }

    // 2. Fetch previous observation for monotonic progression comparison
    const { data: prevObs } = await supabase
      .from('ipo_subscription_observations')
      .select('category_details, reported_overall_x')
      .eq('ipo_id', ipoId)
      .eq('exchange', rawPayload.exchange)
      .order('snapshot_time', { ascending: false })
      .limit(1)
      .maybeSingle();

    let prevTotalBids: number | null = null;
    if (prevObs?.category_details) {
      const details = prevObs.category_details as Record<string, { shares_bid?: number }>;
      let sum = 0;
      for (const d of Object.values(details)) {
        sum += d.shares_bid || 0;
      }
      prevTotalBids = sum > 0 ? sum : null;
    }

    // 3. Normalize via Source-Specific Adapter
    let normalized: NormalizedSubscriptionObservation;
    if (rawPayload.exchange === 'BSE') {
      normalized = BseSubscriptionAdapter.normalize({
        raw: rawPayload,
        ipoId,
        sourceObservationId,
        sourceObservationUid,
        sourceObservationHash,
        rawPayloadHash,
        previousObservationTotalBids: prevTotalBids,
      });
    } else {
      normalized = NseSubscriptionAdapter.normalize({
        raw: rawPayload,
        ipoId,
        sourceObservationId,
        sourceObservationUid,
        sourceObservationHash,
        rawPayloadHash,
        previousObservationTotalBids: prevTotalBids,
      });
    }

    // 4. Persist Durable Subscription Observation (Survives raw ingestion pruning)
    const { data: insertedObs, error: insertErr } = await supabase
      .from('ipo_subscription_observations')
      .insert({
        ipo_id: normalized.ipo_id,
        source_observation_id: normalized.source_observation_id || null,
        source_observation_uid: normalized.source_observation_uid,
        source_observation_hash: normalized.source_observation_hash,
        exchange: normalized.exchange,
        feed_scope: normalized.feed_scope,
        source_composition: normalized.source_composition,
        day_number: normalized.day_number,
        snapshot_time: normalized.snapshot_time,
        reported_overall_x: normalized.reported_overall_x,
        computed_overall_x: normalized.computed_overall_x,
        calculation_basis: normalized.calculation_basis,
        tolerance_pct: normalized.tolerance_pct,
        anomaly_status: normalized.anomaly_status,
        anomaly_reason: normalized.anomaly_reason,
        source_qib_definition: normalized.source_qib_definition,
        definition_verified: normalized.definition_verified,
        anchor_adjustment_applied: normalized.anchor_adjustment_applied,
        qib_x: normalized.qib_x,
        b_hni_x: normalized.b_hni_x,
        s_hni_x: normalized.s_hni_x,
        retail_x: normalized.retail_x,
        employee_x: normalized.employee_x,
        shareholder_x: normalized.shareholder_x,
        category_details: normalized.category_details,
        validation_status: normalized.validation_status,
        raw_payload_hash: normalized.raw_payload_hash,
        is_corrected: normalized.is_corrected,
        is_final_for_day: normalized.is_final_for_day,
        session_close_source: normalized.session_close_source,
      })
      .select('id')
      .single();

    if (insertErr || !insertedObs) {
      errors.push(`Failed to insert durable subscription observation: ${insertErr?.message}`);
      return {
        observationId: '',
        ipoId,
        exchange: normalized.exchange,
        dayNumber: normalized.day_number,
        reportedOverallX: normalized.reported_overall_x,
        computedOverallX: normalized.computed_overall_x,
        anomalyStatus: normalized.anomaly_status,
        snapshotMaterialized: false,
        estimatesUpdated: false,
        errors,
      };
    }

    const observationId = insertedObs.id;

    // 5. Materialize Canonical Snapshot (Governed by DSE Authority)
    let snapshotMaterialized = false;
    try {
      const snapshotDate = normalized.snapshot_time.split('T')[0];

      // Check existing snapshot for (ipo_id, day_number, snapshot_date)
      const { data: existingSnapshot } = await supabase
        .from('ipo_subscription_snapshots')
        .select('id, authoritative_exchange, feed_scope, overall_x')
        .eq('ipo_id', ipoId)
        .eq('day_number', normalized.day_number)
        .eq('snapshot_date', snapshotDate)
        .maybeSingle();

      const dse = (ipo.designated_exchange || ipo.exchange?.split(',')[0] || 'NSE').trim().toUpperCase();

      let shouldUpdateSnapshot = true;

      if (existingSnapshot && existingSnapshot.authoritative_exchange) {
        // If existing is already DSE and current is non-DSE, reconcile rather than blindly overwrite
        if (
          existingSnapshot.authoritative_exchange.toUpperCase() === dse &&
          normalized.exchange.toUpperCase() !== dse
        ) {
          shouldUpdateSnapshot = false;
        }
      }

      if (shouldUpdateSnapshot) {
        const { data: upsertedSnap, error: snapErr } = await supabase
          .from('ipo_subscription_snapshots')
          .upsert(
            {
              ipo_id: ipoId,
              day_number: normalized.day_number,
              snapshot_date: snapshotDate,
              snapshot_time: normalized.snapshot_time,
              qib_x: normalized.qib_x,
              nii_x: normalized.b_hni_x !== null && normalized.s_hni_x !== null ? Math.round(((normalized.b_hni_x + normalized.s_hni_x) / 2) * 100) / 100 : normalized.b_hni_x,
              nii_bighni_x: normalized.b_hni_x,
              nii_smallhni_x: normalized.s_hni_x,
              b_hni_x: normalized.b_hni_x,
              s_hni_x: normalized.s_hni_x,
              retail_x: normalized.retail_x,
              employee_x: normalized.employee_x,
              shareholder_x: normalized.shareholder_x,
              overall_x: normalized.reported_overall_x,
              source: `${normalized.exchange} Live Feed`,
              as_of: normalized.snapshot_time,
              latest_observation_id: observationId,
              source_observation_id: normalized.source_observation_id || null,
              source_observation_hash: normalized.source_observation_hash,
              authoritative_exchange: normalized.exchange,
              feed_scope: normalized.feed_scope,
              source_composition: normalized.source_composition,
              category_details: normalized.category_details,
              is_final_for_day: normalized.is_final_for_day,
              session_close_source: normalized.session_close_source,
              validation_status: normalized.validation_status,
              updated_at: new Date().toISOString(),
            },
            {
              onConflict: 'ipo_id,day_number,snapshot_date',
            }
          )
          .select('id')
          .single();

        if (snapErr) {
          errors.push(`Snapshot upsert failed: ${snapErr.message}`);
        } else {
          snapshotMaterialized = true;

          // 6. Update Pre-Basis Allotment Estimates
          if (upsertedSnap?.id) {
            const estimates = AllotmentIntelligenceService.computePreBasisEstimates({
              ipoId,
              finalSubscriptionSnapshotId: upsertedSnap.id,
              retailX: normalized.retail_x,
            });

            await supabase
              .from('ipo_allotment_estimates')
              .upsert(
                {
                  ipo_id: ipoId,
                  final_subscription_snapshot_id: estimates.final_subscription_snapshot_id,
                  estimated_retail_subscription_x: estimates.estimated_retail_subscription_x,
                  estimated_retail_lottery_ratio: estimates.estimated_retail_lottery_ratio,
                  estimated_retail_allotment_probability_pct: estimates.estimated_retail_allotment_probability_pct,
                  estimation_disclaimer: estimates.estimation_disclaimer,
                  updated_at: new Date().toISOString(),
                },
                {
                  onConflict: 'ipo_id',
                }
              );
          }
        }
      }
    } catch (snapEx: unknown) {
      errors.push(`Snapshot reconciliation exception: ${snapEx instanceof Error ? snapEx.message : String(snapEx)}`);
    }

    return {
      observationId,
      ipoId,
      exchange: normalized.exchange,
      dayNumber: normalized.day_number,
      reportedOverallX: normalized.reported_overall_x,
      computedOverallX: normalized.computed_overall_x,
      anomalyStatus: normalized.anomaly_status,
      snapshotMaterialized,
      estimatesUpdated: snapshotMaterialized,
      errors,
    };
  }

  /**
   * Published/historical IPO deletion guard.
   * Blocks hard deletion if IPO has durable subscription or allotment records.
   */
  public static async canHardDeleteIpo(ipoId: string, supabaseClient?: SupabaseClient): Promise<{ canDelete: boolean; reason?: string }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = supabaseClient || (await createClient());

    const { count: subCount } = await supabase
      .from('ipo_subscription_observations')
      .select('id', { count: 'exact', head: true })
      .eq('ipo_id', ipoId);

    if (subCount && subCount > 0) {
      return {
        canDelete: false,
        reason: `IPO ${ipoId} contains ${subCount} durable subscription observation records. Archive instead of hard-deleting.`,
      };
    }

    const { count: allotmentCount } = await supabase
      .from('ipo_allotment_facts')
      .select('id', { count: 'exact', head: true })
      .eq('ipo_id', ipoId);

    if (allotmentCount && allotmentCount > 0) {
      return {
        canDelete: false,
        reason: `IPO ${ipoId} contains official allotment facts. Archive instead of hard-deleting.`,
      };
    }

    return { canDelete: true };
  }
}
