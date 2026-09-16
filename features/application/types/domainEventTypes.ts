/**
 * features/application/types/domainEventTypes.ts
 *
 * Canonical Domain Event Definitions for Phase 10 / Stage 5.
 * Strictly implements Revision 3 specification:
 * - Deterministic event_id (delivery identity)
 * - Deterministic idempotency_key (business operation identity)
 * - Typed payload for Phase 5 financial and portfolio consumption
 */

export type DomainEventProcessingStatus = 'RECEIVED' | 'PROCESSING' | 'PROCESSED' | 'FAILED';

export interface CanonicalDomainEvent<T = Record<string, unknown>> {
  eventId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  idempotencyKey: string;
  timestamp: string;
  actorId?: string | null;
  payload: T;
}

export interface AllotmentVerifiedPayload {
  allotmentId: string;
  ipoId: string;
  applicationId: string;
  status: 'allotted' | 'partially_allotted' | 'not_allotted';
  sharesApplied: number;
  sharesAllotted: number;
  allotmentPrice: number;
  reportedRefundAmount: number;
  evidenceClassification: string;
  verifiedAt: string;
}

export type AllotmentVerifiedEvent = CanonicalDomainEvent<AllotmentVerifiedPayload> & {
  eventType: 'allotment_verified';
  aggregateType: 'ipo_application';
};

export interface ProcessedDomainEventRecord {
  id: string;
  event_id: string;
  idempotency_key: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  processing_status: DomainEventProcessingStatus;
  processing_owner_id?: string | null;
  processing_lease_expires_at?: string | null;
  attempt_count: number;
  received_at: string;
  last_attempt_at: string;
  processed_at?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  result_summary?: Record<string, unknown> | null;
}
