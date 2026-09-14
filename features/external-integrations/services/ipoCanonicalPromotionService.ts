/**
 * features/external-integrations/services/ipoCanonicalPromotionService.ts
 *
 * Phase 9 Stage 3A.3: Canonical IPO Promotion & Production Activation Service.
 *
 * Enforces:
 * - Mandatory Correction 1: Deterministic IST lifecycle resolution with versioned derived-time tagging.
 * - Mandatory Correction 2: Phase 2 schema enum normalization via IpoPromotionValidator.
 * - Mandatory Correction 3: Confirmed listing protection (expected listing date alone fails closed to 'listing_soon').
 * - Mandatory Correction 4: Strict domain separation between 'promote to draft' and 'approve and publish'.
 * - 7-Field Canonical Gatekeeper before any production activation.
 * - 100% Idempotent Upserts: Re-runs update cleanly without creating duplicate records or altering existing canonical identity.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import {
  CanonicalInboxRecord,
  IngestionObservationRecord,
  NormalizedIpoMasterPayload,
} from '../ipo-master/ipoMasterTypes';
import { IpoPromotionValidator, PromotionValidationResult } from './ipoPromotionValidator';
import { IpoLifecycleResolver, LifecycleResolutionOutcome } from './ipoLifecycleResolver';
import { IPORow, IPOCategory } from '@/features/ipo/types/ipo.types';

export interface PromotionEligibilityOutcome extends PromotionValidationResult {
  inboxRecord: CanonicalInboxRecord;
  latestObservation: IngestionObservationRecord;
  lifecycle: LifecycleResolutionOutcome;
}

export interface PromotionExecutionResult {
  success: boolean;
  ipoId: string;
  slug: string;
  companyName: string;
  publicationStatus: 'draft' | 'published';
  businessStatus: string;
  isNewRecord: boolean;
  action: 'promoted_to_draft' | 'approved_and_published';
}

export class IpoCanonicalPromotionService {
  /**
   * Evaluates candidate against the 7-Field Canonical Promotion Gate & IST Lifecycle Resolver.
   */
  public async validatePromotionEligibility(inboxId: string): Promise<PromotionEligibilityOutcome> {
    const admin = createAdminClient();

    const { data: inbox, error } = await admin
      .from('ipo_ingestion_inbox')
      .select('*, latest_observation:ipo_ingestion_observations!fk_inbox_latest_observation(*)')
      .eq('id', inboxId)
      .single();

    if (error || !inbox) {
      throw new Error(`Inbox candidate ${inboxId} not found: ${error?.message || 'Record missing'}`);
    }

    const typedInbox = inbox as unknown as CanonicalInboxRecord & {
      latest_observation: IngestionObservationRecord;
    };
    const obs = typedInbox.latest_observation;
    if (!obs) {
      throw new Error(`Inbox candidate ${inboxId} has no attached observations`);
    }

    const payload = obs.normalized_payload;

    // 1. Run 7-Field Canonical Gatekeeper
    const gateResult = IpoPromotionValidator.validateForPromotion(typedInbox, payload);

    // 2. Resolve Explainable Lifecycle (IST-aware, timestamps/derived convention, confirmed listing gate)
    const lifecycle = IpoLifecycleResolver.resolveLifecycle({
      open_date: payload.open_date,
      close_date: payload.close_date,
      allotment_date: payload.allotment_date,
      listing_date: payload.listing_date,
      bidding_start_time: payload.bidding_start_time,
      bidding_end_time: payload.bidding_end_time,
      listing_price: payload.listing_price,
      is_listing_confirmed: payload.is_listing_confirmed,
      explicit_status: payload.business_status,
    });

    return {
      ...gateResult,
      inboxRecord: typedInbox,
      latestObservation: obs,
      lifecycle,
    };
  }

  /**
   * Promotes candidate to Canonical Master as a DRAFT for editorial review.
   * Domain Semantics: Promoted to canonical database but NOT published to public /ipos catalog.
   */
  public async promoteCandidateToDraft(
    inboxId: string,
    adminUserId?: string | null
  ): Promise<PromotionExecutionResult> {
    const admin = createAdminClient();
    const eligibility = await this.validatePromotionEligibility(inboxId);
    const payload = eligibility.latestObservation.normalized_payload;
    const inbox = eligibility.inboxRecord;
    const validAdminId = await this.sanitizeAdminUserId(admin, adminUserId);

    const baseSlug = this.generateCanonicalSlug(payload.company_name);
    const category = this.resolveCategory(payload);
    const issueType = IpoPromotionValidator.normalizeIssueType(payload.issue_type);
    const lotSize = payload.lot_size && payload.lot_size > 0 ? payload.lot_size : 1;
    const minInvestment = payload.price_band_high ? Number(payload.price_band_high) * lotSize : null;

    // Check if matching IPO already exists in public.ipos
    const existingIpo = await this.findMatchingCanonicalIpo(admin, inbox, payload);

    let ipoId: string;
    let finalSlug: string;
    let isNewRecord = false;

    if (existingIpo) {
      ipoId = existingIpo.id;
      finalSlug = existingIpo.slug;

      const { error: updateError } = await admin
        .from('ipos')
        .update({
          company_name: payload.company_name,
          symbol: payload.symbol || existingIpo.symbol,
          category,
          issue_type: issueType,
          status: eligibility.lifecycle.status,
          publication_status: 'draft',
          price_band_low: payload.price_band_low,
          price_band_high: payload.price_band_high,
          lot_size: lotSize,
          min_investment: minInvestment,
          issue_size_cr: payload.issue_size_cr,
          open_date: payload.open_date,
          close_date: payload.close_date,
          allotment_date: payload.allotment_date,
          listing_date: payload.listing_date,
          provenance: eligibility.latestObservation.provenance as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        })
        .eq('id', ipoId);

      if (updateError) {
        throw new Error(`Failed to update canonical draft IPO ${ipoId}: ${updateError.message}`);
      }
    } else {
      isNewRecord = true;
      finalSlug = await this.ensureUniqueSlug(admin, baseSlug);

      const { data: newIpo, error: insertError } = await admin
        .from('ipos')
        .insert({
          slug: finalSlug,
          company_name: payload.company_name,
          symbol: payload.symbol || baseSlug.slice(0, 10).toUpperCase(),
          category,
          issue_type: issueType,
          status: eligibility.lifecycle.status,
          publication_status: 'draft',
          price_band_low: payload.price_band_low,
          price_band_high: payload.price_band_high,
          lot_size: lotSize,
          min_investment: minInvestment,
          issue_size_cr: payload.issue_size_cr,
          exchange: payload.exchange || 'NSE, BSE',
          open_date: payload.open_date,
          close_date: payload.close_date,
          allotment_date: payload.allotment_date,
          listing_date: payload.listing_date,
          about_company: `${payload.company_name} initial public offering registered with regulatory offer documents.`,
          created_by: validAdminId,
          provenance: eligibility.latestObservation.provenance as Record<string, unknown>,
        })
        .select('id, slug')
        .single();

      if (insertError || !newIpo) {
        throw new Error(`Failed to insert canonical draft IPO: ${insertError?.message}`);
      }
      ipoId = newIpo.id;
    }

    // Update staging inbox status
    await admin
      .from('ipo_ingestion_inbox')
      .update({
        review_status: 'promoted_to_draft',
        promoted_ipo_id: ipoId,
        reviewed_at: new Date().toISOString(),
        reviewed_by: validAdminId,
      })
      .eq('id', inboxId);

    return {
      success: true,
      ipoId,
      slug: finalSlug,
      companyName: payload.company_name,
      publicationStatus: 'draft',
      businessStatus: eligibility.lifecycle.status,
      isNewRecord,
      action: 'promoted_to_draft',
    };
  }

  /**
   * Explicit Admin Approval: Promotes and PUBLISHES an eligible candidate to public catalog.
   * Domain Semantics: Fails closed if 7-field gate is not satisfied.
   */
  public async approveAndPublishCandidate(
    inboxId: string,
    adminUserId?: string | null
  ): Promise<PromotionExecutionResult> {
    const admin = createAdminClient();
    const eligibility = await this.validatePromotionEligibility(inboxId);

    // Strict Gate: Must be 100% eligible to publish publicly
    if (!eligibility.eligible) {
      throw new Error(
        `Candidate ${inboxId} (${eligibility.inboxRecord.canonical_name}) failed the 7-Field Promotion Gate: ${eligibility.rejectionReasons.join('; ')}`
      );
    }

    const payload = eligibility.latestObservation.normalized_payload;
    const inbox = eligibility.inboxRecord;
    const validAdminId = await this.sanitizeAdminUserId(admin, adminUserId);

    const baseSlug = this.generateCanonicalSlug(payload.company_name);
    const category = this.resolveCategory(payload);
    const issueType = IpoPromotionValidator.normalizeIssueType(payload.issue_type);
    const lotSize = Number(payload.lot_size);
    const minInvestment = payload.price_band_high ? Number(payload.price_band_high) * lotSize : null;

    // Check if matching IPO already exists in public.ipos
    const existingIpo = await this.findMatchingCanonicalIpo(admin, inbox, payload);

    let ipoId: string;
    let finalSlug: string;
    let isNewRecord = false;
    const nowIso = new Date().toISOString();

    if (existingIpo) {
      ipoId = existingIpo.id;
      finalSlug = existingIpo.slug;

      const { error: updateError } = await admin
        .from('ipos')
        .update({
          company_name: payload.company_name,
          symbol: payload.symbol || existingIpo.symbol,
          category,
          issue_type: issueType,
          status: eligibility.lifecycle.status,
          publication_status: 'published',
          price_band_low: payload.price_band_low,
          price_band_high: payload.price_band_high,
          lot_size: lotSize,
          min_investment: minInvestment,
          issue_size_cr: payload.issue_size_cr,
          exchange: payload.exchange || existingIpo.exchange || 'NSE, BSE',
          open_date: payload.open_date,
          close_date: payload.close_date,
          allotment_date: payload.allotment_date,
          listing_date: payload.listing_date,
          is_listing_confirmed: eligibility.lifecycle.status === 'listed',
          provenance: eligibility.latestObservation.provenance as Record<string, unknown>,
          approved_by: validAdminId,
          published_at: existingIpo.published_at || nowIso,
          updated_at: nowIso,
        })
        .eq('id', ipoId);

      if (updateError) {
        throw new Error(`Failed to update published IPO ${ipoId}: ${updateError.message}`);
      }
    } else {
      isNewRecord = true;
      finalSlug = await this.ensureUniqueSlug(admin, baseSlug);

      const { data: newIpo, error: insertError } = await admin
        .from('ipos')
        .insert({
          slug: finalSlug,
          company_name: payload.company_name,
          symbol: payload.symbol || baseSlug.slice(0, 10).toUpperCase(),
          category,
          issue_type: issueType,
          status: eligibility.lifecycle.status,
          publication_status: 'published',
          price_band_low: payload.price_band_low,
          price_band_high: payload.price_band_high,
          lot_size: lotSize,
          min_investment: minInvestment,
          issue_size_cr: payload.issue_size_cr,
          exchange: payload.exchange || 'NSE, BSE',
          open_date: payload.open_date,
          close_date: payload.close_date,
          allotment_date: payload.allotment_date,
          listing_date: payload.listing_date,
          is_listing_confirmed: eligibility.lifecycle.status === 'listed',
          about_company: `${payload.company_name} initial public offering registered with regulatory offer documents.`,
          created_by: validAdminId,
          approved_by: validAdminId,
          published_at: nowIso,
          provenance: eligibility.latestObservation.provenance as Record<string, unknown>,
        })
        .select('id, slug')
        .single();

      if (insertError || !newIpo) {
        throw new Error(`Failed to insert published IPO: ${insertError?.message}`);
      }
      ipoId = newIpo.id;
    }

    // Update staging inbox record
    await admin
      .from('ipo_ingestion_inbox')
      .update({
        review_status: 'promoted_to_published',
        promoted_ipo_id: ipoId,
        reviewed_at: nowIso,
        reviewed_by: validAdminId,
      })
      .eq('id', inboxId);

    return {
      success: true,
      ipoId,
      slug: finalSlug,
      companyName: payload.company_name,
      publicationStatus: 'published',
      businessStatus: eligibility.lifecycle.status,
      isNewRecord,
      action: 'approved_and_published',
    };
  }

  /**
   * Retrieves the full canonical review queue with 7-field gate evaluation.
   */
  public async getCanonicalReviewQueue(): Promise<
    Array<{
      inbox: CanonicalInboxRecord;
      observation?: IngestionObservationRecord;
      validation: PromotionValidationResult;
      lifecycle?: LifecycleResolutionOutcome;
    }>
  > {
    const admin = createAdminClient();

    const { data: records, error } = await admin
      .from('ipo_ingestion_inbox')
      .select(`
        *,
        latest_observation:ipo_ingestion_observations!fk_inbox_latest_observation(
          id, source, document_type, observation_version, normalized_payload, provenance, observed_at
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to load review queue: ${error.message}`);
    }

    return (records || []).map((row) => {
      const inbox = row as unknown as CanonicalInboxRecord & {
        latest_observation?: IngestionObservationRecord;
      };
      const obs = inbox.latest_observation;
      const payload = (obs?.normalized_payload || {}) as Partial<NormalizedIpoMasterPayload>;

      const validation = IpoPromotionValidator.validateForPromotion(inbox, payload);
      let lifecycle: LifecycleResolutionOutcome | undefined;

      if (obs) {
        lifecycle = IpoLifecycleResolver.resolveLifecycle({
          open_date: payload.open_date,
          close_date: payload.close_date,
          allotment_date: payload.allotment_date,
          listing_date: payload.listing_date,
          bidding_start_time: payload.bidding_start_time,
          bidding_end_time: payload.bidding_end_time,
          listing_price: payload.listing_price,
          is_listing_confirmed: payload.is_listing_confirmed,
          explicit_status: payload.business_status,
        });
      }

      return {
        inbox,
        observation: obs,
        validation,
        lifecycle,
      };
    });
  }

  /**
   * Admin action to reject a staging candidate with documented reason.
   */
  public async rejectCandidate(inboxId: string, adminUserId: string, reason: string): Promise<void> {
    const admin = createAdminClient();
    await admin
      .from('ipo_ingestion_inbox')
      .update({
        review_status: 'rejected',
        conflict_details: [{ field: 'rejection_reason', message: reason }],
        reviewed_at: new Date().toISOString(),
        reviewed_by: adminUserId,
      })
      .eq('id', inboxId);
  }

  private async findMatchingCanonicalIpo(
    admin: ReturnType<typeof createAdminClient>,
    inbox: CanonicalInboxRecord,
    payload: NormalizedIpoMasterPayload
  ): Promise<IPORow | null> {
    // 1. Direct binding via promoted_ipo_id
    if (inbox.promoted_ipo_id) {
      const { data } = await admin.from('ipos').select('*').eq('id', inbox.promoted_ipo_id).single();
      if (data) return data as IPORow;
    }

    // 2. Exact Trading Symbol match (if symbol provided)
    if (payload.symbol) {
      const { data } = await admin.from('ipos').select('*').eq('symbol', payload.symbol).limit(1);
      if (data && data.length > 0) return data[0] as IPORow;
    }

    // 3. Exact Company Name match
    const { data: nameMatch } = await admin
      .from('ipos')
      .select('*')
      .ilike('company_name', payload.company_name.trim())
      .limit(1);
    if (nameMatch && nameMatch.length > 0) return nameMatch[0] as IPORow;

    return null;
  }

  private generateCanonicalSlug(companyName: string): string {
    return companyName
      .toLowerCase()
      .replace(/\b(limited|ltd|pvt|private|corporation|corp|inc|india)\b/gi, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private async ensureUniqueSlug(
    admin: ReturnType<typeof createAdminClient>,
    baseSlug: string
  ): Promise<string> {
    const { data } = await admin.from('ipos').select('slug').eq('slug', baseSlug).limit(1);
    if (!data || data.length === 0) {
      return baseSlug;
    }
    return `${baseSlug}-${Date.now().toString().slice(-4)}`;
  }

  private resolveCategory(payload: NormalizedIpoMasterPayload): IPOCategory {
    if (payload.category === 'sme') {
      return payload.exchange === 'BSE' ? 'sme_bse' : 'sme_nse';
    }
    return 'mainboard';
  }

  private async sanitizeAdminUserId(
    admin: ReturnType<typeof createAdminClient>,
    userId?: string | null
  ): Promise<string | null> {
    if (!userId) return null;
    const { data } = await admin.from('profiles').select('id').eq('id', userId).limit(1);
    return data && data.length > 0 ? data[0].id : null;
  }
}

export const ipoCanonicalPromotionService = new IpoCanonicalPromotionService();
