/**
 * features/external-integrations/security/payloadSecurity.ts
 *
 * Payload security, hashing, sanitization, and 90-day retention policies.
 *
 * GUARDRAIL 2 ENFORCEMENT:
 * - Raw external event payloads are restricted and pruned after 90 days.
 * - Pruned payloads are distinctly identifiable and cannot be mistaken for original payloads.
 * - Raw external payloads are NEVER copied into Phase 8 audit logs.
 */

import crypto from 'crypto';

export interface PrunedPayloadMarker {
  _pruned: true;
  _pruned_at: string;
}

/**
 * Computes deterministic SHA-256 hash of a payload object.
 */
export function hashPayload(payload: unknown): string {
  const serialized = JSON.stringify(payload, Object.keys(payload as object || {}).sort());
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

/**
 * Checks whether an event payload has been pruned by the 90-day retention policy.
 */
export function isPrunedPayload(payload: unknown): payload is PrunedPayloadMarker {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return p._pruned === true && typeof p._pruned_at === 'string';
}

/**
 * Generates the standardized tombstone payload for pruned events.
 */
export function createPrunedPayloadMarker(): PrunedPayloadMarker {
  return {
    _pruned: true,
    _pruned_at: new Date().toISOString(),
  };
}

/**
 * Extracts a strictly sanitized, minimal summary of an event for Phase 8 audit logging.
 * STRICT INVARIANT: Never copies raw payload or sensitive PII.
 */
export function sanitizeEventForAudit(
  providerId: string,
  eventType: string,
  providerEventId: string | undefined,
  payloadHash: string
): Record<string, unknown> {
  return {
    provider_id: providerId,
    event_type: eventType,
    provider_event_id: providerEventId ?? null,
    payload_hash: payloadHash,
    sanitized: true,
    raw_payload_retained: false,
  };
}

/**
 * Validates payload age against the 90-day retention limit.
 */
export function isPayloadExpired(receivedAt: Date | string, retentionDays: number = 90): boolean {
  const date = typeof receivedAt === 'string' ? new Date(receivedAt) : receivedAt;
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  return date < cutoff;
}
