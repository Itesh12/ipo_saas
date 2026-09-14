/**
 * features/external-integrations/gmp/gmpValidator.ts
 *
 * Phase 9 Stage 3D: Grey Market Premium (GMP) Observation Validator.
 * 
 * Invariants:
 * 1. Price Band Floor Guard: GMP cannot imply a listing price < 0 (i.e. reported_gmp >= -issue_price).
 * 2. TBA Price Band Protection: When price band is not finalized, estimated listing price & gain % must remain NULL.
 * 3. Extreme Spike Quarantine: Flags reported_gmp > 250% of issue price or sudden intraday jump > 150%.
 * 4. Kostak / Sauda Isolation: Non-negative rates per application/allotment, strictly independent from share GMP.
 * 5. Listing Freeze: Post-listing quotes strictly rejected if quote_time >= confirmed_listing_timestamp.
 */

import { NormalizedGMPObservation, RawOTCPayload, GMPAnomalyStatus } from './gmpTypes';
import { IPOVerificationStatus } from '@/types/database.types';
import crypto from 'crypto';

export interface IPOInstrumentContext {
  id: string;
  symbol?: string | null;
  companyName: string;
  priceBandLow?: number | null;
  priceBandHigh?: number | null;
  issuePrice?: number | null;
  isListingConfirmed?: boolean;
  confirmedListingTimestamp?: string | null;
  lastValidGmp?: number | null;
  lastQuoteTime?: string | null;
}

export interface ValidationOutput {
  normalizedObservation: NormalizedGMPObservation;
  isValidForConsensus: boolean;
  rejectionReason?: string | null;
}

export class GMPValidator {
  /**
   * Normalizes and validates a raw OTC observation payload against an IPO instrument context.
   */
  public validateRawObservation(
    raw: RawOTCPayload,
    ipoContext: IPOInstrumentContext,
    currentTimestamp?: string | number
  ): ValidationOutput {
    const rawPayloadHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(raw))
      .digest('hex');

    const sourceObservationUid = `${raw.sourceId}_${raw.quoteTimestamp}_${rawPayloadHash.slice(0, 12)}`;

    let anomalyStatus: GMPAnomalyStatus = 'valid';
    let anomalyReason: string | null = null;
    let validationStatus: IPOVerificationStatus = 'unverified';
    let isValidForConsensus = true;

    // Parse numeric fields
    const reportedGmp = this.parseNumeric(raw.rawGmp);
    const reportedKostak = this.parseNumeric(raw.rawKostak);
    const reportedSauda = this.parseNumeric(raw.rawSubjectToSauda);

    // 1. Timestamp validation (no future timestamps with >5min tolerance)
    const quoteEpoch = new Date(raw.quoteTimestamp).getTime();
    const nowEpoch =
      typeof currentTimestamp === 'number'
        ? currentTimestamp
        : currentTimestamp
        ? new Date(currentTimestamp).getTime()
        : Date.now();

    if (isNaN(quoteEpoch)) {
      anomalyStatus = 'invalid';
      anomalyReason = 'Malformed quote timestamp';
      isValidForConsensus = false;
    } else if (quoteEpoch > nowEpoch + 5 * 60 * 1000) {
      anomalyStatus = 'invalid';
      anomalyReason = 'Future quote timestamp beyond skew allowance (5 minutes)';
      isValidForConsensus = false;
    }

    // 2. Post-listing freeze check
    if (
      isValidForConsensus &&
      ipoContext.isListingConfirmed &&
      ipoContext.confirmedListingTimestamp
    ) {
      const listingEpoch = new Date(ipoContext.confirmedListingTimestamp).getTime();
      if (!isNaN(listingEpoch) && quoteEpoch >= listingEpoch) {
        anomalyStatus = 'invalid';
        anomalyReason = 'Quote timestamp is post-listing. GMP lifecycle is frozen post-listing.';
        isValidForConsensus = false;
      }
    }

    // 3. Issue price and Floor Guard check
    const referencePrice = ipoContext.priceBandHigh ?? ipoContext.issuePrice ?? null;

    if (isValidForConsensus && reportedGmp !== null) {
      if (referencePrice !== null && referencePrice > 0) {
        // Floor Guard: Discount cannot exceed 100% of issue price
        if (reportedGmp < -referencePrice) {
          anomalyStatus = 'invalid';
          anomalyReason = `Reported GMP (₹${reportedGmp}) implies negative listing price below ₹0 floor.`;
          isValidForConsensus = false;
        }

        // Extreme spike quarantine: >250% premium
        if (reportedGmp > referencePrice * 2.5) {
          anomalyStatus = 'spike_quarantined';
          anomalyReason = `Reported GMP (₹${reportedGmp}) exceeds extreme spike ceiling (>250% of ₹${referencePrice}). Quarantined.`;
          isValidForConsensus = false;
        }

        // Jump spike check: if prior quote within 4 hours jumps by >150%
        if (
          isValidForConsensus &&
          ipoContext.lastValidGmp !== null &&
          ipoContext.lastValidGmp !== undefined &&
          ipoContext.lastQuoteTime
        ) {
          const priorTime = new Date(ipoContext.lastQuoteTime).getTime();
          const hourDiff = Math.abs(quoteEpoch - priorTime) / (1000 * 60 * 60);
          if (hourDiff <= 4.0 && Math.abs(ipoContext.lastValidGmp) > 5) {
            const jumpPct =
              (Math.abs(reportedGmp - ipoContext.lastValidGmp) /
                Math.max(Math.abs(ipoContext.lastValidGmp), 1.0)) *
              100;
            if (jumpPct > 150.0) {
              anomalyStatus = 'spike_quarantined';
              anomalyReason = `Sudden intraday jump of ${jumpPct.toFixed(1)}% within 4h. Flagged for audit quarantine.`;
              isValidForConsensus = false;
            }
          }
        }
      }
    }

    // 4. Kostak & Subject to Sauda sanity (must be non-negative)
    if (reportedKostak !== null && reportedKostak < 0) {
      anomalyStatus = 'invalid';
      anomalyReason = `Negative Kostak rate (₹${reportedKostak}) is impermissible.`;
      isValidForConsensus = false;
    }

    if (reportedSauda !== null && reportedSauda < 0) {
      anomalyStatus = 'invalid';
      anomalyReason = `Negative Subject to Sauda rate (₹${reportedSauda}) is impermissible.`;
      isValidForConsensus = false;
    }

    // If valid for consensus and source is trusted/verified, set to verified
    if (isValidForConsensus && anomalyStatus === 'valid') {
      validationStatus = 'verified';
    }

    const normalizedObservation: NormalizedGMPObservation = {
      ipo_id: ipoContext.id,
      source_observation_uid: sourceObservationUid,
      source_observation_hash: rawPayloadHash,
      gmp_source: raw.sourceId,
      source_family: raw.sourceFamily,
      publisher_id: raw.publisherId,
      upstream_source_id: raw.upstreamSourceId ?? null,
      independence_group: raw.independenceGroup,
      quote_time: raw.quoteTimestamp,
      reported_gmp_value: reportedGmp,
      reported_kostak: reportedKostak,
      reported_subject_to_sauda: reportedSauda,
      sauda_condition_notes: raw.saudaConditionNotes ?? null,
      anomaly_status: anomalyStatus,
      anomaly_reason: anomalyReason,
      validation_status: validationStatus,
      raw_payload_hash: rawPayloadHash,
    };

    return {
      normalizedObservation,
      isValidForConsensus,
      rejectionReason: anomalyReason,
    };
  }

  private parseNumeric(val: number | string | null | undefined): number | null {
    if (val === null || val === undefined || val === '') return null;
    const n = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^0-9.-]/g, ''));
    return isNaN(n) ? null : n;
  }
}

export const gmpValidator = new GMPValidator();
