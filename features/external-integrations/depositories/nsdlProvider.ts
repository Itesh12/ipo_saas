/**
 * features/external-integrations/depositories/nsdlProvider.ts
 *
 * National Securities Depository Limited provider definition.
 * STRICT INVARIANT: Zero live network calls in Stage 1. Format validation and informational contracts only.
 */

import {
  IDepositoryProvider,
  DematFormatValidationResult,
  BeneficiaryAccountVerificationRequest,
  BeneficiaryAccountVerificationResult,
  validateNsdlAccountId,
} from './depositoryTypes';
import {
  ExternalProviderCapabilities,
  ProviderHealth,
  ConfigurationValidationResult,
  IntegrationEnvironment,
} from '../providers/providerTypes';

export class NsdlDepositoryProvider implements IDepositoryProvider {
  public readonly providerId = 'nsdl';
  public readonly providerName = 'National Securities Depository Limited';
  public readonly providerType = 'depository' as const;
  public readonly depositoryType = 'nsdl' as const;
  public readonly environment: IntegrationEnvironment;
  public readonly enabled: boolean;

  public readonly capabilities: ExternalProviderCapabilities = {
    verify_demat: 'disabled', // Planned for Stage 3
    read_allotment: 'planned',
    reconciliation: 'planned',
    webhook_events: 'unsupported',
    submit_application: 'unsupported', // Depository does NOT execute IPO bids
    create_mandate: 'unsupported',     // Depository does NOT issue UPI mandates
  };

  constructor(options?: { environment?: IntegrationEnvironment; enabled?: boolean }) {
    this.environment = options?.environment ?? 'development';
    this.enabled = options?.enabled ?? false;
  }

  public validateFormat(rawReference: string): DematFormatValidationResult {
    return validateNsdlAccountId(rawReference);
  }

  public maskReference(rawReference: string): string {
    const res = this.validateFormat(rawReference);
    if (!res.valid || !res.maskedReference) {
      return 'XXXX-INVALID-NSDL';
    }
    return res.maskedReference;
  }

  /**
   * Stage 1 informational verification.
   * STRICT GUARDRAIL 1: Does NOT connect to live NSDL and does NOT mark account as verified.
   */
  public async verifyAccountInformational(
    request: BeneficiaryAccountVerificationRequest
  ): Promise<BeneficiaryAccountVerificationResult> {
    const formatCheck = this.validateFormat(request.rawReference);

    if (!formatCheck.valid) {
      return {
        verified: false,
        status: 'invalid_format',
        depositoryType: 'nsdl',
        maskedReference: 'XXXX-INVALID',
        message: formatCheck.errorMessage || 'Invalid NSDL account format.',
      };
    }

    return {
      verified: false, // Invariant: Cannot be verified through external integration in Stage 1
      status: 'unverified_stage1',
      depositoryType: 'nsdl',
      maskedReference: formatCheck.maskedReference!,
      message: 'Format verified locally. External NSDL connection is deferred to Stage 3.',
    };
  }

  public async getHealth(): Promise<ProviderHealth> {
    return {
      providerId: this.providerId,
      status: this.enabled ? 'healthy' : 'standby',
      latencyMs: 0,
      lastCheckedAt: new Date().toISOString(),
      errorRatePercent: 0,
      details: 'Stage 1 provider registered in standby mode (zero external connections).',
    };
  }

  public async validateConfiguration(): Promise<ConfigurationValidationResult> {
    return {
      valid: true,
      errors: [],
      warnings: ['NSDL integration is operating in Stage 1 contract mode.'],
    };
  }
}

export const nsdlProvider = new NsdlDepositoryProvider();
