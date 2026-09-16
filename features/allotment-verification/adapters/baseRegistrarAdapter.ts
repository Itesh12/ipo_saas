/**
 * features/allotment-verification/adapters/baseRegistrarAdapter.ts
 *
 * Base Registrar Adapter for Stage 4:
 * Provides standardized hashing, PII masking, response normalization, and invariant enforcement.
 * Guaranteed:
 * - SHA-256 hash of raw responses (raw HTML/JSON is never retained)
 * - Zero raw PII in normalized outputs
 * - Invariant: record_not_found maps strictly to unknown result
 */

import crypto from 'crypto';
import {
  LookupType,
  NormalizedAllotmentResult,
  RegistrarAdapterResponse,
  RegistrarQueryInput,
  VerificationAttemptStatus,
  VerificationResultType,
} from '../types/verificationTypes';

export abstract class BaseRegistrarAdapter {
  abstract readonly registrarCode: string;
  abstract readonly displayName: string;

  /**
   * Generates SHA-256 hash for raw responses or identifiers.
   */
  static sha256(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  }

  /**
   * Masks a PAN: e.g. "ABCDE1234F" -> "ABC****34F"
   */
  static maskPAN(pan: string): string {
    const clean = pan.trim().toUpperCase();
    if (clean.length !== 10) {
      return clean.length > 4 ? `${clean.slice(0, 2)}****${clean.slice(-2)}` : '****';
    }
    return `${clean.slice(0, 3)}****${clean.slice(7)}`;
  }

  /**
   * Masks an Application Number or DP Client ID
   */
  static maskIdentifier(identifier: string, type: LookupType): string {
    const clean = identifier.trim();
    if (type === 'pan') {
      return this.maskPAN(clean);
    }
    if (clean.length <= 4) {
      return '****';
    }
    const prefixLen = Math.min(3, Math.floor(clean.length / 3));
    const suffixLen = Math.min(3, Math.floor(clean.length / 3));
    return `${clean.slice(0, prefixLen)}****${clean.slice(-suffixLen)}`;
  }

  /**
   * Normalizes raw registrar values into standard NormalizedAllotmentResult
   * Enforces hard invariants:
   * 1. sharesAllotted <= sharesApplied
   * 2. Full allotment vs partial vs non-allotment classification
   */
  protected createNormalizedResult(params: {
    sharesApplied: number;
    sharesAllotted: number;
    lotsAllotted?: number;
    allotmentPrice?: number;
    reportedRefundAmount?: number;
    applicantNameMasked?: string;
    categoryCode?: string;
    depositoryClientIdMasked?: string;
    applicationNumberMasked?: string;
    registrarReference?: string;
    sourceObservedAt?: string;
  }): NormalizedAllotmentResult {
    const applied = Math.max(0, Math.floor(params.sharesApplied));
    const allotted = Math.min(applied, Math.max(0, Math.floor(params.sharesAllotted)));

    let resultType: VerificationResultType = 'unknown';
    if (allotted === applied && applied > 0) {
      resultType = 'allotted';
    } else if (allotted > 0 && allotted < applied) {
      resultType = 'partially_allotted';
    } else if (allotted === 0) {
      resultType = 'not_allotted';
    }

    return {
      resultType,
      sharesApplied: applied,
      sharesAllotted: allotted,
      lotsAllotted: params.lotsAllotted || 0,
      allotmentPrice: params.allotmentPrice,
      reportedRefundAmount: Math.max(0, params.reportedRefundAmount || 0),
      sourceObservedAt: params.sourceObservedAt || new Date().toISOString(),
      applicantNameMasked: params.applicantNameMasked,
      categoryCode: params.categoryCode,
      depositoryClientIdMasked: params.depositoryClientIdMasked,
      applicationNumberMasked: params.applicationNumberMasked,
      registrarReference: params.registrarReference,
    };
  }

  /**
   * Constructs a record_not_found response ensuring hard invariant:
   * resultType MUST NOT be 'not_allotted', it must be 'unknown'.
   */
  protected createRecordNotFoundResponse(rawResponse: string): RegistrarAdapterResponse {
    return {
      success: false,
      status: 'record_not_found',
      rawResponseHash: BaseRegistrarAdapter.sha256(rawResponse),
      errorCode: 'RECORD_NOT_FOUND',
      errorMessage:
        'No application or allotment record was located at the registrar for the supplied identifier.',
    };
  }

  /**
   * Executes verification query against the registrar.
   */
  abstract queryAllotment(input: RegistrarQueryInput): Promise<RegistrarAdapterResponse>;
}
