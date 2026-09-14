/**
 * features/external-integrations/clients/sebiSourceClient.ts
 *
 * Phase 9 Stage 3A.2: SEBI Live Source Acquisition Client (Tier 1 Regulatory Authority).
 * Fetches real regulatory filings directly from SEBI's official public issues endpoint.
 *
 * Strict Guarantees:
 * 1. SSRF & Origin Protection: Validates hostname against official SEBI domain whitelist.
 * 2. Strict Timeout: 10,000ms timeout budget with AbortController.
 * 3. Semantic Validation (Condition 2): HTTP 200 is not enough.
 *    Validates Content-Type, payload size, anti-bot/CAPTCHA heuristics, and HTML table structure.
 * 4. Zero-Fixture Fallback: Throws typed error on failure; never loads mock fixtures.
 */

import crypto from 'crypto';

export class SebiClientError extends Error {
  constructor(message: string, public readonly code: string, public readonly status?: number) {
    super(message);
    this.name = 'SebiClientError';
  }
}

export interface SebiFetchResult {
  html: string;
  status: number;
  fetchedAt: string;
  responseHash: string;
  byteLength: number;
}

export class SebiSourceClient {
  public static readonly OFFICIAL_SEBI_URL =
    'https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=3&smid=11&ssid=15';

  private static readonly ALLOWED_HOSTNAMES = new Set(['www.sebi.gov.in', 'sebi.gov.in']);
  private static readonly TIMEOUT_MS = 10000;
  private static readonly MIN_PAYLOAD_BYTES = 1024; // Official SEBI listing page is >= 30KB

  /**
   * Fetches live HTML filings from the official SEBI public issues portal.
   */
  public async fetchLiveFilings(url: string = SebiSourceClient.OFFICIAL_SEBI_URL): Promise<SebiFetchResult> {
    // 1. SSRF and Domain Whitelist Protection
    this.validateTargetUrl(url);

    const fetchedAt = new Date().toISOString();
    let response: Response;

    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        },
        signal: AbortSignal.timeout(SebiSourceClient.TIMEOUT_MS),
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      throw new SebiClientError(`SEBI network acquisition failed: ${errorMsg}`, 'SEBI_NETWORK_ERROR');
    }

    // 2. HTTP Status Validation
    if (!response.ok) {
      throw new SebiClientError(
        `SEBI returned non-OK HTTP status: ${response.status} ${response.statusText}`,
        'SEBI_HTTP_ERROR',
        response.status
      );
    }

    // 3. Semantic Content-Type Validation
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('text/html')) {
      throw new SebiClientError(
        `SEBI returned unexpected Content-Type: '${contentType}'. Expected text/html.`,
        'SEBI_CONTENT_TYPE_INVALID',
        response.status
      );
    }

    const bodyText = await response.text();
    const byteLength = Buffer.byteLength(bodyText, 'utf-8');

    // 4. Semantic Payload Validation: Size, CAPTCHA, and Structure
    this.validateSemanticPayload(bodyText, byteLength);

    const responseHash = crypto.createHash('sha256').update(bodyText).digest('hex');

    return {
      html: bodyText,
      status: response.status,
      fetchedAt,
      responseHash,
      byteLength,
    };
  }

  /**
   * SSRF Protection: Ensures URL strictly belongs to approved SEBI domain.
   */
  public validateTargetUrl(rawUrl: string): void {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new SebiClientError(`Invalid target URL provided: ${rawUrl}`, 'SEBI_INVALID_URL');
    }

    if (parsed.protocol !== 'https:') {
      throw new SebiClientError(
        `Insecure protocol '${parsed.protocol}'. SEBI client requires HTTPS.`,
        'SEBI_INSECURE_PROTOCOL'
      );
    }

    if (!SebiSourceClient.ALLOWED_HOSTNAMES.has(parsed.hostname.toLowerCase())) {
      throw new SebiClientError(
        `SSRF Protection Violation: Hostname '${parsed.hostname}' is not in approved SEBI whitelist.`,
        'SEBI_SSRF_VIOLATION'
      );
    }
  }

  /**
   * Semantic Payload Integrity Validation (Condition 2).
   */
  public validateSemanticPayload(html: string, byteLength: number): void {
    if (byteLength < SebiSourceClient.MIN_PAYLOAD_BYTES) {
      throw new SebiClientError(
        `SEBI response body too small (${byteLength} bytes). Expected at least ${SebiSourceClient.MIN_PAYLOAD_BYTES} bytes.`,
        'SEBI_PAYLOAD_TOO_SMALL'
      );
    }

    const lower = html.toLowerCase();

    // Anti-bot & Captcha Detection heuristics
    if (
      lower.includes('cf-chl-') ||
      lower.includes('access denied') ||
      lower.includes('captcha-box') ||
      lower.includes('g-recaptcha') ||
      (lower.includes('attention required') && lower.includes('cloudflare'))
    ) {
      throw new SebiClientError(
        'SEBI response contains anti-bot challenge or CAPTCHA block instead of filings data.',
        'SEBI_CAPTCHA_BLOCKED'
      );
    }

    // Expected Structural Marker: Must contain table elements with row entries
    const hasTable = lower.includes('<table') || lower.includes('class="table') || lower.includes('sample_1');
    const hasRows = lower.includes('<tr') && lower.includes('<td');

    if (!hasTable || !hasRows) {
      throw new SebiClientError(
        'SEBI HTML response lacks expected table structure (<table...><tr...><td...>). Potential site layout change.',
        'SEBI_SCHEMA_STRUCTURE_INVALID'
      );
    }
  }
}

export const sebiSourceClient = new SebiSourceClient();
