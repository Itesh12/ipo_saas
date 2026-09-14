/**
 * features/external-integrations/services/ipoSyncService.ts
 *
 * Phase 9 Stage 3A.2: Live Source Synchronization & Continuous Master Sync Service.
 *
 * Coordinates live outbound HTTPS requests against SEBI, NSE, and BSE endpoints,
 * parses official filings, feeds candidates into the deduplicating ingestion inbox,
 * logs comprehensive audit telemetry to `ipo_source_sync_runs`, and guarantees
 * zero-fixture fail-closed execution.
 *
 * Mandatory Principles:
 * 1. Condition 2: Semantic validation on every response before processing.
 * 2. Condition 3: Real network origin only. Zero hardcoded companies, zero fixtures.
 * 3. Editorial Isolation: Discovered candidates remain in `pending_review`. Zero auto-publishing.
 * 4. Graceful Degradation: If upstream fails, retain verified data, mark stale, never fabricate.
 * 5. Concurrency Lock: Ensures single active sync per source to prevent race conditions.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { sebiSourceClient, SebiClientError } from '../clients/sebiSourceClient';
import { nseSourceClient, NseClientError } from '../clients/nseSourceClient';
import { bseSourceClient } from '../clients/bseSourceClient';
import { SebiPublicIssuesExtractor } from '../adapters/sebiExtractor';
import { NseIngestionAdapter } from '../adapters/nseExtractor';
import { IpoDiscoveryEngine } from './ipoDiscoveryEngine';
import { ipoIngestionService } from './ipoIngestionService';

export type SyncSource = 'sebi' | 'nse' | 'bse' | 'all';

export interface SourceSyncMetrics {
  source: string;
  runId: string;
  status: 'success' | 'degraded' | 'failed';
  httpStatus?: number;
  recordsDiscovered: number;
  recordsIngested: number;
  recordsUnchanged: number;
  recordsConflicted: number;
  recordsFailed: number;
  responseHash?: string;
  error?: string;
  durationMs: number;
}

export interface MasterSyncResult {
  startedAt: string;
  finishedAt: string;
  totalSources: number;
  successfulSources: number;
  failedSources: number;
  metrics: SourceSyncMetrics[];
}

// In-memory mutex for concurrency protection across sync runs
const activeSyncLocks = new Set<string>();

export class IpoSyncService {
  public static readonly PARSER_VERSION = 'v1.0';

  /**
   * Orchestrates live source synchronization for the requested source(s).
   */
  public async executeSync(
    sourceTarget: SyncSource = 'all',
    options?: { initiatedBy?: string; nowIST?: string }
  ): Promise<MasterSyncResult> {
    const startedAt = new Date().toISOString();
    const metrics: SourceSyncMetrics[] = [];

    const sourcesToRun: Array<'sebi' | 'nse' | 'bse'> =
      sourceTarget === 'all' ? ['sebi', 'nse', 'bse'] : [sourceTarget];

    for (const src of sourcesToRun) {
      // Concurrency guard per source
      if (activeSyncLocks.has(src)) {
        metrics.push({
          source: src,
          runId: 'locked',
          status: 'failed',
          recordsDiscovered: 0,
          recordsIngested: 0,
          recordsUnchanged: 0,
          recordsConflicted: 0,
          recordsFailed: 0,
          error: `Sync for source '${src}' is already running. Concurrency lock active.`,
          durationMs: 0,
        });
        continue;
      }

      activeSyncLocks.add(src);
      try {
        let m: SourceSyncMetrics;
        if (src === 'sebi') {
          m = await this.syncSebi(options);
        } else if (src === 'nse') {
          m = await this.syncNse(options);
        } else {
          m = await this.syncBse();
        }
        metrics.push(m);
      } finally {
        activeSyncLocks.delete(src);
      }
    }

    const finishedAt = new Date().toISOString();
    const successfulSources = metrics.filter((m) => m.status === 'success').length;
    const failedSources = metrics.filter((m) => m.status === 'failed').length;

    return {
      startedAt,
      finishedAt,
      totalSources: metrics.length,
      successfulSources,
      failedSources,
      metrics,
    };
  }

  /**
   * Synchronizes live SEBI regulatory filings.
   */
  private async syncSebi(options?: { initiatedBy?: string }): Promise<SourceSyncMetrics> {
    const admin = createAdminClient();
    const startMs = Date.now();

    // 1. Create initial sync run record
    const { data: runRecord, error: insertErr } = await admin
      .from('ipo_source_sync_runs')
      .insert({
        source: 'sebi',
        status: 'running',
        parser_version: IpoSyncService.PARSER_VERSION,
        metadata: { initiatedBy: options?.initiatedBy || 'system' },
      })
      .select('id')
      .single();

    const runId = runRecord?.id || `sebi-${Date.now()}`;
    if (insertErr) {
      console.error('[IpoSyncService] Failed to create sync run record:', insertErr.message);
    }

    let recordsDiscovered = 0;
    let recordsIngested = 0;
    let recordsUnchanged = 0;
    let recordsConflicted = 0;
    let recordsFailed = 0;

    try {
      // 2. Fetch live data with strict semantic validation
      const fetchResult = await sebiSourceClient.fetchLiveFilings();

      // 3. Parse HTML into standardized extraction objects
      const extractions = SebiPublicIssuesExtractor.parseHtml(fetchResult.html);
      recordsDiscovered = extractions.length;

      // 4. Ingest each discovered extraction idempotently into the inbox
      for (const extraction of extractions) {
        try {
          // Verify universe classification (filter out debt, rights issues, etc.)
          const classification = IpoDiscoveryEngine.classifyDocument(
            extraction.normalized_payload.company_name,
            extraction.document_type
          );

          if (classification.isExcluded) {
            continue; // Excluded instruments do not count as equity candidates
          }

          const outcome = await ipoIngestionService.ingestObservation(extraction);
          if (outcome.isDuplicate) {
            recordsUnchanged++;
          } else if (outcome.hasConflict) {
            recordsConflicted++;
            recordsIngested++;
          } else {
            recordsIngested++;
          }
        } catch (itemErr: unknown) {
          recordsFailed++;
          console.warn('[IpoSyncService] Failed to ingest SEBI item:', itemErr);
        }
      }

      const durationMs = Date.now() - startMs;

      // 5. Update audit record on success
      await admin
        .from('ipo_source_sync_runs')
        .update({
          finished_at: new Date().toISOString(),
          status: 'success',
          http_status: fetchResult.status,
          records_discovered: recordsDiscovered,
          records_ingested: recordsIngested,
          records_unchanged: recordsUnchanged,
          records_conflicted: recordsConflicted,
          records_failed: recordsFailed,
          response_hash: fetchResult.responseHash,
          metadata: {
            byteLength: fetchResult.byteLength,
            durationMs,
            initiatedBy: options?.initiatedBy || 'system',
          },
        })
        .eq('id', runId);

      return {
        source: 'sebi',
        runId,
        status: 'success',
        httpStatus: fetchResult.status,
        recordsDiscovered,
        recordsIngested,
        recordsUnchanged,
        recordsConflicted,
        recordsFailed,
        responseHash: fetchResult.responseHash,
        durationMs,
      };
    } catch (err: unknown) {
      const durationMs = Date.now() - startMs;
      const errorMsg = err instanceof Error ? err.message : String(err);
      const errorCode = err instanceof SebiClientError ? err.code : 'SEBI_SYNC_ERROR';
      const httpStatus = err instanceof SebiClientError ? err.status : undefined;

      // Record failure audit trail
      await admin
        .from('ipo_source_sync_runs')
        .update({
          finished_at: new Date().toISOString(),
          status: 'failed',
          http_status: httpStatus,
          error_code: errorCode,
          sanitized_error: errorMsg,
          duration_ms: durationMs,
        })
        .eq('id', runId);

      return {
        source: 'sebi',
        runId,
        status: 'failed',
        httpStatus,
        recordsDiscovered: 0,
        recordsIngested: 0,
        recordsUnchanged: 0,
        recordsConflicted: 0,
        recordsFailed: 0,
        error: errorMsg,
        durationMs,
      };
    }
  }

  /**
   * Synchronizes live NSE current issues.
   */
  private async syncNse(options?: { initiatedBy?: string }): Promise<SourceSyncMetrics> {
    const admin = createAdminClient();
    const startMs = Date.now();

    // 1. Create initial sync run record
    const { data: runRecord } = await admin
      .from('ipo_source_sync_runs')
      .insert({
        source: 'nse',
        status: 'running',
        parser_version: IpoSyncService.PARSER_VERSION,
        metadata: { initiatedBy: options?.initiatedBy || 'system' },
      })
      .select('id')
      .single();

    const runId = runRecord?.id || `nse-${Date.now()}`;

    let recordsDiscovered = 0;
    let recordsIngested = 0;
    let recordsUnchanged = 0;
    let recordsConflicted = 0;
    let recordsFailed = 0;

    try {
      // 2. Fetch live data with handshake and semantic validation
      const fetchResult = await nseSourceClient.fetchLiveCurrentIssues();
      recordsDiscovered = fetchResult.issues.length;

      // 3. Process each issue through the adapter and ingestion pipeline
      for (const rawIssue of fetchResult.issues) {
        try {
          const extraction = NseIngestionAdapter.normalizeIssue(rawIssue);

          // Verify universe classification
          const classification = IpoDiscoveryEngine.classifyDocument(
            extraction.normalized_payload.company_name,
            extraction.document_type
          );

          if (classification.isExcluded) {
            continue;
          }

          const outcome = await ipoIngestionService.ingestObservation(extraction);
          if (outcome.isDuplicate) {
            recordsUnchanged++;
          } else if (outcome.hasConflict) {
            recordsConflicted++;
            recordsIngested++;
          } else {
            recordsIngested++;
          }
        } catch (itemErr: unknown) {
          recordsFailed++;
          console.warn('[IpoSyncService] Failed to ingest NSE item:', itemErr);
        }
      }

      const durationMs = Date.now() - startMs;

      // 4. Update audit record on success
      await admin
        .from('ipo_source_sync_runs')
        .update({
          finished_at: new Date().toISOString(),
          status: 'success',
          http_status: fetchResult.status,
          records_discovered: recordsDiscovered,
          records_ingested: recordsIngested,
          records_unchanged: recordsUnchanged,
          records_conflicted: recordsConflicted,
          records_failed: recordsFailed,
          response_hash: fetchResult.responseHash,
          metadata: {
            byteLength: fetchResult.byteLength,
            durationMs,
            initiatedBy: options?.initiatedBy || 'system',
          },
        })
        .eq('id', runId);

      return {
        source: 'nse',
        runId,
        status: 'success',
        httpStatus: fetchResult.status,
        recordsDiscovered,
        recordsIngested,
        recordsUnchanged,
        recordsConflicted,
        recordsFailed,
        responseHash: fetchResult.responseHash,
        durationMs,
      };
    } catch (err: unknown) {
      const durationMs = Date.now() - startMs;
      const errorMsg = err instanceof Error ? err.message : String(err);
      const errorCode = err instanceof NseClientError ? err.code : 'NSE_SYNC_ERROR';
      const httpStatus = err instanceof NseClientError ? err.status : undefined;

      await admin
        .from('ipo_source_sync_runs')
        .update({
          finished_at: new Date().toISOString(),
          status: 'failed',
          http_status: httpStatus,
          error_code: errorCode,
          sanitized_error: errorMsg,
          duration_ms: durationMs,
        })
        .eq('id', runId);

      return {
        source: 'nse',
        runId,
        status: 'failed',
        httpStatus,
        recordsDiscovered: 0,
        recordsIngested: 0,
        recordsUnchanged: 0,
        recordsConflicted: 0,
        recordsFailed: 0,
        error: errorMsg,
        durationMs,
      };
    }
  }

  /**
   * BSE Probe - Conservative Mode.
   * Reports degraded status gracefully without fabricating data.
   */
  private async syncBse(): Promise<SourceSyncMetrics> {
    const admin = createAdminClient();
    const startMs = Date.now();

    const result = await bseSourceClient.fetchLiveNotices();
    const durationMs = Date.now() - startMs;

    const { data: runRecord } = await admin
      .from('ipo_source_sync_runs')
      .insert({
        source: 'bse',
        status: result.status,
        http_status: result.httpStatus,
        records_discovered: 0,
        records_ingested: 0,
        records_unchanged: 0,
        records_conflicted: 0,
        records_failed: 0,
        parser_version: IpoSyncService.PARSER_VERSION,
        sanitized_error: result.reason,
        metadata: { durationMs, reason: result.reason },
      })
      .select('id')
      .single();

    return {
      source: 'bse',
      runId: runRecord?.id || `bse-${Date.now()}`,
      status: result.status === 'healthy' ? 'success' : 'degraded',
      httpStatus: result.httpStatus,
      recordsDiscovered: 0,
      recordsIngested: 0,
      recordsUnchanged: 0,
      recordsConflicted: 0,
      recordsFailed: 0,
      error: result.reason,
      durationMs,
    };
  }
}

export const ipoSyncService = new IpoSyncService();
