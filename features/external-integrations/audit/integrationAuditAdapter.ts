/**
 * features/external-integrations/audit/integrationAuditAdapter.ts
 *
 * Phase 8 Audit Trail Adapter.
 *
 * STRICT INVARIANT:
 * - Never copies raw external event payloads or unmasked PII into Phase 8 audit_logs.
 * - Emits sanitized, structured audit records adhering to Phase 8 actor and action semantics.
 */

import { sanitizeEventForAudit } from '../security/payloadSecurity';

export interface Phase8AuditPayload {
  action: string;
  entityType: string;
  entityId: string;
  actorType: 'system' | 'user';
  actorId?: string | null;
  payload: Record<string, unknown>;
}

export class IntegrationAuditAdapter {
  /**
   * Constructs a sanitized audit payload for an external event ingestion.
   * STRICT GUARDRAIL: Guarantees zero raw payload copies in Phase 8 logs.
   */
  public prepareEventIngestAudit(
    providerId: string,
    eventType: string,
    providerEventId: string | undefined,
    payloadHash: string
  ): Phase8AuditPayload {
    const sanitizedMetadata = sanitizeEventForAudit(
      providerId,
      eventType,
      providerEventId,
      payloadHash
    );

    return {
      action: 'external_event_received',
      entityType: 'external_event',
      entityId: providerEventId || payloadHash,
      actorType: 'system',
      actorId: null,
      payload: sanitizedMetadata,
    };
  }

  /**
   * Constructs a sanitized audit payload for an account reference addition.
   */
  public prepareAccountReferenceAudit(
    userId: string,
    providerId: string,
    maskedReference: string
  ): Phase8AuditPayload {
    return {
      action: 'external_account_reference_added',
      entityType: 'external_account',
      entityId: `${userId}_${providerId}`,
      actorType: 'user',
      actorId: userId,
      payload: {
        provider_id: providerId,
        account_reference_masked: maskedReference,
        encrypted_reference_stored: true,
      },
    };
  }

  /**
   * Constructs a sanitized audit payload for raw payload retention pruning.
   */
  public preparePruningRunAudit(
    runId: string,
    recordsPruned: number,
    durationMs: number,
    retentionDays: number = 90
  ): Phase8AuditPayload {
    return {
      action: 'external_payload_pruning_completed',
      entityType: 'external_pruning_run',
      entityId: runId,
      actorType: 'system',
      actorId: null,
      payload: {
        run_id: runId,
        records_pruned: recordsPruned,
        duration_ms: durationMs,
        retention_days: retentionDays,
        raw_payloads_purged: true,
        events_preserved: true,
      },
    };
  }

  /**
   * Constructs an audit record for security failures (signature mismatch, clock skew, credential rejections).
   */
  public prepareSecurityAlertAudit(
    failureCode: string,
    providerId: string,
    detail?: string
  ): Phase8AuditPayload {
    return {
      action: 'integration_security_alert',
      entityType: 'security_event',
      entityId: `${providerId}_${Date.now()}`,
      actorType: 'system',
      actorId: null,
      payload: {
        failure_code: failureCode,
        provider_id: providerId,
        detail: detail || 'Security boundary rejection.',
      },
    };
  }
}

export const integrationAuditAdapter = new IntegrationAuditAdapter();
