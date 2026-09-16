/**
 * features/allotment-verification/adapters/kfintechAdapter.ts
 *
 * KFin Technologies Limited Allotment Verification Adapter.
 * Public Portal: https://kosmic.kfintech.com/ipostatus/
 *
 * Adheres to Zero-Credential, Zero-Raw-PII, fail-closed challenge architecture.
 */

import { BaseRegistrarAdapter } from './baseRegistrarAdapter';
import { RegistrarAdapterResponse, RegistrarQueryInput } from '../types/verificationTypes';

export class KFintechAdapter extends BaseRegistrarAdapter {
  readonly registrarCode = 'kfintech';
  readonly displayName = 'KFin Technologies Limited';
  readonly portalUrl = 'https://kosmic.kfintech.com/ipostatus/';

  async queryAllotment(input: RegistrarQueryInput): Promise<RegistrarAdapterResponse> {
    const { captchaAnswer } = input;

    if (!captchaAnswer) {
      return {
        success: false,
        status: 'challenge_required',
        rawResponseHash: BaseRegistrarAdapter.sha256('CHALLENGE_REQUIRED_KFINTECH'),
        challengeRequired: true,
        challengePayload: {
          type: 'portal_redirect',
          portalUrl: this.portalUrl,
          instructions:
            'KFin Technologies requires interactive CAPTCHA verification on their official Kosmic portal. Use the link below to inspect your allotment status, then confirm the verified result.',
        },
        errorCode: 'CHALLENGE_REQUIRED',
        errorMessage: 'Interactive challenge verification is required by KFintech portal.',
      };
    }

    return {
      success: false,
      status: 'challenge_required',
      rawResponseHash: BaseRegistrarAdapter.sha256('CHALLENGE_REQUIRED_KFINTECH'),
      challengeRequired: true,
      challengePayload: {
        type: 'portal_redirect',
        portalUrl: this.portalUrl,
        instructions: 'Please verify directly on KFintech portal.',
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
    const mockAuditString = `KFINTECH_ASSISTED:${params.registrarReference || ''}:${params.sharesAllotted}:${normalized.sourceObservedAt}`;

    return {
      success: true,
      status: 'completed',
      normalizedResult: normalized,
      rawResponseHash: BaseRegistrarAdapter.sha256(mockAuditString),
      sourceObservedAt: normalized.sourceObservedAt,
    };
  }
}
