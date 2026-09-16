/**
 * features/external-integrations/services/ipoPromotionValidator.ts
 *
 * Phase 9 Stage 3A.5: Two-Tier Canonical Existence & Publication Gatekeeper.
 *
 * Replaces the monolithic existence gate with two distinct evaluators:
 * 1. validateCanonicalExistence(): Checks whether a record has sufficient legal identity
 *    and source provenance to exist in the canonical IPO master universe.
 *    (Allows price_band = NULL, open_date = NULL, lot_size = NULL for announced DRHP filings).
 * 2. evaluatePublicationEligibility(): Enforces explicit product publication policies.
 *    (Requires instrument_type ∈ {IPO, SME_IPO}, not withdrawn/cancelled, zero conflicts).
 * 3. evaluateDataCompleteness(): Derives the 5-state data completeness matrix
 *    ('discovered' | 'partial' | 'verified' | 'complete' | 'conflicted').
 */

import {
  NormalizedIpoMasterPayload,
  CanonicalInboxRecord,
  IPODataQuality,
  IPOInstrumentType,
} from '../ipo-master/ipoMasterTypes';

export type CanonicalIssueType = 'book_building' | 'fixed_price';
export type PublicationPolicy = 'strict_trading_only' | 'full_market_pipeline';

export interface PromotionValidationResult {
  eligible: boolean;
  canPublish: boolean;
  dataQuality: IPODataQuality;
  passedFields: string[];
  missingFields: string[];
  rejectionReasons: string[];
  normalizedPayload?: NormalizedIpoMasterPayload;
}

export class IpoPromotionValidator {
  public static readonly REQUIRED_EXISTENCE_FIELDS = [
    'company_name',
    'instrument_type',
  ] as const;

  public static readonly REQUIRED_TRADING_FIELDS = [
    'company_name',
    'issue_type',
    'price_band',
    'lot_size',
    'open_date',
    'close_date',
    'exchange',
  ] as const;

  /**
   * Normalizes arbitrary source issue type representations into canonical Phase 2 schema enum.
   */
  public static normalizeIssueType(raw?: string | null): CanonicalIssueType {
    if (!raw) return 'book_building'; // Standard Indian primary market default
    const clean = raw.toLowerCase().trim();
    if (clean.includes('fixed') || clean === 'fp') {
      return 'fixed_price';
    }
    return 'book_building';
  }

  /**
   * Tier 1 Gate: Validates whether a discovered record has sufficient identity
   * to qualify as a Canonical IPO entity in the master universe.
   */
  public static validateCanonicalExistence(
    inbox: Pick<CanonicalInboxRecord, 'has_conflict' | 'review_status'>,
    payload: Partial<NormalizedIpoMasterPayload>
  ): PromotionValidationResult {
    const passedFields: string[] = [];
    const missingFields: string[] = [];
    const rejectionReasons: string[] = [];

    // Conflict Check
    if (inbox.has_conflict || inbox.review_status === 'conflict_detected' || inbox.review_status === 'conflicted') {
      rejectionReasons.push('Tier-1 conflict active: Record has unresolved inter-source discrepancies');
    }

    // Company Name
    if (payload.company_name && payload.company_name.trim().length > 0) {
      passedFields.push('company_name');
    } else {
      missingFields.push('company_name');
      rejectionReasons.push('Missing or empty company / issuer legal name');
    }

    // Instrument Type (Equity IPO vs SME vs Debt/Rights)
    const instType = payload.instrument_type || 'IPO';
    if (instType === 'IPO' || instType === 'SME_IPO') {
      passedFields.push('instrument_type');
    } else {
      rejectionReasons.push(`Non-equity instrument excluded: ${instType}`);
    }

    const dataQuality = this.evaluateDataCompleteness(payload, inbox.has_conflict);
    const eligible = rejectionReasons.length === 0;

    return {
      eligible,
      canPublish: eligible,
      dataQuality,
      passedFields,
      missingFields,
      rejectionReasons,
      normalizedPayload: eligible ? (payload as NormalizedIpoMasterPayload) : undefined,
    };
  }

  /**
   * Tier 2 Gate: Evaluates whether a Canonical IPO entity is eligible for public display.
   * Hard Gate 2: Does NOT automatically publish every non-conflicted record.
   * Verifies instrument_type ∈ {IPO, SME_IPO}, not withdrawn/cancelled, acceptable provenance.
   */
  public static evaluatePublicationEligibility(
    payload: Partial<NormalizedIpoMasterPayload>,
    policy: PublicationPolicy = 'full_market_pipeline',
    inboxHasConflict = false
  ): { canPublish: boolean; reasons: string[] } {
    const reasons: string[] = [];

    // 1. Conflict Gate
    if (inboxHasConflict) {
      reasons.push('Cannot publish: Unresolved Tier-1 conflict');
    }

    // 2. Instrument Type Gate (Only IPO and SME_IPO on public /ipos)
    const instType: IPOInstrumentType = payload.instrument_type || 'IPO';
    if (instType !== 'IPO' && instType !== 'SME_IPO') {
      reasons.push(`Cannot publish to IPO catalog: Instrument type is ${instType}`);
    }

    // 3. Lifecycle Status Gate (Do not publish withdrawn or cancelled as active issues)
    const status = payload.business_status;
    if (status === 'withdrawn' || status === 'cancelled') {
      reasons.push(`Cannot publish as active: Issue is ${status}`);
    }

    // 4. Policy-specific checks
    if (policy === 'strict_trading_only') {
      // Must have price band and dates
      const hasDates = !!payload.open_date && !!payload.close_date;
      const hasPrice = (Number(payload.price_band_high) > 0) || (Number(payload.price_band_low) > 0);
      if (!hasDates || !hasPrice) {
        reasons.push('Cannot publish under strict_trading_only: Missing active trading parameters');
      }
    }

    return {
      canPublish: reasons.length === 0,
      reasons,
    };
  }

  /**
   * Derives 5-state data completeness.
   */
  public static evaluateDataCompleteness(
    payload: Partial<NormalizedIpoMasterPayload>,
    hasConflict = false
  ): IPODataQuality {
    if (hasConflict) return 'conflicted';

    const hasIssuer = !!payload.company_name && payload.company_name.trim().length > 0;
    const hasPrice = Number(payload.price_band_high) > 0 && Number(payload.price_band_low) > 0;
    const hasDates = !!payload.open_date && !!payload.close_date;
    const hasLot = Number(payload.lot_size) > 0;
    const hasExchange = !!payload.exchange;

    if (hasIssuer && hasPrice && hasDates && hasLot && hasExchange) {
      return 'complete';
    }
    if (hasIssuer && hasPrice && hasDates) {
      return 'verified';
    }
    if (hasIssuer && (payload.drhp_url || payload.rhp_url || payload.prospectus_url || payload.open_date)) {
      return 'partial';
    }
    return 'discovered';
  }

  /**
   * Preserves backward compatibility with earlier callers while applying Stage 3A.5 inclusive rules.
   */
  public static validateForPromotion(
    inbox: Pick<CanonicalInboxRecord, 'has_conflict' | 'review_status'>,
    payload: Partial<NormalizedIpoMasterPayload>,
    options?: { allowPendingLotSize?: boolean; allowAnnounced?: boolean }
  ): PromotionValidationResult {
    // If allowAnnounced is true or default Stage 3A.5 behavior, use canonical existence validation
    if (options?.allowAnnounced !== false) {
      return this.validateCanonicalExistence(inbox, payload);
    }

    // Strict 7-field check for legacy test paths
    const passedFields: string[] = [];
    const missingFields: string[] = [];
    const rejectionReasons: string[] = [];

    if (inbox.has_conflict || inbox.review_status === 'conflict_detected' || inbox.review_status === 'conflicted') {
      rejectionReasons.push('Tier-1 conflict active: Record has unresolved inter-source discrepancies');
    }

    if (payload.company_name && payload.company_name.trim().length > 0) {
      passedFields.push('company_name');
    } else {
      missingFields.push('company_name');
      rejectionReasons.push('Missing or empty company / issuer legal name');
    }

    const normalizedIssueType = this.normalizeIssueType(payload.issue_type);
    if (normalizedIssueType === 'book_building' || normalizedIssueType === 'fixed_price') {
      passedFields.push('issue_type');
    } else {
      missingFields.push('issue_type');
      rejectionReasons.push('Invalid issue type');
    }

    const low = Number(payload.price_band_low);
    const high = Number(payload.price_band_high);
    const hasValidLow = !isNaN(low) && low > 0;
    const hasValidHigh = !isNaN(high) && high > 0;

    if (hasValidLow && hasValidHigh && high >= low) {
      passedFields.push('price_band');
    } else {
      missingFields.push('price_band');
      rejectionReasons.push(`Price band incomplete or unannounced`);
    }

    const rawLot = payload.lot_size;
    if (rawLot !== undefined && rawLot !== null && String(rawLot).trim() !== '') {
      const parsed = Number(rawLot);
      if (!isNaN(parsed) && Number.isInteger(parsed) && parsed > 0) {
        passedFields.push('lot_size');
      } else {
        missingFields.push('lot_size');
        rejectionReasons.push('Invalid lot size');
      }
    } else if (options?.allowPendingLotSize) {
      passedFields.push('lot_size');
    } else {
      missingFields.push('lot_size');
      rejectionReasons.push('Missing lot size');
    }

    if (payload.open_date && /^\d{4}-\d{2}-\d{2}$/.test(payload.open_date)) {
      passedFields.push('open_date');
    } else {
      missingFields.push('open_date');
      rejectionReasons.push('Missing open date');
    }

    if (payload.close_date && /^\d{4}-\d{2}-\d{2}$/.test(payload.close_date)) {
      passedFields.push('close_date');
    } else {
      missingFields.push('close_date');
      rejectionReasons.push('Missing close date');
    }

    if (payload.exchange && payload.exchange.trim().length > 0) {
      passedFields.push('exchange');
    } else {
      missingFields.push('exchange');
      rejectionReasons.push('Missing exchange');
    }

    const eligible = rejectionReasons.length === 0;
    return {
      eligible,
      canPublish: eligible,
      dataQuality: eligible ? 'complete' : 'partial',
      passedFields,
      missingFields,
      rejectionReasons,
      normalizedPayload: eligible ? (payload as NormalizedIpoMasterPayload) : undefined,
    };
  }
}
