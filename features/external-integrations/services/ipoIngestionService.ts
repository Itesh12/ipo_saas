/**
 * features/external-integrations/services/ipoIngestionService.ts
 *
 * Phase 9 Stage 3A: Broker-Independent IPO Ingestion Service.
 * Coordinates adapter execution, canonical resolution, immutable observation storage
 * via atomic service_role RPC, and administrative promotion workflows.
 */

import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  IngestionExtractionResult,
  CanonicalInboxRecord,
  DirectPublishValidationResult,
  IngestionConflictDetail,
  NormalizedIpoMasterPayload,
  IngestionObservationRecord,
} from '../ipo-master/ipoMasterTypes';
import { CanonicalIpoResolver } from './canonicalIpoResolver';

export class IpoIngestionService {
  /**
   * Ingests an observation from any provider adapter into the staging inbox.
   * Enforces deduplication, atomic observation versioning, and conflict evaluation.
   */
  public async ingestObservation(extraction: IngestionExtractionResult): Promise<{
    inboxId: string;
    observationId: string;
    isDuplicate: boolean;
    hasConflict: boolean;
  }> {
    const admin = createAdminClient();

    // 1. Calculate SHA-256 payload hash for deduplication
    const payloadHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(extraction.raw_payload))
      .digest('hex');

    // 2. Resolve Canonical Identity: Find matching inbox record or create new
    const inboxId = await this.resolveOrCreateInbox(extraction, admin);

    // 3. Atomically record observation using the hardened service_role RPC
    const { data: rpcResult, error: rpcError } = await admin.rpc('record_ipo_observation', {
      p_inbox_id: inboxId,
      p_source: extraction.source,
      p_external_id: extraction.external_id,
      p_document_type: extraction.document_type,
      p_payload_hash: payloadHash,
      p_raw_payload: extraction.raw_payload,
      p_normalized_payload: extraction.normalized_payload,
      p_provenance: extraction.provenance,
    });

    if (rpcError) {
      throw new Error(`Failed to record IPO observation: ${rpcError.message}`);
    }

    const isDuplicate = rpcResult.is_duplicate === true;
    const observationId = rpcResult.observation_id;

    // 4. If observation was a duplicate, re-apply latest normalization and re-evaluate conflicts
    if (isDuplicate) {
      if (observationId) {
        await admin
          .from('ipo_ingestion_observations')
          .update({
            normalized_payload: extraction.normalized_payload,
            provenance: extraction.provenance,
          })
          .eq('id', observationId);
      }
      const conflictOutcome = await this.evaluateInboxConflicts(inboxId, admin);
      return {
        inboxId,
        observationId,
        isDuplicate: true,
        hasConflict: conflictOutcome.hasConflict,
      };
    }

    // 5. Evaluate Conflicts against existing inbox observations
    const conflictOutcome = await this.evaluateInboxConflicts(inboxId, admin);

    return {
      inboxId,
      observationId,
      isDuplicate: false,
      hasConflict: conflictOutcome.hasConflict,
    };
  }

  /**
   * Resolves existing inbox record or creates a new one under transaction protection.
   */
  private async resolveOrCreateInbox(
    extraction: IngestionExtractionResult,
    admin: ReturnType<typeof createAdminClient>
  ): Promise<string> {
    // Check if this (source, external_id) is already bound to an inbox
    const { data: existingObs } = await admin
      .from('ipo_ingestion_observations')
      .select('inbox_id')
      .eq('source', extraction.source)
      .eq('external_id', extraction.external_id)
      .limit(1)
      .maybeSingle();

    if (existingObs?.inbox_id) {
      return existingObs.inbox_id;
    }

    // Query active inbox records for identity matching
    const { data: candidates } = await admin
      .from('ipo_ingestion_inbox')
      .select('id, canonical_name, symbol, isin, review_status')
      .in('review_status', [
        'candidate',
        'identity_resolved',
        'pending',
        'pending_review',
        'conflict_detected',
        'promoted_to_draft',
        'promoted_to_published',
      ]);

    if (candidates && candidates.length > 0) {
      for (const candidate of candidates) {
        if (CanonicalIpoResolver.isIdentityMatch(extraction.normalized_payload, candidate)) {
          // Check if candidate is already bound to a different external_id from the same source
          const { data: conflictingBinding } = await admin
            .from('ipo_source_identity_bindings')
            .select('external_id')
            .eq('inbox_id', candidate.id)
            .eq('source', extraction.source)
            .neq('external_id', extraction.external_id)
            .limit(1)
            .maybeSingle();

          if (conflictingBinding) {
            // Local Inbox Identity Consistency: Cannot attach two different external_ids from same source to same inbox
            continue;
          }

          // If candidate was in 'candidate' state and now has confirmed symbol or ISIN, promote state to identity_resolved
          if (
            candidate.review_status === 'candidate' &&
            (extraction.normalized_payload.symbol || extraction.normalized_payload.isin)
          ) {
            await admin
              .from('ipo_ingestion_inbox')
              .update({
                review_status: 'identity_resolved',
                symbol: extraction.normalized_payload.symbol || candidate.symbol,
                isin: extraction.normalized_payload.isin || candidate.isin,
                updated_at: new Date().toISOString(),
              })
              .eq('id', candidate.id);
          }
          return candidate.id;
        }
      }
    }

    // Determine initial review status: candidate vs pending_review
    const hasStrongIdentity = Boolean(extraction.normalized_payload.symbol || extraction.normalized_payload.isin);
    const initialStatus = hasStrongIdentity ? 'pending_review' : 'candidate';

    // Create a new canonical inbox record
    const { data: newInbox, error: insertError } = await admin
      .from('ipo_ingestion_inbox')
      .insert({
        canonical_name: extraction.normalized_payload.company_name,
        symbol: extraction.normalized_payload.symbol || null,
        isin: extraction.normalized_payload.isin || null,
        review_status: initialStatus,
        has_conflict: false,
        market_segment: extraction.normalized_payload.market_segment || (extraction.normalized_payload.instrument_type === 'SME_IPO' ? 'NSE_SME' : 'MAINBOARD'),
        instrument_type: extraction.normalized_payload.instrument_type || 'IPO',
        issue_identity: extraction.normalized_payload.issue_identity || null,
      })
      .select('id')
      .single();

    if (insertError || !newInbox) {
      throw new Error(`Failed to create canonical inbox item: ${insertError?.message}`);
    }

    return newInbox.id;
  }

  /**
   * Re-evaluates conflict state for an inbox record given all its observations.
   */
  public async evaluateInboxConflicts(
    inboxId: string,
    providedAdmin?: ReturnType<typeof createAdminClient>
  ): Promise<{ hasConflict: boolean }> {
    const admin = providedAdmin || createAdminClient();

    // Fetch latest observation details
    const { data: observations } = await admin
      .from('ipo_ingestion_observations')
      .select('normalized_payload, provenance, source')
      .eq('inbox_id', inboxId)
      .order('observed_at', { ascending: true });

    if (!observations || observations.length <= 1) {
      await admin
        .from('ipo_ingestion_inbox')
        .update({
          has_conflict: false,
          conflict_details: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', inboxId);

      return { hasConflict: false };
    }

    // Reconcile chronologically
    let mergedPayload = observations[0].normalized_payload;
    let mergedProv = observations[0].provenance;
    let anyConflict = false;
    let allConflicts: IngestionConflictDetail[] = [];

    for (let i = 1; i < observations.length; i++) {
      const outcome = CanonicalIpoResolver.resolveObservation(
        mergedPayload,
        mergedProv,
        {
          source: observations[i].source,
          external_id: '',
          document_type: 'IPO_MASTER',
          raw_payload: {},
          normalized_payload: observations[i].normalized_payload,
          provenance: observations[i].provenance,
        }
      );

      mergedPayload = outcome.resolved_payload;
      mergedProv = outcome.resolved_provenance;
      if (outcome.has_conflict) {
        anyConflict = true;
        allConflicts = allConflicts.concat(outcome.conflict_details);
      }
    }

    // Fetch existing inbox record to preserve promoted status
    const { data: currentInbox } = await admin
      .from('ipo_ingestion_inbox')
      .select('review_status, promoted_ipo_id')
      .eq('id', inboxId)
      .single();

    let targetReviewStatus = currentInbox?.review_status;
    if (anyConflict) {
      targetReviewStatus = 'conflict_detected';
    } else if (
      targetReviewStatus === 'candidate' ||
      targetReviewStatus === 'pending' ||
      targetReviewStatus === 'conflict_detected'
    ) {
      targetReviewStatus = 'pending_review';
    }

    // Update inbox record with conflict state
    await admin
      .from('ipo_ingestion_inbox')
      .update({
        has_conflict: anyConflict,
        conflict_details: anyConflict ? allConflicts : null,
        review_status: targetReviewStatus,
        canonical_name: mergedPayload.company_name,
        symbol: mergedPayload.symbol || null,
        isin: mergedPayload.isin || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', inboxId);

    return { hasConflict: anyConflict };
  }

  /**
   * Promotes an inbox record to a Draft IPO in the production `ipos` table.
   * If already linked to an `ipos` record, updates the existing record with the latest resolved payload.
   */
  public async promoteToDraft(inboxId: string, adminUserId: string): Promise<string> {
    const admin = createAdminClient();

    // Fetch inbox entity with latest observation
    const { data: inbox } = await admin
      .from('ipo_ingestion_inbox')
      .select('*, ipo_ingestion_observations!fk_inbox_latest_observation(*)')
      .eq('id', inboxId)
      .single();

    if (!inbox) {
      throw new Error(`Inbox record ${inboxId} not found`);
    }

    const obs = (inbox as unknown as { ipo_ingestion_observations: IngestionObservationRecord }).ipo_ingestion_observations;
    if (!obs) {
      throw new Error(`Inbox record ${inboxId} has no active observation`);
    }

    const payload = obs.normalized_payload;

    // Generate unique slug
    const baseSlug = payload.company_name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    // Map category to valid ipo_category enum ('mainboard', 'sme_bse', 'sme_nse')
    let dbCategory: 'mainboard' | 'sme_bse' | 'sme_nse' = 'mainboard';
    if (payload.category === 'sme') {
      dbCategory = payload.exchange === 'BSE' ? 'sme_bse' : 'sme_nse';
    }

    const lotSize = payload.lot_size && payload.lot_size > 0 ? payload.lot_size : 1;
    const minInvestment = payload.price_band_high ? Number(payload.price_band_high) * lotSize : null;

    // If already promoted, update the existing IPO record rather than inserting a duplicate
    if (inbox.promoted_ipo_id) {
      const { error: updateError } = await admin
        .from('ipos')
        .update({
          company_name: payload.company_name,
          symbol: payload.symbol || undefined,
          category: dbCategory,
          issue_type: payload.issue_type || 'book_building',
          status: payload.business_status || 'upcoming',
          price_band_low: payload.price_band_low,
          price_band_high: payload.price_band_high,
          lot_size: lotSize,
          min_investment: minInvestment,
          issue_size_cr: payload.issue_size_cr,
          open_date: payload.open_date,
          close_date: payload.close_date,
          listing_date: payload.listing_date,
          updated_at: new Date().toISOString(),
        })
        .eq('id', inbox.promoted_ipo_id);

      if (updateError) {
        throw new Error(`Failed to update existing IPO ${inbox.promoted_ipo_id}: ${updateError.message}`);
      }

      await admin
        .from('ipo_ingestion_inbox')
        .update({
          review_status: 'promoted_to_draft',
          reviewed_at: new Date().toISOString(),
          reviewed_by: adminUserId,
        })
        .eq('id', inboxId);

      return inbox.promoted_ipo_id;
    }

    // Insert into `ipos` table as draft
    const { data: ipo, error: ipoError } = await admin
      .from('ipos')
      .insert({
        company_name: payload.company_name,
        slug: `${baseSlug}-${Date.now().toString().slice(-4)}`,
        symbol: payload.symbol || baseSlug.slice(0, 10).toUpperCase(),
        category: dbCategory,
        issue_type: payload.issue_type || 'book_building',
        status: payload.business_status || 'upcoming',
        publication_status: 'draft',
        price_band_low: payload.price_band_low,
        price_band_high: payload.price_band_high,
        lot_size: lotSize,
        min_investment: minInvestment,
        issue_size_cr: payload.issue_size_cr,
        open_date: payload.open_date,
        close_date: payload.close_date,
        listing_date: payload.listing_date,
        about_company: `${payload.company_name} initial public offering registered with regulatory offer documents.`,
      })
      .select('id')
      .single();

    if (ipoError || !ipo) {
      throw new Error(`Failed to create draft IPO: ${ipoError?.message}`);
    }

    // Update inbox status
    await admin
      .from('ipo_ingestion_inbox')
      .update({
        review_status: 'promoted_to_draft',
        promoted_ipo_id: ipo.id,
        reviewed_at: new Date().toISOString(),
        reviewed_by: adminUserId,
      })
      .eq('id', inboxId);

    return ipo.id;
  }

  /**
   * Promotes an inbox record directly to Published status in the production `ipos` table.
   * If already linked to an `ipos` record, updates it to published with latest authoritative data.
   */
  public async promoteToPublished(
    inboxId: string,
    adminUserId: string,
    options?: { skipValidation?: boolean }
  ): Promise<string> {
    const admin = createAdminClient();

    const { data: inbox } = await admin
      .from('ipo_ingestion_inbox')
      .select('*, ipo_ingestion_observations!fk_inbox_latest_observation(*)')
      .eq('id', inboxId)
      .single();

    if (!inbox) {
      throw new Error(`Inbox record ${inboxId} not found`);
    }

    const obs = (inbox as unknown as { ipo_ingestion_observations: IngestionObservationRecord }).ipo_ingestion_observations;
    if (!obs) {
      throw new Error(`Inbox record ${inboxId} has no active observation`);
    }

    const payload = obs.normalized_payload;

    if (!options?.skipValidation) {
      const validation = IpoIngestionService.validateDirectPublish(inbox as unknown as CanonicalInboxRecord, payload);
      if (!validation.canPublish) {
        throw new Error(`Cannot promote to published: ${validation.reasons.join(', ')}`);
      }
    }

    const baseSlug = payload.company_name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    let dbCategory: 'mainboard' | 'sme_bse' | 'sme_nse' = 'mainboard';
    if (payload.category === 'sme') {
      dbCategory = payload.exchange === 'BSE' ? 'sme_bse' : 'sme_nse';
    }

    const lotSize = payload.lot_size && payload.lot_size > 0 ? payload.lot_size : 1;
    const minInvestment = payload.price_band_high ? Number(payload.price_band_high) * lotSize : null;

    if (inbox.promoted_ipo_id) {
      const { error: updateError } = await admin
        .from('ipos')
        .update({
          company_name: payload.company_name,
          symbol: payload.symbol || undefined,
          category: dbCategory,
          issue_type: payload.issue_type || 'book_building',
          status: payload.business_status || 'upcoming',
          publication_status: 'published',
          price_band_low: payload.price_band_low,
          price_band_high: payload.price_band_high,
          lot_size: lotSize,
          min_investment: minInvestment,
          issue_size_cr: payload.issue_size_cr,
          open_date: payload.open_date,
          close_date: payload.close_date,
          listing_date: payload.listing_date,
          updated_at: new Date().toISOString(),
        })
        .eq('id', inbox.promoted_ipo_id);

      if (updateError) {
        throw new Error(`Failed to update published IPO ${inbox.promoted_ipo_id}: ${updateError.message}`);
      }

      await admin
        .from('ipo_ingestion_inbox')
        .update({
          review_status: 'promoted_to_published',
          reviewed_at: new Date().toISOString(),
          reviewed_by: adminUserId,
        })
        .eq('id', inboxId);

      return inbox.promoted_ipo_id;
    }

    const { data: ipo, error: ipoError } = await admin
      .from('ipos')
      .insert({
        company_name: payload.company_name,
        slug: `${baseSlug}-${Date.now().toString().slice(-4)}`,
        symbol: payload.symbol || baseSlug.slice(0, 10).toUpperCase(),
        category: dbCategory,
        issue_type: payload.issue_type || 'book_building',
        status: payload.business_status || 'upcoming',
        publication_status: 'published',
        price_band_low: payload.price_band_low,
        price_band_high: payload.price_band_high,
        lot_size: lotSize,
        min_investment: minInvestment,
        issue_size_cr: payload.issue_size_cr,
        open_date: payload.open_date,
        close_date: payload.close_date,
        listing_date: payload.listing_date,
        about_company: `${payload.company_name} initial public offering registered with regulatory offer documents.`,
      })
      .select('id')
      .single();

    if (ipoError || !ipo) {
      throw new Error(`Failed to create published IPO: ${ipoError?.message}`);
    }

    await admin
      .from('ipo_ingestion_inbox')
      .update({
        review_status: 'promoted_to_published',
        promoted_ipo_id: ipo.id,
        reviewed_at: new Date().toISOString(),
        reviewed_by: adminUserId,
      })
      .eq('id', inboxId);

    return ipo.id;
  }

  /**
   * Validates strict 6-point criteria for Direct Publishing.
   */
  public static validateDirectPublish(
    inbox: CanonicalInboxRecord,
    latestPayload: Partial<NormalizedIpoMasterPayload>
  ): DirectPublishValidationResult {
    const reasons: string[] = [];

    if (inbox.has_conflict) {
      reasons.push('Record has unresolved field conflicts');
    }
    if (!latestPayload.company_name) {
      reasons.push('Company name is missing');
    }
    if (!latestPayload.price_band_low || !latestPayload.price_band_high) {
      reasons.push('Price band is incomplete or unannounced');
    }
    if (!latestPayload.lot_size) {
      reasons.push('Lot size is missing');
    }
    if (!latestPayload.open_date || !latestPayload.close_date) {
      reasons.push('Bidding dates (open/close) are missing');
    }

    return {
      canPublish: reasons.length === 0,
      reasons,
    };
  }
}

export const ipoIngestionService = new IpoIngestionService();
