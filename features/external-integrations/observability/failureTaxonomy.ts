/**
 * features/external-integrations/observability/failureTaxonomy.ts
 *
 * Standardized 16-code Failure Taxonomy for External Integrations.
 * Classifies operational vs security failures, retryability, and operator actionability.
 */

export type IntegrationFailureCategory =
  | 'request'
  | 'security'
  | 'protocol'
  | 'network'
  | 'ingestion'
  | 'integrity';

export type IntegrationFailureCode =
  | 'validation_error'
  | 'authentication_error'
  | 'authorization_error'
  | 'signature_verification_failure'
  | 'replay_attack_detected'
  | 'duplicate_event'
  | 'provider_unavailable'
  | 'timeout'
  | 'rate_limited'
  | 'malformed_provider_response'
  | 'unsupported_capability'
  | 'disabled_capability'
  | 'planned_capability'
  | 'configuration_missing'
  | 'internal_processing_error'
  | 'reconciliation_discrepancy';

export interface FailureClassification {
  code: IntegrationFailureCode;
  category: IntegrationFailureCategory;
  retryable: boolean;
  securitySignificant: boolean;
  operatorActionable: boolean;
  defaultSeverity: 'critical' | 'high' | 'medium' | 'low';
  sanitizedMessage: string;
}

export const FAILURE_TAXONOMY: Record<IntegrationFailureCode, FailureClassification> = {
  validation_error: {
    code: 'validation_error',
    category: 'request',
    retryable: false,
    securitySignificant: false,
    operatorActionable: false,
    defaultSeverity: 'low',
    sanitizedMessage: 'Request parameters failed validation constraints.',
  },
  authentication_error: {
    code: 'authentication_error',
    category: 'security',
    retryable: false,
    securitySignificant: true,
    operatorActionable: true,
    defaultSeverity: 'high',
    sanitizedMessage: 'Authentication credentials rejected or invalid.',
  },
  authorization_error: {
    code: 'authorization_error',
    category: 'security',
    retryable: false,
    securitySignificant: true,
    operatorActionable: true,
    defaultSeverity: 'high',
    sanitizedMessage: 'Caller lacks required role or permission for operation.',
  },
  signature_verification_failure: {
    code: 'signature_verification_failure',
    category: 'security',
    retryable: false,
    securitySignificant: true,
    operatorActionable: true,
    defaultSeverity: 'high',
    sanitizedMessage: 'Inbound webhook payload cryptographic signature verification failed.',
  },
  replay_attack_detected: {
    code: 'replay_attack_detected',
    category: 'security',
    retryable: false,
    securitySignificant: true,
    operatorActionable: true,
    defaultSeverity: 'critical',
    sanitizedMessage: 'Webhook delivery timestamp exceeds maximum allowed clock skew window.',
  },
  duplicate_event: {
    code: 'duplicate_event',
    category: 'ingestion',
    retryable: false,
    securitySignificant: false,
    operatorActionable: false,
    defaultSeverity: 'low',
    sanitizedMessage: 'External event has already been recorded and processed idempotently.',
  },
  provider_unavailable: {
    code: 'provider_unavailable',
    category: 'network',
    retryable: true,
    securitySignificant: false,
    operatorActionable: true,
    defaultSeverity: 'high',
    sanitizedMessage: 'External provider endpoint is unreachable or returning 5xx.',
  },
  timeout: {
    code: 'timeout',
    category: 'network',
    retryable: true,
    securitySignificant: false,
    operatorActionable: false,
    defaultSeverity: 'medium',
    sanitizedMessage: 'Network request timed out before provider response was received.',
  },
  rate_limited: {
    code: 'rate_limited',
    category: 'network',
    retryable: true,
    securitySignificant: false,
    operatorActionable: true,
    defaultSeverity: 'medium',
    sanitizedMessage: 'Provider rate limits exceeded; backoff and retry required.',
  },
  malformed_provider_response: {
    code: 'malformed_provider_response',
    category: 'protocol',
    retryable: false,
    securitySignificant: false,
    operatorActionable: true,
    defaultSeverity: 'high',
    sanitizedMessage: 'Provider returned an unparseable or schema-violating payload.',
  },
  unsupported_capability: {
    code: 'unsupported_capability',
    category: 'protocol',
    retryable: false,
    securitySignificant: false,
    operatorActionable: false,
    defaultSeverity: 'medium',
    sanitizedMessage: 'Requested capability is not supported by the provider architecture.',
  },
  disabled_capability: {
    code: 'disabled_capability',
    category: 'protocol',
    retryable: false,
    securitySignificant: false,
    operatorActionable: true,
    defaultSeverity: 'medium',
    sanitizedMessage: 'Requested capability has been disabled by administrative policy.',
  },
  planned_capability: {
    code: 'planned_capability',
    category: 'protocol',
    retryable: false,
    securitySignificant: false,
    operatorActionable: false,
    defaultSeverity: 'low',
    sanitizedMessage: 'Requested capability is planned for a future integration stage.',
  },
  configuration_missing: {
    code: 'configuration_missing',
    category: 'protocol',
    retryable: false,
    securitySignificant: false,
    operatorActionable: true,
    defaultSeverity: 'high',
    sanitizedMessage: 'Required operational configuration parameters are missing.',
  },
  internal_processing_error: {
    code: 'internal_processing_error',
    category: 'ingestion',
    retryable: true,
    securitySignificant: false,
    operatorActionable: true,
    defaultSeverity: 'high',
    sanitizedMessage: 'Internal integration pipeline encountered an unhandled exception.',
  },
  reconciliation_discrepancy: {
    code: 'reconciliation_discrepancy',
    category: 'integrity',
    retryable: false,
    securitySignificant: false,
    operatorActionable: true,
    defaultSeverity: 'high',
    sanitizedMessage: 'Discrepancy detected between internal ledger and external provider records.',
  },
};

export class IntegrationError extends Error {
  public readonly code: IntegrationFailureCode;
  public readonly category: IntegrationFailureCategory;
  public readonly retryable: boolean;
  public readonly securitySignificant: boolean;
  public readonly operatorActionable: boolean;
  public readonly severity: 'critical' | 'high' | 'medium' | 'low';
  public readonly context: Record<string, unknown>;

  constructor(
    code: IntegrationFailureCode,
    detail?: string,
    context: Record<string, unknown> = {}
  ) {
    const classification = FAILURE_TAXONOMY[code];
    super(detail ? `${classification.sanitizedMessage} (${detail})` : classification.sanitizedMessage);
    this.name = 'IntegrationError';
    this.code = code;
    this.category = classification.category;
    this.retryable = classification.retryable;
    this.securitySignificant = classification.securitySignificant;
    this.operatorActionable = classification.operatorActionable;
    this.severity = classification.defaultSeverity;
    this.context = context;
  }
}
