/**
 * features/external-integrations/services/distributedLockService.ts
 *
 * Phase 9 Stage 3A.7: Single Global Execution Lock Service.
 *
 * Enforces Hard Correction 1:
 * All sync jobs (NSE hourly, SEBI 4-hourly, Master twice-daily) compete for ONE
 * authoritative cluster-wide execution lock: 'ipo_sync_global'.
 *
 * This prevents concurrent execution, duplicate ingestion, and race conditions
 * during canonical promotion when schedules overlap (e.g. at 17:30 IST when both
 * NSE hourly and Master reconciliation coincide).
 *
 * Overlapping jobs safely yield with status 'SKIPPED_LOCK'.
 */

import { createAdminClient } from '@/lib/supabase/admin';

export interface LockAcquisitionOptions {
  lockedBy: string;
  jobName: string;
  targetSource: string;
  ttlSeconds?: number;
}

export interface LockResult {
  acquired: boolean;
  lockKey: string;
  lockedBy?: string;
  jobName?: string;
  targetSource?: string;
  expiresAt?: string;
  reason?: string;
}

export class DistributedLockService {
  public static readonly GLOBAL_LOCK_KEY = 'ipo_sync_global';
  public static readonly DEFAULT_TTL_SECONDS = 300; // 5 minutes

  /**
   * Attempts to atomically acquire the single global sync lock.
   */
  public async acquireGlobalLock(options: LockAcquisitionOptions): Promise<LockResult> {
    const admin = createAdminClient();
    const lockKey = DistributedLockService.GLOBAL_LOCK_KEY;
    const ttl = options.ttlSeconds || DistributedLockService.DEFAULT_TTL_SECONDS;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttl * 1000).toISOString();

    try {
      // 1. Inspect active unexpired lock
      const { data: existing, error: selectErr } = await admin
        .from('ipo_sync_global_lock')
        .select('*')
        .eq('lock_key', lockKey)
        .maybeSingle();

      if (selectErr) {
        console.warn('[DistributedLockService] Select check error, proceeding with fallback:', selectErr.message);
      }

      if (existing) {
        const existingExpires = new Date(existing.expires_at).getTime();
        if (existingExpires > now.getTime()) {
          // Lock is actively held and unexpired
          return {
            acquired: false,
            lockKey,
            lockedBy: existing.locked_by,
            jobName: existing.job_name,
            targetSource: existing.target_source,
            expiresAt: existing.expires_at,
            reason: `Active lock held by '${existing.locked_by}' for '${existing.job_name}' until ${existing.expires_at}`,
          };
        }
      }

      // 2. Lock is either nonexistent or expired: Upsert to take ownership
      const { error: upsertErr } = await admin
        .from('ipo_sync_global_lock')
        .upsert(
          {
            lock_key: lockKey,
            locked_by: options.lockedBy,
            job_name: options.jobName,
            target_source: options.targetSource,
            acquired_at: now.toISOString(),
            expires_at: expiresAt,
            metadata: {
              ttlSeconds: ttl,
              acquiredAt: now.toISOString(),
            },
          },
          { onConflict: 'lock_key' }
        );

      if (upsertErr) {
        console.error('[DistributedLockService] Upsert lock error:', upsertErr.message);
        return {
          acquired: false,
          lockKey,
          reason: `Failed to acquire lock due to DB error: ${upsertErr.message}`,
        };
      }

      return {
        acquired: true,
        lockKey,
        lockedBy: options.lockedBy,
        jobName: options.jobName,
        targetSource: options.targetSource,
        expiresAt,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[DistributedLockService] Unexpected error acquiring lock:', msg);
      return {
        acquired: false,
        lockKey,
        reason: `Unexpected lock acquisition error: ${msg}`,
      };
    }
  }

  /**
   * Atomically releases the global lock if held by the specified caller.
   */
  public async releaseGlobalLock(lockedBy: string): Promise<boolean> {
    const admin = createAdminClient();
    const lockKey = DistributedLockService.GLOBAL_LOCK_KEY;

    try {
      const { error } = await admin
        .from('ipo_sync_global_lock')
        .delete()
        .eq('lock_key', lockKey)
        .eq('locked_by', lockedBy);

      if (error) {
        console.warn('[DistributedLockService] Error releasing lock:', error.message);
        return false;
      }

      return true;
    } catch (err: unknown) {
      console.warn('[DistributedLockService] Unexpected error releasing lock:', err);
      return false;
    }
  }

  /**
   * Retrieves the current state of the global lock.
   */
  public async getCurrentGlobalLock(): Promise<Record<string, unknown> | null> {
    const admin = createAdminClient();
    try {
      const { data } = await admin
        .from('ipo_sync_global_lock')
        .select('*')
        .eq('lock_key', DistributedLockService.GLOBAL_LOCK_KEY)
        .maybeSingle();

      return data || null;
    } catch {
      return null;
    }
  }
}

export const distributedLockService = new DistributedLockService();
