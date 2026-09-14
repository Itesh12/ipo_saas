/**
 * app/api/admin/ipo-sync/run/route.ts
 *
 * Phase 9 Stage 3A.2: Dual-Authentication Live IPO Synchronization Endpoint.
 *
 * Enforces Condition 1: Two separate, strictly validated authentication paths:
 * 1. Cron Path:
 *    - Validates Bearer token or x-cron-secret header against CRON_SECRET environment variable.
 *    - Employs crypto.timingSafeEqual to prevent side-channel timing attacks.
 * 2. Manual Admin Path:
 *    - Authenticates active Supabase session.
 *    - Requires minimum 'admin' role (profiles table check via hasMinimumRole).
 *
 * Guarantees:
 * - Zero unauthenticated execution (returns HTTP 401).
 * - Zero privilege escalation (insufficient role returns HTTP 403).
 * - CRON_SECRET is strictly server-side and never leaked.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getCurrentUser } from '@/lib/security/auth-guards';
import { hasMinimumRole } from '@/lib/security/roles';
import { ipoSyncService, SyncSource } from '@/features/external-integrations/services/ipoSyncService';

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

/**
 * Evaluates dual-authentication paths:
 * Returns { authorized: true, method: 'cron' | 'admin', userId?: string } or { authorized: false, status: 401 | 403, error: string }
 */
export async function authenticateSyncRequest(req: NextRequest): Promise<
  | { authorized: true; method: 'cron' | 'admin'; actor: string }
  | { authorized: false; status: number; error: string }
> {
  const cronSecret = process.env.CRON_SECRET;

  // 1. Cron Authentication Path: Check Bearer token or x-cron-secret header
  const authHeader = req.headers.get('authorization') || '';
  const cronSecretHeader = req.headers.get('x-cron-secret') || '';
  const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();

  const tokenToTest = bearerToken || cronSecretHeader;

  if (cronSecret && tokenToTest) {
    if (timingSafeEqualStrings(tokenToTest, cronSecret)) {
      return { authorized: true, method: 'cron', actor: 'cron_scheduler' };
    }
  }

  // 2. Manual Admin Session Path: Check active Supabase session & user role
  try {
    const user = await getCurrentUser();
    if (user) {
      if (hasMinimumRole(user.role, 'admin')) {
        return { authorized: true, method: 'admin', actor: user.email || user.id };
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
    error: 'Unauthorized: Endpoint requires valid CRON_SECRET or an authenticated administrator session.',
  };
}

export async function POST(req: NextRequest) {
  try {
    // 1. Dual-Authentication Verification (Condition 1)
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

    // 3. Execute Live Source Synchronization
    const result = await ipoSyncService.executeSync(targetSource, {
      initiatedBy: `${authResult.method}:${authResult.actor}`,
    });

    return NextResponse.json(
      {
        success: result.failedSources === 0,
        initiatedBy: authResult.actor,
        authMethod: authResult.method,
        result,
      },
      { status: result.successfulSources > 0 ? 200 : 207 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error during IPO master sync';
    console.error('[IpoSyncRoute] Fatal error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}

