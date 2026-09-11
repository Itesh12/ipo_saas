/**
 * features/external-integrations/reconciliation/reconciliationEngine.ts
 *
 * Cross-domain reconciliation engine.
 * Detects discrepancies and generates structured Phase 8 Admin Work Queue items.
 * Uses distinct Execution Run ID (UUID v4) and Deterministic Run Fingerprint (SHA-256).
 */

import crypto from 'crypto';
import {
  ReconciliationDomain,
  ReconciliationRecordPair,
  DiscrepancyDetail,
  ReconciliationRunSummary,
  EmitPhase8WorkItemSpec,
} from './reconciliationTypes';

export class ReconciliationEngine {
  /**
   * Computes a deterministic SHA-256 fingerprint for canonical input data.
   * Two runs with identical domain, provider, and entity state produce the EXACT same fingerprint.
   */
  public computeRunFingerprint(
    providerId: string,
    domain: ReconciliationDomain,
    pairs: ReconciliationRecordPair[]
  ): string {
    const canonicalPairs = pairs
      .map((p) => ({
        entityId: p.entityId,
        internal: Object.keys(p.internalState)
          .sort()
          .reduce<Record<string, unknown>>((acc, k) => {
            acc[k] = p.internalState[k];
            return acc;
          }, {}),
        external: Object.keys(p.externalState)
          .sort()
          .reduce<Record<string, unknown>>((acc, k) => {
            acc[k] = p.externalState[k];
            return acc;
          }, {}),
      }))
      .sort((a, b) => a.entityId.localeCompare(b.entityId));

    const canonicalString = JSON.stringify({
      providerId,
      domain,
      pairs: canonicalPairs,
    });

    return crypto.createHash('sha256').update(canonicalString).digest('hex');
  }

  /**
   * Compares internal vs external records and identifies state discrepancies.
   */
  public reconcilePairs(
    providerId: string,
    domain: ReconciliationDomain,
    pairs: ReconciliationRecordPair[]
  ): ReconciliationRunSummary {
    const startedAt = new Date().toISOString();
    const runId = crypto.randomUUID(); // Unique execution ID
    const runFingerprint = this.computeRunFingerprint(providerId, domain, pairs); // Deterministic fingerprint
    const discrepancies: DiscrepancyDetail[] = [];
    let matchedRecords = 0;

    for (const pair of pairs) {
      let recordHasDiscrepancy = false;
      const allKeys = Array.from(
        new Set([...Object.keys(pair.internalState), ...Object.keys(pair.externalState)])
      );

      for (const key of allKeys) {
        const internalVal = pair.internalState[key];
        const externalVal = pair.externalState[key];

        if (internalVal !== externalVal) {
          recordHasDiscrepancy = true;
          let severity: 'critical' | 'high' | 'medium' | 'low' = 'medium';
          if (key === 'status' || key === 'sharesAllotted' || key === 'amount') {
            severity = 'high';
          }

          discrepancies.push({
            entityId: pair.entityId,
            domain,
            discrepancyType: `${domain}_field_mismatch`,
            field: key,
            internalValue: internalVal,
            externalValue: externalVal,
            severity,
          });
        }
      }

      if (!recordHasDiscrepancy) {
        matchedRecords++;
      }
    }

    const completedAt = new Date().toISOString();
    const status =
      discrepancies.length === 0 ? 'completed' : 'completed_with_discrepancies';

    return {
      runId,
      runFingerprint,
      providerId,
      domain,
      status,
      totalRecords: pairs.length,
      matchedRecords,
      discrepancyCount: discrepancies.length,
      discrepancies,
      startedAt,
      completedAt,
    };
  }

  /**
   * Transforms a discrepancy into a Phase 8 Admin Work Item specification.
   */
  public toPhase8WorkItem(discrepancy: DiscrepancyDetail): EmitPhase8WorkItemSpec {
    let category: 'allotment_discrepancy' | 'application_anomaly' | 'finance_reconciliation' =
      'application_anomaly';

    if (discrepancy.domain === 'allotments') {
      category = 'allotment_discrepancy';
    } else if (discrepancy.domain === 'mandates') {
      category = 'finance_reconciliation';
    }

    return {
      title: `Discrepancy in ${discrepancy.domain} for entity ${discrepancy.entityId}`,
      category,
      severity: discrepancy.severity,
      entityType: discrepancy.domain,
      entityId: discrepancy.entityId,
      discrepancyType: discrepancy.discrepancyType,
      metadata: {
        field: discrepancy.field,
        internalValue: discrepancy.internalValue,
        externalValue: discrepancy.externalValue,
        internal_value: discrepancy.internalValue,
        external_value: discrepancy.externalValue,
      },
    };
  }
}

export const reconciliationEngine = new ReconciliationEngine();
