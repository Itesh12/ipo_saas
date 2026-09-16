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

  private cachedSessionCookie: string | null = null;
  private sessionCookieExpiry = 0;

  /**
   * Acquires or reuses a valid session cookie for SEBI AJAX pagination.
   */
  public async getSessionCookie(smid: number = 10): Promise<string> {
    const now = Date.now();
    if (this.cachedSessionCookie && now < this.sessionCookieExpiry) {
      return this.cachedSessionCookie;
    }

    const initialUrl = `https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=3&smid=${smid}&ssid=15`;
    const response = await fetch(initialUrl, {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(SebiSourceClient.TIMEOUT_MS),
    });

    const setCookie = response.headers.get('set-cookie') || '';
    const cookiePart = setCookie.split(';')[0];
    this.cachedSessionCookie = cookiePart;
    this.sessionCookieExpiry = now + 10 * 60 * 1000; // 10 minutes cache
    return this.cachedSessionCookie;
  }

  /**
   * Fetches a specific page of filings using official SEBI AJAX endpoint.
   * Traverses DRHP (smid=10), RHP (smid=11), and ROC Prospectus (smid=12).
   */
  public async fetchPaginatedFilings(
    smid: number,
    pageNumber: number,
    options?: {
      fromDate?: string;
      toDate?: string;
      fromYear?: string;
      toYear?: string;
      search?: string;
    }
  ): Promise<{
    html: string;
    status: number;
    fetchedAt: string;
    responseHash: string;
    byteLength: number;
    pageNumber: number;
    totalRecordsDiscovered: number;
    totalPagesDiscovered: number;
    hasNextPage: boolean;
  }> {
    const fetchedAt = new Date().toISOString();
    const referer = `https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=3&smid=${smid}&ssid=15`;

    let html = '';
    let status = 200;

    if (pageNumber === 1 && !options?.fromDate && !options?.fromYear) {
      // First page can be fetched directly via HomeAction.do
      const res = await this.fetchLiveFilings(referer);
      html = res.html;
      status = res.status;
    } else {
      const cookie = await this.getSessionCookie(smid);
      const postBody = new URLSearchParams({
        nextValue: '1',
        next: 'n',
        search: options?.search || '',
        fromDate: options?.fromDate || '',
        toDate: options?.toDate || '',
        fromYear: options?.fromYear || '',
        toYear: options?.toYear || '',
        deptId: '',
        sid: '3',
        ssid: '15',
        smid: String(smid),
        ssidhidden: '15',
        intmid: '-1',
        sText: 'Filings',
        ssText: '',
        smText: '',
        doDirect: String(pageNumber),
      }).toString();

      let response: Response;
      try {
        response = await fetch('https://www.sebi.gov.in/sebiweb/ajax/home/getnewslistinfo.jsp', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
            'Referer': referer,
            'X-Requested-With': 'XMLHttpRequest',
            'Cookie': cookie,
          },
          body: postBody,
          signal: AbortSignal.timeout(SebiSourceClient.TIMEOUT_MS),
        });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        throw new SebiClientError(`SEBI paginated acquisition failed on page ${pageNumber}: ${errorMsg}`, 'SEBI_NETWORK_ERROR');
      }

      if (!response.ok) {
        throw new SebiClientError(
          `SEBI pagination returned status: ${response.status} on page ${pageNumber}`,
          'SEBI_HTTP_ERROR',
          response.status
        );
      }

      html = await response.text();
      status = response.status;
    }

    const byteLength = Buffer.byteLength(html, 'utf-8');
    const responseHash = crypto.createHash('sha256').update(html).digest('hex');

    // Parse record counter: e.g. "1 to 25 of 2202 records"
    let totalRecordsDiscovered = 0;
    let totalPagesDiscovered = 1;
    const countMatch = html.match(/(\d+)\s+to\s+(\d+)\s+of\s+(\d+)\s+records/i);
    if (countMatch) {
      totalRecordsDiscovered = parseInt(countMatch[3], 10);
      totalPagesDiscovered = Math.ceil(totalRecordsDiscovered / 25);
    }

    const hasNextPage = pageNumber < totalPagesDiscovered;

    return {
      html,
      status,
      fetchedAt,
      responseHash,
      byteLength,
      pageNumber,
      totalRecordsDiscovered,
      totalPagesDiscovered,
      hasNextPage,
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
