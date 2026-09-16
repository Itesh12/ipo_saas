/**
 * features/allotment-verification/adapters/bigshareAdapter.ts
 *
 * Bigshare Services Private Limited Allotment Verification Adapter.
 * Public Portal: https://ipo.bigshareonline.com/
 *
 * Adheres to Zero-Credential, Zero-Raw-PII, fail-closed challenge architecture.
 */

import { BaseRegistrarAdapter } from './baseRegistrarAdapter';
import { RegistrarAdapterResponse, RegistrarQueryInput } from '../types/verificationTypes';

export class BigshareAdapter extends BaseRegistrarAdapter {
  readonly registrarCode = 'bigshare';
  readonly displayName = 'Bigshare Services Private Limited';
  readonly portalUrl = 'https://ipo.bigshareonline.com/';

  async queryAllotment(input: RegistrarQueryInput): Promise<RegistrarAdapterResponse> {
    const { captchaAnswer } = input;

    if (!captchaAnswer) {
      return {
        success: false,
        status: 'challenge_required',
        rawResponseHash: BaseRegistrarAdapter.sha256('CHALLENGE_REQUIRED_BIGSHARE'),
        challengeRequired: true,
        challengePayload: {
          type: 'portal_redirect',
          portalUrl: this.portalUrl,
          instructions:
            'Bigshare Services requires interactive verification. Navigate to the Bigshare portal, check your status, and record the verified result.',
        },
        errorCode: 'CHALLENGE_REQUIRED',
        errorMessage: 'Interactive challenge verification is required by Bigshare portal.',
      };
    }

    return {
      success: false,
      status: 'challenge_required',
      rawResponseHash: BaseRegistrarAdapter.sha256('CHALLENGE_REQUIRED_BIGSHARE'),
      challengeRequired: true,
      challengePayload: {
        type: 'portal_redirect',
        portalUrl: this.portalUrl,
        instructions: 'Please verify directly on Bigshare portal.',
      },
    };
  }

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
    const mockAuditString = `BIGSHARE_ASSISTED:${params.registrarReference || ''}:${params.sharesAllotted}:${normalized.sourceObservedAt}`;

    return {
      success: true,
      status: 'completed',
      normalizedResult: normalized,
      rawResponseHash: BaseRegistrarAdapter.sha256(mockAuditString),
      sourceObservedAt: normalized.sourceObservedAt,
    };
  }
}
