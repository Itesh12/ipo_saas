/**
 * features/external-integrations/clients/nseSourceClient.ts
 *
 * Phase 9 Stage 3A.2: NSE Live Source Acquisition Client (Tier 1 Exchange Authority).
 * Performs session handshake against official NSE India portal to retrieve live public issues.
 *
 * Strict Guarantees:
 * 1. Two-Step Session Handshake: Acquires session cookies before requesting JSON API.
 * 2. SSRF & Domain Whitelist: Validates hostname against official NSE domain whitelist.
 * 3. Strict Timeout: 10,000ms total budget.
 * 4. Semantic Validation (Condition 2): HTTP 200 is not enough.
 *    Validates JSON Content-Type, array schema, non-empty issue keys, and bot-shield error pages.
 * 5. Zero-Fixture Fallback: Throws typed error on failure; never loads mock fixtures.
 */

import crypto from 'crypto';
import { NseRawIssue } from '../adapters/nseExtractor';

export class NseClientError extends Error {
  constructor(message: string, public readonly code: string, public readonly status?: number) {
    super(message);
    this.name = 'NseClientError';
  }
}

export interface NseFetchResult {
  rawJson: string;
  issues: NseRawIssue[];
  status: number;
  fetchedAt: string;
  responseHash: string;
  byteLength: number;
}

export class NseSourceClient {
  public static readonly OFFICIAL_NSE_PORTAL = 'https://www.nseindia.com';
  public static readonly OFFICIAL_NSE_API_URL = 'https://www.nseindia.com/api/ipo-current-issue';

  private static readonly ALLOWED_HOSTNAMES = new Set(['www.nseindia.com', 'nseindia.com']);
  private static readonly TIMEOUT_MS = 10000;

  /**
   * Performs the official session handshake and retrieves live current issues.
   */
  public async fetchLiveCurrentIssues(
    apiUrl: string = NseSourceClient.OFFICIAL_NSE_API_URL
  ): Promise<NseFetchResult> {
    this.validateTargetUrl(apiUrl);

    const fetchedAt = new Date().toISOString();
    const timeoutSignal = AbortSignal.timeout(NseSourceClient.TIMEOUT_MS);

    // Step 1: Session Handshake to acquire NSE cookies
    const cookieHeader = await this.performSessionHandshake(timeoutSignal);

    // Step 2: Query the IPO API endpoint with active session cookies
    let response: Response;
    try {
      response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://www.nseindia.com/companies-listing/corporate-filings-offer-documents',
          'Cookie': cookieHeader,
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        },
        signal: timeoutSignal,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new NseClientError(`NSE API network request failed: ${msg}`, 'NSE_NETWORK_ERROR');
    }

    if (!response.ok) {
      throw new NseClientError(
        `NSE API returned non-OK status: ${response.status} ${response.statusText}`,
        'NSE_HTTP_ERROR',
        response.status
      );
    }

    // Step 3: Semantic Content-Type Validation
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json') && !contentType.toLowerCase().includes('text/plain')) {
      throw new NseClientError(
        `NSE returned unexpected Content-Type: '${contentType}'. Expected application/json.`,
        'NSE_CONTENT_TYPE_INVALID',
        response.status
      );
    }

    const rawText = await response.text();
    const byteLength = Buffer.byteLength(rawText, 'utf-8');

    // Step 4: Semantic JSON Schema Validation (Condition 2)
    const issues = this.validateAndParsePayload(rawText);

    const responseHash = crypto.createHash('sha256').update(rawText).digest('hex');

    return {
      rawJson: rawText,
      issues,
      status: response.status,
      fetchedAt,
      responseHash,
      byteLength,
    };
  }

  /**
   * SSRF Protection: Checks URL against approved NSE domain whitelist.
   */
  public validateTargetUrl(rawUrl: string): void {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new NseClientError(`Invalid target URL provided: ${rawUrl}`, 'NSE_INVALID_URL');
    }

    if (parsed.protocol !== 'https:') {
      throw new NseClientError(
        `Insecure protocol '${parsed.protocol}'. NSE client requires HTTPS.`,
        'NSE_INSECURE_PROTOCOL'
      );
    }

    if (!NseSourceClient.ALLOWED_HOSTNAMES.has(parsed.hostname.toLowerCase())) {
      throw new NseClientError(
        `SSRF Protection Violation: Hostname '${parsed.hostname}' is not in approved NSE whitelist.`,
        'NSE_SSRF_VIOLATION'
      );
    }
  }

  /**
   * Acquires browser-equivalent cookies from the NSE homepage handshake.
   */
  private async performSessionHandshake(signal: AbortSignal): Promise<string> {
    try {
      const handshakeResp = await fetch(NseSourceClient.OFFICIAL_NSE_PORTAL, {
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal,
      });

      // Extract Set-Cookie headers
      const cookies: string[] = [];
      
      // Fetch API standard getSetCookie() if available in modern Node/Next
      if (typeof handshakeResp.headers.getSetCookie === 'function') {
        cookies.push(...handshakeResp.headers.getSetCookie());
      } else {
        const rawCookie = handshakeResp.headers.get('set-cookie');
        if (rawCookie) {
          cookies.push(rawCookie);
        }
      }

      // Format cookie string for subsequent request
      const formatted = cookies
        .map((c) => c.split(';')[0].trim())
        .filter((c) => c.length > 0)
        .join('; ');

      return formatted;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new NseClientError(`NSE session handshake failed: ${msg}`, 'NSE_HANDSHAKE_FAILED');
    }
  }

  /**
   * Semantic JSON Schema Validation (Condition 2).
   * Rejects HTTP 200 error pages, HTML shells, and malformed schemas.
   */
  public validateAndParsePayload(rawJson: string): NseRawIssue[] {
    const trimmed = rawJson.trim();

    // Check if response is actually HTML despite 200 OK
    if (trimmed.startsWith('<') || trimmed.includes('<html') || trimmed.includes('<!DOCTYPE')) {
      throw new NseClientError(
        'NSE returned HTML page instead of JSON API response. Likely bot protection or session expiry.',
        'NSE_HTML_SHELL_DETECTED'
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new NseClientError(
        'Failed to parse NSE response body as valid JSON.',
        'NSE_INVALID_JSON'
      );
    }

    // Must be array of issue objects
    if (!Array.isArray(parsed)) {
      // Sometimes NSE wraps issues under a key like 'data'
      if (parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).data)) {
        parsed = (parsed as Record<string, unknown>).data;
      } else {
        throw new NseClientError(
          'NSE JSON payload structure invalid: expected array of issues.',
          'NSE_SCHEMA_NOT_ARRAY'
        );
      }
    }

    const rawArray = parsed as Array<Record<string, unknown>>;

    // Validate that each item conforms to expected NseRawIssue fields
    const validIssues: NseRawIssue[] = [];
    for (let i = 0; i < rawArray.length; i++) {
      const item = rawArray[i];
      if (!item || typeof item !== 'object') {
        throw new NseClientError(
          `NSE payload item at index ${i} is not a valid object.`,
          'NSE_SCHEMA_INVALID_ITEM'
        );
      }

      // Must have symbol or companyName
      const symbol = typeof item.symbol === 'string' ? item.symbol : '';
      const companyName = typeof item.companyName === 'string' ? item.companyName : (typeof item.company === 'string' ? item.company : '');

      if (!symbol && !companyName) {
        throw new NseClientError(
          `NSE payload item at index ${i} lacks required 'symbol' and 'companyName' attributes.`,
          'NSE_SCHEMA_MISSING_IDENTIFIERS'
        );
      }

      validIssues.push({
        symbol,
        companyName: companyName || symbol,
        isin: typeof item.isin === 'string' ? item.isin : undefined,
        series: typeof item.series === 'string' ? item.series : (typeof item.issueType === 'string' ? item.issueType : undefined),
        issueStartDate: typeof item.issueStartDate === 'string' ? item.issueStartDate : (typeof item.startDate === 'string' ? item.startDate : undefined),
        issueEndDate: typeof item.issueEndDate === 'string' ? item.issueEndDate : (typeof item.endDate === 'string' ? item.endDate : undefined),
        priceBand: typeof item.priceBand === 'string' ? item.priceBand : (typeof item.price === 'string' ? item.price : undefined),
        lotSize: typeof item.lotSize === 'number' || typeof item.lotSize === 'string' ? item.lotSize : undefined,
        issueSize: typeof item.issueSize === 'number' || typeof item.issueSize === 'string' ? item.issueSize : undefined,
        documentUrl: typeof item.documentUrl === 'string' ? item.documentUrl : undefined,
        status: typeof item.status === 'string' ? item.status : undefined,
      });
    }

    return validIssues;
  }
}

export const nseSourceClient = new NseSourceClient();
