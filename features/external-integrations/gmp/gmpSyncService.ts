/**
 * features/external-integrations/gmp/gmpSyncService.ts
 *
 * Phase 9 Stage 3D: Grey Market Premium (GMP) Orchestration Service (Revision 2).
 *
 * Enforces:
 * 1. Hard Invariant: No GMP value reaches `ipo_gmp_entries` solely on HTTP 200.
 *    Must pass source validation, freshness validation, instrument validation,
 *    source-independence handling, and GMP reconciliation policy.
 * 2. Immutable Durable History: Observations stored in `ipo_gmp_observations` with ON DELETE SET NULL on source_observation_id.
 * 3. Listing Timestamp Freeze: Authoritative freeze against confirmed_listing_timestamp.
 * 4. Notification Boundary: Only verified consensus movement triggers notification pipeline. Outliers & corrigendums do not fire alerts.
 * 5. Historical IPO Deletion Guard: Hard deletion blocked if durable GMP records exist.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import {
  RawOTCPayload,
  GMPConsensusResult,
  GMPEventType,
  NormalizedGMPObservation,
} from './gmpTypes';
import { gmpValidator, IPOInstrumentContext } from './gmpValidator';
import { gmpConsensusEngine } from './gmpConsensusEngine';
import { wrapCompliantGMPPayload, CompliantGMPPayload } from './gmpCompliance';

export interface GMPSyncResult {
  observationId?: string;
  ipoId: string;
  isValidForConsensus: boolean;
  anomalyStatus: string;
  consensusMaterialized: boolean;
  consensusResult?: CompliantGMPPayload<GMPConsensusResult> | null;
  eventsEmitted: GMPEventType[];
  errors: string[];
}

export class GMPSyncService {
  /**
   * Processes a raw OTC observation, records durable history, and reconciles canonical consensus.
   */
  public static async processRawObservation(params: {
    rawPayload: RawOTCPayload;
    ipoId: string;
    sourceObservationId?: string | null;
    supabaseClient?: SupabaseClient;
  }): Promise<GMPSyncResult> {
    const { rawPayload, ipoId, sourceObservationId, supabaseClient } = params;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = supabaseClient || (await createClient());
    const errors: string[] = [];
    const eventsEmitted: GMPEventType[] = [];

    // 1. Fetch IPO Instrument Context
    const { data: ipo, error: ipoErr } = await supabase
      .from('ipos')
      .select('id, symbol, company_name, price_band_low, price_band_high, issue_price, status, listing_date')
      .eq('id', ipoId)
      .maybeSingle();

    if (ipoErr || !ipo) {
      return {
        ipoId,
        isValidForConsensus: false,
        anomalyStatus: 'invalid',
        consensusMaterialized: false,
        eventsEmitted: [],
        errors: [`Target IPO ${ipoId} not found: ${ipoErr?.message || 'Not found'}`],
      };
    }

    // 2. Fetch recent canonical GMP entry for prior state & freeze check
    const { data: existingGmpEntry } = await supabase
      .from('ipo_gmp_entries')
      .select('*')
      .eq('ipo_id', ipoId)
      .maybeSingle();

    // Check if IPO is already post-listing frozen
    if (existingGmpEntry?.is_post_listing_frozen) {
      return {
        ipoId,
        isValidForConsensus: false,
        anomalyStatus: 'invalid',
        consensusMaterialized: false,
        eventsEmitted: ['gmp_post_listing_frozen'],
        errors: [`IPO ${ipoId} GMP lifecycle is frozen post-listing. No updates permitted.`],
      };
    }

    // Determine confirmed listing timestamp
    const isListingConfirmed = ipo.status === 'listed' && !!ipo.listing_date;
    const confirmedListingTimestamp = isListingConfirmed ? `${ipo.listing_date}T09:15:00Z` : null;

    const ipoContext: IPOInstrumentContext = {
      id: ipo.id,
      symbol: ipo.symbol,
      companyName: ipo.company_name,
      priceBandLow: ipo.price_band_low ? Number(ipo.price_band_low) : null,
      priceBandHigh: ipo.price_band_high ? Number(ipo.price_band_high) : null,
      issuePrice: ipo.issue_price ? Number(ipo.issue_price) : null,
      isListingConfirmed,
      confirmedListingTimestamp,
      lastValidGmp: existingGmpEntry?.gmp_value ?? null,
      lastQuoteTime: existingGmpEntry?.updated_at ?? null,
    };

    // 3. Normalize and Validate Observation
    const validation = gmpValidator.validateRawObservation(rawPayload, ipoContext);
    const normalized = validation.normalizedObservation;
    normalized.source_observation_id = sourceObservationId || null;

    if (!validation.isValidForConsensus) {
      if (validation.rejectionReason?.includes('spike ceiling')) {
        eventsEmitted.push('gmp_spike_detected');
      }
      if (validation.rejectionReason?.includes('post-listing')) {
        eventsEmitted.push('gmp_post_listing_frozen');
      }
    }

    // 4. Persist Durable GMP Observation
    let observationId: string | undefined;
    const { data: insertedObs, error: insertErr } = await supabase
      .from('ipo_gmp_observations')
      .insert({
        ipo_id: normalized.ipo_id,
        source_observation_id: normalized.source_observation_id,
        source_observation_uid: normalized.source_observation_uid,
        source_observation_hash: normalized.source_observation_hash,
        gmp_source: normalized.gmp_source,
        source_family: normalized.source_family,
        publisher_id: normalized.publisher_id,
        upstream_source_id: normalized.upstream_source_id,
        independence_group: normalized.independence_group,
        quote_time: normalized.quote_time,
        reported_gmp_value: normalized.reported_gmp_value,
        reported_kostak: normalized.reported_kostak,
        reported_subject_to_sauda: normalized.reported_subject_to_sauda,
        sauda_condition_notes: normalized.sauda_condition_notes,
        anomaly_status: normalized.anomaly_status,
        anomaly_reason: normalized.anomaly_reason,
        validation_status: normalized.validation_status,
        raw_payload_hash: normalized.raw_payload_hash,
      })
      .select('id')
      .single();

    if (insertErr) {
      errors.push(`Observation insert error: ${insertErr.message}`);
    } else if (insertedObs) {
      observationId = insertedObs.id;
    }

    // 5. Gather Active Observations for Consensus Evaluation
    const { data: recentObsList, error: queryErr } = await supabase
      .from('ipo_gmp_observations')
      .select('*')
      .eq('ipo_id', ipoId)
      .neq('anomaly_status', 'invalid')
      .order('quote_time', { ascending: false })
      .limit(30);

    if (queryErr) {
      errors.push(`Failed to query active observations: ${queryErr.message}`);
      return {
        observationId,
        ipoId,
        isValidForConsensus: validation.isValidForConsensus,
        anomalyStatus: normalized.anomaly_status,
        consensusMaterialized: false,
        eventsEmitted,
        errors,
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obsForEvaluation: NormalizedGMPObservation[] = (recentObsList || []).map((o: any) => ({
      ipo_id: o.ipo_id,
      source_observation_id: o.source_observation_id,
      source_observation_uid: o.source_observation_uid,
      source_observation_hash: o.source_observation_hash,
      gmp_source: o.gmp_source,
      source_family: o.source_family,
      publisher_id: o.publisher_id,
      upstream_source_id: o.upstream_source_id,
      independence_group: o.independence_group,
      quote_time: o.quote_time,
      reported_gmp_value: o.reported_gmp_value,
      reported_kostak: o.reported_kostak,
      reported_subject_to_sauda: o.reported_subject_to_sauda,
      sauda_condition_notes: o.sauda_condition_notes,
      anomaly_status: o.anomaly_status,
      anomaly_reason: o.anomaly_reason,
      validation_status: o.validation_status,
      raw_payload_hash: o.raw_payload_hash,
    }));

    // 6. Execute Consensus Engine
    const consensus = gmpConsensusEngine.evaluateConsensus({
      ipoId,
      priceBandHigh: ipoContext.priceBandHigh,
      issuePrice: ipoContext.issuePrice,
      isListingConfirmed: ipoContext.isListingConfirmed,
      confirmedListingTimestamp: ipoContext.confirmedListingTimestamp,
      previousConsensusGmp: existingGmpEntry?.gmp_value ?? null,
      observations: obsForEvaluation,
    });

    if (consensus.outliersQuarantined.length > 0) {
      eventsEmitted.push('gmp_outlier_quarantined');
    }

    if (consensus.isPostListingFrozen) {
      eventsEmitted.push('gmp_post_listing_frozen');
    }

    // Check if true consensus movement occurred
    if (
      consensus.confidenceLevel === 'verified' &&
      consensus.consensusGmpValue !== null &&
      consensus.consensusGmpValue !== existingGmpEntry?.gmp_value
    ) {
      eventsEmitted.push('gmp_consensus_changed');
    }

    // 7. Materialize Canonical Snapshot into `ipo_gmp_entries`
    let consensusMaterialized = false;

    // Hard Invariant Check: Do not write canonical entry if no consensus could be computed
    if (consensus.consensusGmpValue !== null || existingGmpEntry) {
      const gmpValueToPersist = consensus.consensusGmpValue ?? existingGmpEntry?.gmp_value ?? 0;

      const { error: upsertErr } = await supabase
        .from('ipo_gmp_entries')
        .upsert(
          {
            ipo_id: ipoId,
            gmp_value: gmpValueToPersist,
            source_name: 'consensus',
            status: 'active',
            updated_at: new Date().toISOString(),
            confidence_level: consensus.confidenceLevel,
            latest_observation_id: observationId || existingGmpEntry?.latest_observation_id || null,
            source_count: consensus.sourceCount,
            source_spread_pct: consensus.sourceSpreadPct,
            kostak_rate: consensus.kostakRate,
            subject_to_sauda_rate: consensus.subjectToSaudaRate,
            trend_direction: consensus.trendDirection,
            day_change_value: consensus.dayChangeValue,
            day_change_pct: consensus.dayChangePct,
            freshness_state: consensus.freshnessState,
            policy_version: consensus.policyVersion,
            is_post_listing_frozen: consensus.isPostListingFrozen,
          },
          { onConflict: 'ipo_id' }
        );

      if (upsertErr) {
        errors.push(`Failed to upsert canonical gmp entry: ${upsertErr.message}`);
      } else {
        consensusMaterialized = true;
      }
    }

    const compliantConsensus = wrapCompliantGMPPayload(consensus);

    return {
      observationId,
      ipoId,
      isValidForConsensus: validation.isValidForConsensus,
      anomalyStatus: normalized.anomaly_status,
      consensusMaterialized,
      consensusResult: compliantConsensus,
      eventsEmitted,
      errors,
    };
  }

  /**
   * Published/historical IPO deletion guard.
   * Blocks hard deletion if IPO has durable GMP observations or canonical entries.
   */
  public static async canHardDeleteIpo(
    ipoId: string,
    supabaseClient?: SupabaseClient
  ): Promise<{ canDelete: boolean; reason?: string }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = supabaseClient || (await createClient());

    const { count: obsCount } = await supabase
      .from('ipo_gmp_observations')
      .select('id', { count: 'exact', head: true })
      .eq('ipo_id', ipoId);

    if (obsCount && obsCount > 0) {
      return {
        canDelete: false,
        reason: `IPO ${ipoId} contains ${obsCount} durable Grey Market Premium (GMP) observations. Archive instead of hard-deleting.`,
      };
    }

    const { count: gmpCount } = await supabase
      .from('ipo_gmp_entries')
      .select('id', { count: 'exact', head: true })
      .eq('ipo_id', ipoId);

    if (gmpCount && gmpCount > 0) {
      return {
        canDelete: false,
        reason: `IPO ${ipoId} contains canonical GMP entries. Archive instead of hard-deleting.`,
      };
    }

    return { canDelete: true };
  }
}
