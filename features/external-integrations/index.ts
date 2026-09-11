/**
 * features/external-integrations/index.ts
 *
 * Public barrel export for Phase 9 External Integration Foundation.
 */

// Providers & Registry
export * from './providers/providerTypes';
export * from './providers/providerRegistry';

// Depositories
export * from './depositories/depositoryTypes';
export * from './depositories/cdslProvider';
export * from './depositories/nsdlProvider';

// IPO Infrastructure (Contracts only)
export * from './ipo-infrastructure/ipoInfrastructureTypes';

// Registrars (Contracts only)
export * from './registrars/registrarTypes';

// External Accounts
export * from './external-accounts/externalAccountTypes';
export * from './external-accounts/externalAccountService';

// External Events
export * from './external-events/externalEventTypes';
export * from './external-events/externalEventService';

// Webhooks
export * from './webhooks/webhookTypes';
export * from './webhooks/webhookVerifier';

// Reconciliation
export * from './reconciliation/reconciliationTypes';
export * from './reconciliation/reconciliationEngine';

// Health & Telemetry
export * from './health/integrationHealthService';

// Security & Guardrails
export * from './security/prohibitedCredentials';
export * from './security/payloadSecurity';
export * from './security/secretRotation';

// Observability & Diagnostics (Stage 2)
export * from './observability/failureTaxonomy';
export * from './observability/integrationTracer';
export * from './observability/integrationMetrics';
export * from './observability/alertContracts';

// Pruning Service (Stage 2)
export * from './pruning/pruningService';

// Phase 8 Audit Adapter
export * from './audit/integrationAuditAdapter';

// Stage 3A: Broker-Independent Real IPO Master Data Ingestion
export * from './ipo-master/ipoMasterTypes';
export * from './adapters/sebiExtractor';
export * from './adapters/nseExtractor';
export * from './adapters/bseExtractor';
export * from './adapters/upstoxAdapter';
export * from './services/canonicalIpoResolver';
export * from './services/ipoIngestionService';
export * from './actions/ingestionActions';

