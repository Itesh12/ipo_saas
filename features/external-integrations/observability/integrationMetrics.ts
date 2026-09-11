/**
 * features/external-integrations/observability/integrationMetrics.ts
 *
 * Operational Metrics Contracts & Database-Backed Aggregates.
 *
 * NOTE: Stage 2 metrics are internal application/DB observability contracts,
 * NOT a third-party production monitoring platform.
 */

import { IntegrationFailureCode } from './failureTaxonomy';

export interface IntegrationMetricsSnapshot {
  eventsReceivedTotal: number;
  eventsDeduplicatedTotal: number;
  eventsProcessedTotal: number;
  eventsFailedTotal: number;
  securityFailuresTotal: number;
  staleEventsCount: number;
  reconciliationDiscrepanciesTotal: number;
  lastPruningRunDurationMs?: number;
  lastPruningRecordsCount?: number;
  failuresByCode: Partial<Record<IntegrationFailureCode, number>>;
  averageLatencyMs: number;
}

export class IntegrationMetricsCollector {
  private eventsReceived = 0;
  private eventsDeduplicated = 0;
  private eventsProcessed = 0;
  private eventsFailed = 0;
  private securityFailures = 0;
  private failuresByCode: Partial<Record<IntegrationFailureCode, number>> = {};
  private latencySamples: number[] = [];

  public recordEventReceived(): void {
    this.eventsReceived++;
  }

  public recordEventDeduplicated(): void {
    this.eventsDeduplicated++;
  }

  public recordEventProcessed(durationMs?: number): void {
    this.eventsProcessed++;
    if (durationMs !== undefined) {
      this.recordLatency(durationMs);
    }
  }

  public recordEventFailed(code: IntegrationFailureCode, durationMs?: number): void {
    this.eventsFailed++;
    this.failuresByCode[code] = (this.failuresByCode[code] || 0) + 1;
    if (durationMs !== undefined) {
      this.recordLatency(durationMs);
    }
  }

  public recordSecurityFailure(code: IntegrationFailureCode): void {
    this.securityFailures++;
    this.failuresByCode[code] = (this.failuresByCode[code] || 0) + 1;
  }

  private recordLatency(ms: number): void {
    this.latencySamples.push(ms);
    if (this.latencySamples.length > 500) {
      this.latencySamples.shift();
    }
  }

  public getSnapshot(): IntegrationMetricsSnapshot {
    const avgLatency =
      this.latencySamples.length > 0
        ? Math.round(
            this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length
          )
        : 0;

    return {
      eventsReceivedTotal: this.eventsReceived,
      eventsDeduplicatedTotal: this.eventsDeduplicated,
      eventsProcessedTotal: this.eventsProcessed,
      eventsFailedTotal: this.eventsFailed,
      securityFailuresTotal: this.securityFailures,
      staleEventsCount: 0,
      reconciliationDiscrepanciesTotal: 0,
      failuresByCode: { ...this.failuresByCode },
      averageLatencyMs: avgLatency,
    };
  }

  public reset(): void {
    this.eventsReceived = 0;
    this.eventsDeduplicated = 0;
    this.eventsProcessed = 0;
    this.eventsFailed = 0;
    this.securityFailures = 0;
    this.failuresByCode = {};
    this.latencySamples = [];
  }
}

export const integrationMetrics = new IntegrationMetricsCollector();
