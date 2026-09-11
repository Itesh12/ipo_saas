/**
 * features/external-integrations/providers/providerTypes.ts
 *
 * Core external provider abstraction, capability models, and health definitions.
 * STRICT INVARIANT: Planned and disabled capabilities are not executable.
 */

export type ExternalProviderType =
  | 'depository'           // CDSL, NSDL
  | 'ipo_infrastructure'   // Exchange syndicate gateways (BSE, NSE)
  | 'registrar'            // Link Intime, KFintech, Bigshare
  | 'sponsor_bank'         // Banks routing UPI mandate requests to NPCI
  | 'scsb'                 // Self Certified Syndicate Banks (Bank ASBA)
  | 'upi';                 // NPCI UPI IPO mandate infrastructure

export type CapabilityState = 'unsupported' | 'planned' | 'disabled' | 'enabled';

export type IntegrationEnvironment = 'development' | 'staging' | 'production' | 'sandbox';

export interface ExternalProviderCapabilities {
  read_issue?: CapabilityState;
  verify_demat?: CapabilityState;
  read_application?: CapabilityState;
  read_mandate?: CapabilityState;
  read_allotment?: CapabilityState;
  read_refund?: CapabilityState;
  webhook_events?: CapabilityState;
  reconciliation?: CapabilityState;
  submit_application?: CapabilityState; // Strictly 'planned' in Stage 1 & 2
  create_mandate?: CapabilityState;     // Strictly 'planned' in Stage 1 & 2
  modify_application?: CapabilityState; // Strictly 'planned' in Stage 1 & 2
  cancel_application?: CapabilityState; // Strictly 'planned' in Stage 1 & 2
}

export type ProviderHealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'standby' | 'disabled' | 'not_configured' | 'planned';

export interface ProviderHealth {
  providerId: string;
  status: ProviderHealthStatus;
  latencyMs: number;
  lastCheckedAt: string;
  errorRatePercent: number;
  details?: string;
}

export interface ConfigurationValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface IExternalProvider {
  readonly providerId: string;
  readonly providerName: string;
  readonly providerType: ExternalProviderType;
  readonly environment: IntegrationEnvironment;
  readonly enabled: boolean;
  readonly capabilities: ExternalProviderCapabilities;
  getHealth(): Promise<ProviderHealth>;
  validateConfiguration(): Promise<ConfigurationValidationResult>;
}

export class CapabilityNotAvailableError extends Error {
  public readonly providerId: string;
  public readonly capability: string;
  public readonly state: CapabilityState;

  constructor(providerId: string, capability: string, state: CapabilityState) {
    super(
      `Capability '${capability}' is not available on provider '${providerId}' (current state: ${state}). ` +
      `Live external connectivity or application execution is deferred.`
    );
    this.name = 'CapabilityNotAvailableError';
    this.providerId = providerId;
    this.capability = capability;
    this.state = state;
  }
}
