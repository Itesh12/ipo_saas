/**
 * features/external-integrations/pruning/pruningService.ts
 *
 * Operational wrapper for raw payload retention pruning.
 * Executes DB function, records durations, catches errors, and emits sanitized Phase 8 audit logs.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { integrationAuditAdapter } from '../audit/integrationAuditAdapter';
import { IntegrationTracer } from '../observability/integrationTracer';
import { integrationMetrics } from '../observability/integrationMetrics';

export interface PruningRunResult {
  success: boolean;
  runId?: string;
  retentionDays: number;
  recordsPruned: number;
  durationMs: number;
  errorMessage?: string;
}

export class PruningService {
  /**
   * Executes the raw payload pruning routine with explicit error boundaries,
   * diagnostic tracing, and Phase 8 audit emission.
   */
  public async executePruning(retentionDays: number = 90): Promise<PruningRunResult> {
    const traceCtx = IntegrationTracer.startTrace('system', 'raw_payload_pruning', {
      environment: process.env.NODE_ENV || 'development',
    });

    if (retentionDays !== 90) {
      IntegrationTracer.completeTrace(traceCtx, 'failure', {
        failureCode: 'validation_error',
      });
      throw new Error(`Policy Violation: Raw payload retention is fixed at 90 days in Phase 9 Stage 2. Received: ${retentionDays}`);
    }

    const admin = createAdminClient();

    try {
      const { data, error } = await admin.rpc('prune_expired_raw_payloads', {
        p_retention_days: retentionDays,
      });

      if (error) {
        throw new Error(error.message);
      }

      const result: PruningRunResult = {
        success: true,
        runId: data.runId,
        retentionDays: data.retentionDays,
        recordsPruned: data.recordsPruned,
        durationMs: data.durationMs,
      };

      IntegrationTracer.completeTrace(traceCtx, 'success', {
        sanitizedMetadata: {
          recordsPruned: data.recordsPruned,
          durationMs: data.durationMs,
        },
      });

      // Emit Phase 8 Audit Record for successful pruning run
      const auditPayload = integrationAuditAdapter.preparePruningRunAudit(
        data.runId,
        data.recordsPruned,
        data.durationMs,
        retentionDays
      );

      // Record via Phase 8 secure RPC
      await admin.rpc('record_audit_log', {
        p_action: auditPayload.action,
        p_resource_type: auditPayload.entityType,
        p_resource_id: auditPayload.entityId,
        p_new_values: auditPayload.payload,
      });

      return result;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Pruning failed.';

      IntegrationTracer.completeTrace(traceCtx, 'failure', {
        failureCode: 'internal_processing_error',
        sanitizedMetadata: { error: errMsg },
      });

      integrationMetrics.recordEventFailed('internal_processing_error');

      // Emit Phase 8 high-severity failure audit log
      try {
        await admin.rpc('record_audit_log', {
          p_action: 'external_payload_pruning_failed',
          p_resource_type: 'external_pruning_run',
          p_resource_id: traceCtx.correlationId,
          p_new_values: {
            error: errMsg,
            retention_days: retentionDays,
            correlation_id: traceCtx.correlationId,
          },
        });
      } catch {
        // Defensive: do not mask root exception if audit write fails
      }

      return {
        success: false,
        retentionDays,
        recordsPruned: 0,
        durationMs: Date.now() - traceCtx.startTimestamp,
        errorMessage: errMsg,
      };
    }
  }
}

export const pruningService = new PruningService();
