/**
 * features/external-integrations/external-events/externalEventService.ts
 *
 * Durable external event ingestion, contract-only status normalization, and size validation.
 *
 * STRICT INVARIANTS:
 * - External events are persisted in 'received' state. Active worker daemons are deferred.
 * - Status normalizer is pure transformation: ZERO mutations of Phase 4 database records.
 * - Prohibited credentials (PINs, OTPs, passwords) are rejected at ingestion time.
 * - Enforces application-level payload (256 KB) and metadata (64 KB) limits.
 */

import {
  ExternalEventRecord,
  IngestExternalEventParams,
  StatusNormalizationResult,
} from './externalEventTypes';
import { ExternalProviderType } from '../providers/providerTypes';
import { hashPayload, createPrunedPayloadMarker, isPayloadExpired } from '../security/payloadSecurity';
import { assertNoProhibitedCredentials } from '../security/prohibitedCredentials';
import { IntegrationError } from '../observability/failureTaxonomy';

export const MAX_PAYLOAD_BYTES = 262144; // 256 KB
export const MAX_METADATA_BYTES = 65536; // 64 KB

export class ExternalEventService {
  /**
   * Pure deterministic status normalizer.
   * STRICT GUARDRAIL: Does not mutate Phase 4 application/mandate/allotment records.
   */
  public normalizeExternalStatus(
    providerType: ExternalProviderType,
    rawStatus: string
  ): StatusNormalizationResult {
    const s = rawStatus.trim().toUpperCase();

    if (providerType === 'ipo_infrastructure') {
      switch (s) {
        case 'ACCEPTED_BY_EXCHANGE':
        case 'CONFIRMED':
          return { rawStatus, normalizedStatus: 'CONFIRMED', providerType, confidence: 'definitive' };
        case 'SUBMITTED':
        case 'BID_PLACED':
          return { rawStatus, normalizedStatus: 'SUBMITTED', providerType, confidence: 'definitive' };
        case 'REJECTED':
        case 'REJECTED_BY_EXCHANGE':
          return { rawStatus, normalizedStatus: 'REJECTED', providerType, confidence: 'definitive' };
        case 'PENDING':
        case 'IN_PROGRESS':
          return { rawStatus, normalizedStatus: 'PENDING', providerType, confidence: 'inferred' };
        default:
          return { rawStatus, normalizedStatus: 'UNKNOWN', providerType, confidence: 'unrecognized' };
      }
    }

    if (providerType === 'upi' || providerType === 'sponsor_bank') {
      switch (s) {
        case 'REQUESTED':
        case 'INITIATED':
          return { rawStatus, normalizedStatus: 'MANDATE_PENDING', providerType, confidence: 'definitive' };
        case 'SUCCESS':
        case 'APPROVED':
        case 'AUTHENTICATED':
          return { rawStatus, normalizedStatus: 'MANDATE_APPROVED', providerType, confidence: 'definitive' };
        case 'FAILED':
        case 'DECLINED':
        case 'EXPIRED':
          return { rawStatus, normalizedStatus: 'MANDATE_FAILED', providerType, confidence: 'definitive' };
        default:
          return { rawStatus, normalizedStatus: 'UNKNOWN', providerType, confidence: 'unrecognized' };
      }
    }

    if (providerType === 'registrar') {
      switch (s) {
        case 'ALLOTTED':
        case 'FULL_ALLOTMENT':
          return { rawStatus, normalizedStatus: 'ALLOTTED', providerType, confidence: 'definitive' };
        case 'PARTIALLY_ALLOTTED':
        case 'PARTIAL':
          return { rawStatus, normalizedStatus: 'PARTIALLY_ALLOTTED', providerType, confidence: 'definitive' };
        case 'NOT_ALLOTTED':
        case 'NON_ALLOTMENT':
          return { rawStatus, normalizedStatus: 'NOT_ALLOTTED', providerType, confidence: 'definitive' };
        case 'REJECTED':
          return { rawStatus, normalizedStatus: 'REJECTED', providerType, confidence: 'definitive' };
        default:
          return { rawStatus, normalizedStatus: 'UNKNOWN', providerType, confidence: 'unrecognized' };
      }
    }

    return { rawStatus, normalizedStatus: 'UNKNOWN', providerType, confidence: 'unrecognized' };
  }

  /**
   * Validates and prepares an external event for durable ingestion.
   * Rejects prohibited credentials and oversized payloads before DB insertion.
   */
  public prepareEventForIngest(params: IngestExternalEventParams): Omit<
    ExternalEventRecord,
    'id' | 'receivedAt'
  > {
    // 1. Prohibit credentials in raw payload and metadata
    assertNoProhibitedCredentials(params.payload);
    if (params.metadata) {
      assertNoProhibitedCredentials(params.metadata);
    }

    // 2. Application-level payload & metadata byte size checks
    const payloadStr = JSON.stringify(params.payload);
    const payloadBytes = Buffer.byteLength(payloadStr, 'utf8');
    if (payloadBytes > MAX_PAYLOAD_BYTES) {
      throw new IntegrationError(
        'validation_error',
        `Payload size (${payloadBytes} bytes) exceeds maximum allowed limit of ${MAX_PAYLOAD_BYTES} bytes (256 KB).`
      );
    }

    if (params.metadata) {
      const metaStr = JSON.stringify(params.metadata);
      const metaBytes = Buffer.byteLength(metaStr, 'utf8');
      if (metaBytes > MAX_METADATA_BYTES) {
        throw new IntegrationError(
          'validation_error',
          `Metadata size (${metaBytes} bytes) exceeds maximum allowed limit of ${MAX_METADATA_BYTES} bytes (64 KB).`
        );
      }
    }

    // 3. Deterministic payload hashing
    const payloadHash = hashPayload(params.payload);

    return {
      providerId: params.providerId,
      providerType: params.providerType,
      providerEventId: params.providerEventId,
      eventType: params.eventType,
      environment: params.environment || 'development',
      payloadHash,
      payload: params.payload,
      status: 'received', // Invariant: durable persistence, worker deferred
      attemptCount: 0,
      metadata: params.metadata || {},
    };
  }

  /**
   * Applies the 90-day raw payload retention pruning rule to an array of external events.
   * Retains event identity, metadata, and hash while tombstoning raw payload.
   */
  public pruneExpiredEvents(
    events: ExternalEventRecord[],
    retentionDays: number = 90
  ): { prunedCount: number; events: ExternalEventRecord[] } {
    if (retentionDays !== 90) {
      throw new IntegrationError(
        'validation_error',
        `Policy Violation: Raw payload retention is fixed at 90 days in Phase 9 Stage 2. Received: ${retentionDays}`
      );
    }

    let prunedCount = 0;
    const updated = events.map((event) => {
      if (isPayloadExpired(event.receivedAt, retentionDays)) {
        prunedCount++;
        return {
          ...event,
          payload: createPrunedPayloadMarker() as unknown as Record<string, unknown>,
        };
      }
      return event;
    });

    return { prunedCount, events: updated };
  }
}

export const externalEventService = new ExternalEventService();
