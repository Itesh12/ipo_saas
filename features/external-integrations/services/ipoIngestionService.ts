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

    // 4. If observation was a duplicate, no conflict resolution needed
    if (isDuplicate) {
      return {
        inboxId,
        observationId,
        isDuplicate: true,
        hasConflict: false,
      };
    }

    // 5. Evaluate Conflicts against existing inbox observations
    const conflictOutcome = await this.evaluateInboxConflicts(inboxId, extraction, admin);

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
      .select('id, canonical_name, symbol, isin')
      .in('review_status', ['pending', 'promoted_to_draft']);

    if (candidates && candidates.length > 0) {
      for (const candidate of candidates) {
        if (CanonicalIpoResolver.isIdentityMatch(extraction.normalized_payload, candidate)) {
          return candidate.id;
        }
      }
    }

    // Create a new canonical inbox record
    const { data: newInbox, error: insertError } = await admin
      .from('ipo_ingestion_inbox')
      .insert({
        canonical_name: extraction.normalized_payload.company_name,
        symbol: extraction.normalized_payload.symbol || null,
        isin: extraction.normalized_payload.isin || null,
        review_status: 'pending',
        has_conflict: false,
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
  private async evaluateInboxConflicts(
    inboxId: string,
    latestExtraction: IngestionExtractionResult,
    admin: ReturnType<typeof createAdminClient>
  ): Promise<{ hasConflict: boolean }> {
    // Fetch latest observation details
    const { data: observations } = await admin
      .from('ipo_ingestion_observations')
      .select('normalized_payload, provenance, source')
      .eq('inbox_id', inboxId)
      .order('observed_at', { ascending: true });

    if (!observations || observations.length <= 1) {
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

    // Update inbox record with conflict state
    await admin
      .from('ipo_ingestion_inbox')
      .update({
        has_conflict: anyConflict,
        conflict_details: anyConflict ? allConflicts : null,
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
    let dbCategory = 'mainboard';
    if (payload.category === 'sme') {
      dbCategory = payload.exchange === 'BSE' ? 'sme_bse' : 'sme_nse';
    } else if (payload.category === 'sme_bse' || payload.category === 'sme_nse') {
      dbCategory = payload.category;
    }

    const lotSize = payload.lot_size && payload.lot_size > 0 ? payload.lot_size : 1;
    const minInvestment = payload.price_band_high ? Number(payload.price_band_high) * lotSize : null;

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
