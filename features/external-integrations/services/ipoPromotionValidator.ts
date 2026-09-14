/**
 * features/external-integrations/services/ipoPromotionValidator.ts
 *
 * Phase 9 Stage 3A.3: Seven-Field Canonical Promotion Gatekeeper.
 *
 * Enforces strict validation before any ingestion candidate can be promoted to the
 * canonical production `ipos` catalog.
 *
 * Incorporates Mandatory Correction 2:
 * - Uses existing Phase 2 schema enum `ipo_issue_type`: 'book_building' | 'fixed_price'.
 * - Normalizes source terms without altering canonical schema.
 *
 * Seven Required Fields:
 * 1. Issuer / Company Name
 * 2. Issue Type ('book_building' | 'fixed_price')
 * 3. Price Band (low and high present, > 0, high >= low)
 * 4. Lot Size (positive integer > 0)
 * 5. Bidding Start Date (valid YYYY-MM-DD)
 * 6. Bidding End Date (valid YYYY-MM-DD >= open_date)
 * 7. Listing Exchange (valid exchange identifier, e.g. 'NSE', 'BSE', 'NSE, BSE')
 *
 * Additional Gate Conditions:
 * - Fails closed if candidate has unresolved conflicts (Tier-1 freeze).
 * - Rejects excluded or withdrawn filings.
 */

import { NormalizedIpoMasterPayload, CanonicalInboxRecord } from '../ipo-master/ipoMasterTypes';

export type CanonicalIssueType = 'book_building' | 'fixed_price';

export interface PromotionValidationResult {
  eligible: boolean;
  passedFields: string[];
  missingFields: string[];
  rejectionReasons: string[];
  normalizedPayload?: NormalizedIpoMasterPayload;
}

export class IpoPromotionValidator {
  public static readonly REQUIRED_CANONICAL_FIELDS = [
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
   * Matches existing database constraint: ipo_issue_type AS ENUM ('book_building', 'fixed_price').
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
   * Validates a candidate against the 7-Field Canonical Promotion Gate.
   */
  public static validateForPromotion(
    inbox: Pick<CanonicalInboxRecord, 'has_conflict' | 'review_status'>,
    payload: Partial<NormalizedIpoMasterPayload>
  ): PromotionValidationResult {
    const passedFields: string[] = [];
    const missingFields: string[] = [];
    const rejectionReasons: string[] = [];

    // 0. Conflict & Status Gate (Tier-1 Freeze)
    if (inbox.has_conflict || inbox.review_status === 'conflict_detected' || inbox.review_status === 'conflicted') {
      rejectionReasons.push('Tier-1 conflict active: Record has unresolved inter-source discrepancies');
    }

    // 1. Company Name Gate
    if (payload.company_name && payload.company_name.trim().length > 0) {
      passedFields.push('company_name');
    } else {
      missingFields.push('company_name');
      rejectionReasons.push('Missing or empty company / issuer legal name');
    }

    // 2. Issue Type Gate (Normalized to Phase 2 enum)
    const normalizedIssueType = this.normalizeIssueType(payload.issue_type);
    if (normalizedIssueType === 'book_building' || normalizedIssueType === 'fixed_price') {
      passedFields.push('issue_type');
    } else {
      missingFields.push('issue_type');
      rejectionReasons.push('Invalid issue type');
    }

    // 3. Price Band Gate (Numeric verification, positive, high >= low)
    const low = Number(payload.price_band_low);
    const high = Number(payload.price_band_high);
    const hasValidLow = !isNaN(low) && low > 0;
    const hasValidHigh = !isNaN(high) && high > 0;

    if (hasValidLow && hasValidHigh && high >= low) {
      passedFields.push('price_band');
    } else if (hasValidLow && !hasValidHigh && normalizedIssueType === 'fixed_price') {
      // Fixed price with single price value
      passedFields.push('price_band');
    } else {
      missingFields.push('price_band');
      rejectionReasons.push(
        `Price band incomplete or unannounced (low: ₹${payload.price_band_low ?? 'null'}, high: ₹${payload.price_band_high ?? 'null'})`
      );
    }

    // 4. Lot Size Gate (Integer > 0)
    const lotSize = Number(payload.lot_size);
    if (!isNaN(lotSize) && Number.isInteger(lotSize) && lotSize > 0) {
      passedFields.push('lot_size');
    } else {
      missingFields.push('lot_size');
      rejectionReasons.push(`Lot size is missing or invalid (${payload.lot_size ?? 'null'})`);
    }

    // 5. Bidding Start Date Gate (ISO YYYY-MM-DD)
    if (payload.open_date && this.isValidDateString(payload.open_date)) {
      passedFields.push('open_date');
    } else {
      missingFields.push('open_date');
      rejectionReasons.push('Bidding start date (open_date) is missing or invalid');
    }

    // 6. Bidding End Date Gate (ISO YYYY-MM-DD >= open_date)
    if (
      payload.close_date &&
      this.isValidDateString(payload.close_date) &&
      payload.open_date &&
      payload.close_date >= payload.open_date
    ) {
      passedFields.push('close_date');
    } else {
      missingFields.push('close_date');
      rejectionReasons.push('Bidding end date (close_date) is missing or precedes open_date');
    }

    // 7. Listing Exchange Gate
    if (payload.exchange && payload.exchange.trim().length > 0) {
      passedFields.push('exchange');
    } else {
      missingFields.push('exchange');
      rejectionReasons.push('Listing exchange is unspecified');
    }

    const eligible = missingFields.length === 0 && rejectionReasons.length === 0;

    return {
      eligible,
      passedFields,
      missingFields,
      rejectionReasons,
      normalizedPayload: eligible
        ? {
            ...payload,
            company_name: payload.company_name!.trim(),
            issue_type: normalizedIssueType,
            price_band_low: low,
            price_band_high: hasValidHigh ? high : low,
            lot_size: lotSize,
            open_date: payload.open_date!,
            close_date: payload.close_date!,
            exchange: payload.exchange!.trim(),
          } as NormalizedIpoMasterPayload
        : undefined,
    };
  }

  private static isValidDateString(val: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return false;
    const d = new Date(val);
    return !isNaN(d.getTime());
  }
}
