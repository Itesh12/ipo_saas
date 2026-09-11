/**
 * features/external-integrations/external-events/externalEventTypes.ts
 *
 * Durable external event inbox types, lifecycle statuses, and normalization contracts.
 */

import { ExternalProviderType, IntegrationEnvironment } from '../providers/providerTypes';

export type ExternalEventStatus =
  | 'received'
  | 'processing'
  | 'processed'
  | 'failed'
  | 'ignored';

export interface ExternalEventRecord {
  id: string;
  providerId: string;
  providerType: ExternalProviderType;
  providerEventId?: string;
  eventType: string;
  environment: IntegrationEnvironment;
  payloadHash: string;
  payload: Record<string, unknown>;
  normalizedEventType?: string;
  status: ExternalEventStatus;
  attemptCount: number;
  errorMessage?: string;
  receivedAt: string;
  processedAt?: string;
  metadata: Record<string, unknown>;
}

export interface IngestExternalEventParams {
  providerId: string;
  providerType: ExternalProviderType;
  providerEventId?: string;
  eventType: string;
  environment?: IntegrationEnvironment;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export type NormalizedExternalStatus =
  | 'PENDING'
  | 'SUBMITTED'
  | 'CONFIRMED'
  | 'MANDATE_PENDING'
  | 'MANDATE_APPROVED'
  | 'MANDATE_FAILED'
  | 'ALLOTTED'
  | 'NOT_ALLOTTED'
  | 'PARTIALLY_ALLOTTED'
  | 'REJECTED'
  | 'UNKNOWN';

export interface StatusNormalizationResult {
  rawStatus: string;
  normalizedStatus: NormalizedExternalStatus;
  providerType: ExternalProviderType;
  confidence: 'definitive' | 'inferred' | 'unrecognized';
}
