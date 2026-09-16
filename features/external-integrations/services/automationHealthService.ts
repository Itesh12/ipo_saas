/**
 * features/external-integrations/services/automationHealthService.ts
 *
 * Phase 9 Stage 3A.7: Production Automation Heartbeat & Health Telemetry Service.
 *
 * Implements Hard Corrections 4, 5, 6:
 * 1. Derives authoritative health model from `ipo_source_sync_runs` and `IPO_CRON_SCHEDULES`.
 * 2. Distinct statuses: SUCCESS, FAILED, DEGRADED, SKIPPED_LOCK, MISSED.
 * 3. A skipped cron ('SKIPPED_LOCK') is never counted as a successful data sync or as a failure.
 * 4. Job-specific missed-run detection: (Job + Scheduled Execution Window + 15m grace period).
 * 5. Automatic recovery tracking: 3 consecutive failures transitions feed to DEGRADED.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import {
  IPO_CRON_SCHEDULES,
  formatInIST,
  calculateNextScheduledRun,
  calculateExpectedLastRun,
  CronScheduleDefinition,
} from '@/config/cronSchedules';

export type JobHealthStatus = 'HEALTHY' | 'DEGRADED' | 'FAILED' | 'SKIPPED_LOCK' | 'MISSED' | 'PENDING';
export type SystemAutomationStatus = 'OPERATIONAL' | 'DEGRADED' | 'DELAYED' | 'OFFLINE';

export interface JobAutomationHealth {
  jobKey: 'nse' | 'sebi' | 'master';
  jobName: string;
  targetSource: string;
  status: JobHealthStatus;
  statusMessage: string;
  istDescription: string;
  lastRunAt: string | null;
  lastRunAtIST: string;
  lastRunStatus: string | null;
  nextScheduledRunAt: string;
  nextScheduledRunAtIST: string;
  consecutiveFailures: number;
  lastError: string | null;
  recordsDiscoveredLast24h: number;
  recordsIngestedLast24h: number;
}

export interface SystemAutomationTelemetry {
  status: SystemAutomationStatus;
  statusMessage: string;
  checkedAt: string;
  checkedAtIST: string;
  totalRunsLast24h: number;
  successfulRunsLast24h: number;
  skippedLockRunsLast24h: number;
  failedRunsLast24h: number;
  totalDiscoveredLast24h: number;
  totalPublishedLast24h: number;
  jobs: Record<'nse' | 'sebi' | 'master', JobAutomationHealth>;
  bseDegradedReason: string;
}

export class AutomationHealthService {
  /**
   * Computes the complete real-time automation health telemetry.
   */
  public async getAutomationHealth(now: Date = new Date()): Promise<SystemAutomationTelemetry> {
    const admin = createAdminClient();
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    // 1. Fetch recent runs from the last 24 hours
    const { data: runs, error } = await admin
      .from('ipo_source_sync_runs')
      .select('*')
      .gte('started_at', since24h)
      .order('started_at', { ascending: false });

    if (error) {
      console.error('[AutomationHealthService] Error fetching sync runs:', error.message);
    }

    const allRuns = runs || [];

    // 2. Evaluate per-job health
    const jobKeys: Array<'nse' | 'sebi' | 'master'> = ['nse', 'sebi', 'master'];
    const jobsHealth = {} as Record<'nse' | 'sebi' | 'master', JobAutomationHealth>;

    let hasMissedRun = false;
    let hasFailedJob = false;
    let hasDegradedJob = false;

    for (const key of jobKeys) {
      const schedule: CronScheduleDefinition = IPO_CRON_SCHEDULES[key];
      const targetSource = schedule.targetSource;

      // Filter runs belonging to this job's target source
      const jobRuns = allRuns.filter((r) => {
        if (targetSource === 'all') {
          // Master sync triggers multiple sources or initiates with 'master'
          return r.metadata?.initiatedBy?.includes('master') || r.metadata?.initiatedBy?.includes('cron_scheduler') || r.source === 'sebi_archive';
        }
        return r.source === targetSource;
      });

      const lastRun = jobRuns[0] || null;

      // Calculate consecutive failures
      let consecutiveFailures = 0;
      for (const r of jobRuns) {
        if (r.status === 'failed') {
          consecutiveFailures++;
        } else if (r.status === 'success') {
          break; // Stop at first successful run
        }
        // SKIPPED_LOCK does not break or increase failure counter
      }

      // Calculate 24h discovery & ingestion
      const recordsDiscoveredLast24h = jobRuns.reduce((acc, r) => acc + (r.records_discovered || 0), 0);
      const recordsIngestedLast24h = jobRuns.reduce((acc, r) => acc + (r.records_ingested || 0), 0);

      // Missed-run detection (Job + Scheduled Window + 15m grace period)
      const expectedLastRun = calculateExpectedLastRun(key, now);
      const gracePeriodMs = schedule.gracePeriodMinutes * 60 * 1000;
      const expectedWithGrace = new Date(expectedLastRun.getTime() + gracePeriodMs);

      const hasRunSinceExpected = lastRun
        ? new Date(lastRun.started_at).getTime() >= expectedLastRun.getTime() - 5 * 60 * 1000
        : false;

      let jobStatus: JobHealthStatus = 'HEALTHY';
      let statusMessage = 'Operating normally on schedule';

      if (!hasRunSinceExpected && now.getTime() > expectedWithGrace.getTime()) {
        jobStatus = 'MISSED';
        statusMessage = `Expected run at ${formatInIST(expectedLastRun)} was delayed or missed`;
        hasMissedRun = true;
      } else if (lastRun?.status === 'SKIPPED_LOCK') {
        jobStatus = 'SKIPPED_LOCK';
        statusMessage = `Safely yielded to active global execution lock at ${formatInIST(lastRun.started_at)}`;
      } else if (consecutiveFailures >= 3) {
        jobStatus = 'DEGRADED';
        statusMessage = `${consecutiveFailures} consecutive sync failures recorded`;
        hasDegradedJob = true;
      } else if (lastRun?.status === 'failed') {
        jobStatus = 'FAILED';
        statusMessage = lastRun.sanitized_error || 'Most recent execution failed';
        hasFailedJob = true;
      } else if (!lastRun) {
        jobStatus = 'PENDING';
        statusMessage = 'Awaiting initial scheduled invocation';
      }

      const nextScheduledRun = calculateNextScheduledRun(key, now);

      jobsHealth[key] = {
        jobKey: key,
        jobName: schedule.jobName,
        targetSource,
        status: jobStatus,
        statusMessage,
        istDescription: schedule.istDescription,
        lastRunAt: lastRun?.started_at || null,
        lastRunAtIST: formatInIST(lastRun?.started_at),
        lastRunStatus: lastRun?.status || null,
        nextScheduledRunAt: nextScheduledRun.toISOString(),
        nextScheduledRunAtIST: formatInIST(nextScheduledRun),
        consecutiveFailures,
        lastError: lastRun?.sanitized_error || null,
        recordsDiscoveredLast24h,
        recordsIngestedLast24h,
      };
    }

    // 3. Overall System Automation Status
    let overallStatus: SystemAutomationStatus = 'OPERATIONAL';
    let overallMessage = 'All scheduled acquisition pipelines operational';

    if (hasMissedRun) {
      overallStatus = 'DELAYED';
      overallMessage = 'One or more scheduled sync jobs are delayed past grace period';
    } else if (hasFailedJob || hasDegradedJob) {
      overallStatus = 'DEGRADED';
      overallMessage = 'One or more source feeds experiencing consecutive sync errors';
    }

    const successfulRuns = allRuns.filter((r) => r.status === 'success').length;
    const skippedLockRuns = allRuns.filter((r) => r.status === 'SKIPPED_LOCK' || r.metadata?.skippedLock).length;
    const failedRuns = allRuns.filter((r) => r.status === 'failed').length;
    const totalDiscovered = allRuns.reduce((acc, r) => acc + (r.records_discovered || 0), 0);
    const totalPublished = allRuns.reduce((acc, r) => acc + (r.metadata?.publishedCount || 0), 0);

    return {
      status: overallStatus,
      statusMessage: overallMessage,
      checkedAt: now.toISOString(),
      checkedAtIST: formatInIST(now),
      totalRunsLast24h: allRuns.length,
      successfulRunsLast24h: successfulRuns,
      skippedLockRunsLast24h: skippedLockRuns,
      failedRunsLast24h: failedRuns,
      totalDiscoveredLast24h: totalDiscovered,
      totalPublishedLast24h: totalPublished,
      jobs: jobsHealth,
      bseDegradedReason: 'BSE Public Issues portal requires dynamic JS hydration (SPA). Gracefully degraded.',
    };
  }
}

export const automationHealthService = new AutomationHealthService();
