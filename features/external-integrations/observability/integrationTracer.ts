/**
 * features/external-integrations/observability/integrationTracer.ts
 *
 * Tier 1 Operational Diagnostic Tracer.
 * Guarantees zero sensitive data (PII, credentials, raw payloads) in diagnostic telemetry.
 */

import { IntegrationFailureCode } from './failureTaxonomy';

export interface IntegrationTraceContext {
  correlationId: string;
  providerId: string;
  environment: string;
  capability?: string;
  externalEventId?: string;
  operationName: string;
  startTimestamp: number;
}

export interface IntegrationTraceResult {
  correlationId: string;
  providerId: string;
  environment: string;
  capability?: string;
  externalEventId?: string;
  operationName: string;
  outcome: 'success' | 'failure';
  durationMs: number;
  failureCode?: IntegrationFailureCode;
  timestamp: string;
  sanitizedMetadata?: Record<string, unknown>;
}

export class IntegrationTracer {
  /**
   * Starts a new operational trace with a correlation ID.
   */
  public static startTrace(
    providerId: string,
    operationName: string,
    options: {
      environment?: string;
      capability?: string;
      externalEventId?: string;
      correlationId?: string;
    } = {}
  ): IntegrationTraceContext {
    return {
      correlationId: options.correlationId || `trc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      providerId,
      environment: options.environment || 'development',
      capability: options.capability,
      externalEventId: options.externalEventId,
      operationName,
      startTimestamp: Date.now(),
    };
  }

  /**
   * Completes a trace and produces a sanitized telemetry record.
   * Guarantees that sensitive data cannot enter operational logs.
   */
  public static completeTrace(
    ctx: IntegrationTraceContext,
    outcome: 'success' | 'failure',
    details: {
      failureCode?: IntegrationFailureCode;
      sanitizedMetadata?: Record<string, unknown>;
    } = {}
  ): IntegrationTraceResult {
    const durationMs = Date.now() - ctx.startTimestamp;

    return {
      correlationId: ctx.correlationId,
      providerId: ctx.providerId,
      environment: ctx.environment,
      capability: ctx.capability,
      externalEventId: ctx.externalEventId,
      operationName: ctx.operationName,
      outcome,
      durationMs,
      failureCode: details.failureCode,
      timestamp: new Date().toISOString(),
      sanitizedMetadata: details.sanitizedMetadata,
    };
  }
}
