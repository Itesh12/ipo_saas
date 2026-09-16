/**
 * app/api/admin/ipo-sync/run/route.ts
 *
 * Phase 9 Stage 3A.7: Production Automation Heartbeat & Scheduler Resilience.
 *
 * Enforces Hard Corrections:
 * 1. Single Global DB Execution Lock ('ipo_sync_global'):
 *    - Guarantees overlapping cron jobs (NSE hourly, SEBI 4-hourly, Master twice-daily)
 *      never compete, race, or promote candidates concurrently.
 *    - If global lock is active, safely yields with status 'SKIPPED_LOCK'.
 * 2. Strict Dual-Authentication Isolation:
 *    - Cron Path: Validates constant-time Bearer token against CRON_SECRET.
 *      Valid secret is sufficient on its own and NEVER requires a Supabase user session.
 *      User-Agent is captured strictly as telemetry / diagnostics and is NEVER an auth gate.
 *    - Admin Path: Requires authenticated Supabase session with 'admin' or 'super_admin' RBAC.
 * 3. Granular Telemetry & Observable State:
 *    - Explicitly logs 'initiatedBy: vercel_cron' in ipo_source_sync_runs and response metrics.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getCurrentUser } from '@/lib/security/auth-guards';
import { hasMinimumRole } from '@/lib/security/roles';
import { ipoSyncService, SyncSource } from '@/features/external-integrations/services/ipoSyncService';
import { distributedLockService } from '@/features/external-integrations/services/distributedLockService';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Performs a constant-time string comparison to prevent timing attacks.
 */
export function timingSafeEqualStrings(provided: string, expected: string): boolean {
  if (typeof provided !== 'string' || typeof expected !== 'string') {
    return false;
  }
  const bufProvided = Buffer.from(provided, 'utf-8');
  const bufExpected = Buffer.from(expected, 'utf-8');

  if (bufProvided.length !== bufExpected.length) {
    // Perform dummy timing-safe check to normalize execution time
    crypto.timingSafeEqual(bufExpected, bufExpected);
    return false;
  }

  return crypto.timingSafeEqual(bufProvided, bufExpected);
}

export interface AuthResultSuccess {
  authorized: true;
  method: 'cron' | 'admin';
  actor: string;
  clientUserAgent?: string;
}

export interface AuthResultFailure {
  authorized: false;
  status: number;
  error: string;
}

export type AuthResult = AuthResultSuccess | AuthResultFailure;

/**
 * Evaluates dual-authentication paths:
 * 1. Vercel Cron Path: Validates Bearer token or x-cron-secret header against CRON_SECRET.
 * 2. Human Admin Session Path: Requires valid Supabase session with 'admin' or 'super_admin' role.
 */
export async function authenticateSyncRequest(req: NextRequest): Promise<AuthResult> {
  const cronSecret = process.env.CRON_SECRET;
  const userAgent = req.headers.get('user-agent') || 'unknown';

  // 1. Cron Authentication Path: Check Bearer token or x-cron-secret header
  const authHeader = req.headers.get('authorization') || '';
  const cronSecretHeader = req.headers.get('x-cron-secret') || '';
  const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  const tokenToTest = bearerToken || cronSecretHeader;

  if (cronSecret && tokenToTest) {
    if (timingSafeEqualStrings(tokenToTest, cronSecret)) {
      // Valid cron secret authenticated. Distinguish scheduler actor from header/user-agent.
      const customInitiatedBy = req.headers.get('x-initiated-by');
      const actor = customInitiatedBy || (userAgent.toLowerCase().includes('github-actions') ? 'github_actions_cron' : 'vercel_cron');

      return {
        authorized: true,
        method: 'cron',
        actor,
        clientUserAgent: userAgent,
      };
    }
  }

  // 2. Manual Admin Session Path: Check active Supabase session & user role
  try {
    const user = await getCurrentUser();
    if (user) {
      if (hasMinimumRole(user.role, 'admin')) {
        return {
          authorized: true,
          method: 'admin',
          actor: `admin:${user.email || user.id}`,
          clientUserAgent: userAgent,
        };
      }
      return {
        authorized: false,
        status: 403,
        error: 'Forbidden: User lacks administrative privileges required to trigger master sync.',
      };
    }
  } catch (err: unknown) {
    console.warn('[IpoSyncApi] Session check error:', err);
  }

  // Neither Cron nor Admin path authorized
  return {
    authorized: false,
    status: 401,
    error: 'Unauthorized: Endpoint requires valid CRON_SECRET Bearer token or an authenticated administrator session.',
  };
}

export async function POST(req: NextRequest) {
  try {
    // 1. Dual-Authentication Verification (Correction 3)
    const authResult = await authenticateSyncRequest(req);
    if (!authResult.authorized) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    // 2. Parse source target (optional query param: ?source=sebi|nse|bse|all)
    const { searchParams } = new URL(req.url);
    const sourceParam = (searchParams.get('source') || 'all').toLowerCase();
    const validSources: SyncSource[] = ['sebi', 'nse', 'bse', 'all'];

    const targetSource: SyncSource = validSources.includes(sourceParam as SyncSource)
      ? (sourceParam as SyncSource)
      : 'all';

    const jobName =
      targetSource === 'nse'
        ? 'nse_hourly_sync'
        : targetSource === 'sebi'
        ? 'sebi_regulatory_sync'
        : 'master_reconciliation_sync';

    const lockHolderId = `${authResult.method}:${authResult.actor}:${Date.now()}`;

    // 3. Acquire Single Global Execution Lock ('ipo_sync_global') (Correction 1)
    const lockResult = await distributedLockService.acquireGlobalLock({
      lockedBy: lockHolderId,
      jobName,
      targetSource,
      ttlSeconds: 300,
    });

    if (!lockResult.acquired) {
      // Overlapping job: Safely yield with distinct status 'SKIPPED_LOCK' (Correction 4)
      const admin = createAdminClient();
      await admin.from('ipo_source_sync_runs').insert({
        source: targetSource,
        status: 'SKIPPED_LOCK',
        parser_version: 'v1.0',
        metadata: {
          skippedLock: true,
          jobName,
          reason: lockResult.reason,
          activeLockHeldBy: lockResult.lockedBy,
          initiatedBy: authResult.actor,
          clientUserAgent: authResult.clientUserAgent,
        },
      });

      return NextResponse.json(
        {
          status: 'skipped',
          code: 'SKIPPED_LOCK',
          reason: 'Lock active',
          message: lockResult.reason,
          jobName,
          targetSource,
          initiatedBy: authResult.actor,
        },
        { status: 200 }
      );
    }

    // 4. Execute Live Source Synchronization with automatic promotion & publication
    try {
      const result = await ipoSyncService.executeSync(targetSource, {
        initiatedBy: authResult.actor,
      });

      const totalFetched = result.metrics.reduce((acc, m) => acc + (m.recordsDiscovered || 0), 0);
      const totalIngested = result.metrics.reduce((acc, m) => acc + (m.recordsIngested || 0), 0);
      const totalUnchanged = result.metrics.reduce((acc, m) => acc + (m.recordsUnchanged || 0), 0);

      return NextResponse.json(
        {
          status: 'success',
          jobName,
          targetSource,
          initiatedBy: authResult.actor,
          authMethod: authResult.method,
          recordsFetched: totalFetched,
          recordsChanged: totalIngested,
          newObservations: totalIngested,
          recordsUnchanged: totalUnchanged,
          canonicalPromoted: result.draftPromotions || 0,
          canonicalPublished: result.publishedCount || 0,
          result,
        },
        { status: result.successfulSources > 0 ? 200 : 207 }
      );
    } finally {
      // 5. Always release global lock
      await distributedLockService.releaseGlobalLock(lockHolderId);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error during IPO sync';
    console.error('[IpoSyncRoute] Fatal error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
