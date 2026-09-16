/**
 * features/allotment-verification/adapters/linkIntimeAdapter.ts
 *
 * Link Intime India Pvt Ltd Allotment Verification Adapter.
 * Public Portal: https://linkintime.co.in/initial_offer/public-issues.html
 *
 * Adheres strictly to Zero-Credential & Zero-Raw-PII architecture.
 * If CAPTCHA is required, returns challenge_required for Mode 2 (User-Assisted).
 */

import { BaseRegistrarAdapter } from './baseRegistrarAdapter';
import { RegistrarAdapterResponse, RegistrarQueryInput } from '../types/verificationTypes';

export class LinkIntimeAdapter extends BaseRegistrarAdapter {
  readonly registrarCode = 'link_intime';
  readonly displayName = 'Link Intime India Private Limited';
  readonly portalUrl = 'https://linkintime.co.in/initial_offer/public-issues.html';

  async queryAllotment(input: RegistrarQueryInput): Promise<RegistrarAdapterResponse> {
    const { registrarIssueId, lookupType, lookupValue, captchaAnswer } = input;

    // Link Intime requires an interactive CAPTCHA for direct lookup.
    // If no captchaAnswer is provided, return challenge_required so UI can display user-assisted flow
    if (!captchaAnswer) {
      return {
        success: false,
        status: 'challenge_required',
        rawResponseHash: BaseRegistrarAdapter.sha256('CHALLENGE_REQUIRED_LINK_INTIME'),
        challengeRequired: true,
        challengePayload: {
          type: 'portal_redirect',
          portalUrl: this.portalUrl,
          instructions:
            'Link Intime requires interactive security verification. Open the official Link Intime allotment portal, verify with your PAN/Application No, and confirm your allotment result.',
        },
        errorCode: 'CHALLENGE_REQUIRED',
        errorMessage: 'Interactive challenge verification is required by Link Intime portal.',
      };
    }

    try {
      // In live environment with user captcha answer or direct API
      // If mock/testing or automated endpoint:
      const rawResponseSimulated = JSON.stringify({
        registrar: 'link_intime',
        issue_id: registrarIssueId,
        lookup_type: lookupType,
        verified_at: new Date().toISOString(),
      });

      const rawResponseHash = BaseRegistrarAdapter.sha256(rawResponseSimulated);

      // Example parsing logic (or error if portal format changed)
      return {
        success: false,
        status: 'challenge_required',
        rawResponseHash,
        challengeRequired: true,
        challengePayload: {
          type: 'portal_redirect',
          portalUrl: this.portalUrl,
          instructions:
            'Please verify allotment directly on the Link Intime portal to ensure complete cryptographic security.',
        },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        status: 'network_error',
        rawResponseHash: BaseRegistrarAdapter.sha256(`ERROR:${msg}`),
        errorCode: 'NETWORK_ERROR',
        errorMessage: msg,
      };
    }
  }

  /**
   * Helper to normalize a verified user-assisted submission for Link Intime
   */
  normalizeAssistedSubmission(params: {
    sharesApplied: number;
    sharesAllotted: number;
    allotmentPrice?: number;
    reportedRefundAmount?: number;
    applicantNameMasked?: string;
    registrarReference?: string;
    sourceObservedAt?: string;
  }): RegistrarAdapterResponse {
    const normalized = this.createNormalizedResult(params);
    const mockAuditString = `LINK_INTIME_ASSISTED:${params.registrarReference || ''}:${params.sharesAllotted}:${normalized.sourceObservedAt}`;

    return {
      success: true,
      status: 'completed',
      normalizedResult: normalized,
      rawResponseHash: BaseRegistrarAdapter.sha256(mockAuditString),
      sourceObservedAt: normalized.sourceObservedAt,
    };
  }
}
