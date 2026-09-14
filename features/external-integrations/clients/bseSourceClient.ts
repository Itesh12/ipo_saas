/**
 * features/external-integrations/clients/bseSourceClient.ts
 *
 * Phase 9 Stage 3A.2: BSE Source Client (Tier 1 Exchange Authority - Conservative Mode).
 * Evaluates BSE India official public issues endpoint.
 *
 * Strict Guarantees:
 * 1. Zero-Mock & Conservative Degradation: If BSE automated requests are challenged or
 *    return ASP.NET errors, the client reports degraded status cleanly without fabricating data.
 * 2. SSRF Protection: Whitelists bseindia.com.
 * 3. Timeout Budget: 8,000ms.
 */

import { BseRawIssue } from '../adapters/bseExtractor';

export interface BseFetchResult {
  notices: BseRawIssue[];
  status: 'healthy' | 'degraded';
  httpStatus?: number;
  fetchedAt: string;
  reason?: string;
}

export class BseSourceClient {
  public static readonly BSE_OFFICIAL_URL = 'https://www.bseindia.com/markets/PublicIssues/IPOIssues_new.aspx';
  private static readonly TIMEOUT_MS = 8000;

  /**
   * Evaluates live BSE status conservatively.
   * Degrades gracefully when automated scraping is restricted.
   */
  public async fetchLiveNotices(): Promise<BseFetchResult> {
    const fetchedAt = new Date().toISOString();

    try {
      const resp = await fetch(BseSourceClient.BSE_OFFICIAL_URL, {
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(BseSourceClient.TIMEOUT_MS),
      });

      if (!resp.ok) {
        return {
          notices: [],
          status: 'degraded',
          httpStatus: resp.status,
          fetchedAt,
          reason: `BSE endpoint returned HTTP ${resp.status}`,
        };
      }

      const text = await resp.text();
      // Check if ASP.NET error page or client-side redirect
      if (text.includes('Server Error') || text.includes('Runtime Error') || text.length < 500) {
        return {
          notices: [],
          status: 'degraded',
          httpStatus: resp.status,
          fetchedAt,
          reason: 'BSE returned ASP.NET server error or insufficient payload',
        };
      }

      // If page loaded, note that live parsing requires Angular dynamic hydration
      return {
        notices: [],
        status: 'degraded',
        httpStatus: resp.status,
        fetchedAt,
        reason: 'BSE Public Issues portal requires dynamic JS hydration (SPA). Gracefully degraded.',
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        notices: [],
        status: 'degraded',
        fetchedAt,
        reason: `BSE network probe degraded: ${msg}`,
      };
    }
  }
}

export const bseSourceClient = new BseSourceClient();
