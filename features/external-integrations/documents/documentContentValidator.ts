/**
 * features/external-integrations/documents/documentContentValidator.ts
 *
 * Content integrity, PDF signature inspection, and dual-hash (probe + full SHA-256) calculation.
 * Prevents HTML challenges/WAF pages from being treated as PDFs.
 */

import crypto from 'crypto';
import {
  DocumentUrlSecurity,
  documentUrlSecurity,
  MAX_DOCUMENT_SIZE_BYTES,
  MAX_REDIRECT_HOPS,
  DEFAULT_DOCUMENT_TIMEOUT_MS,
} from './documentUrlSecurity';
import { DocumentValidationResult } from './documentTypes';

export class DocumentContentValidator {
  private urlSecurity: DocumentUrlSecurity;

  constructor(urlSecurity: DocumentUrlSecurity = documentUrlSecurity) {
    this.urlSecurity = urlSecurity;
  }

  /**
   * Performs an initial lightweight probe (HEAD or Range GET) to verify:
   * 1. URL security & redirect allowlists
   * 2. HTTP status 200/206
   * 3. PDF magic bytes (%PDF-)
   * 4. Content size cap
   * 5. Lightweight probe hash
   */
  public async probeDocument(url: string): Promise<DocumentValidationResult> {
    const sec = this.urlSecurity.validateUrl(url);
    if (!sec.isSafe || !sec.sanitizedUrl) {
      return {
        isValid: false,
        httpStatus: 0,
        isPdfMagicValid: false,
        errorReason: sec.errorReason || 'SSRF security validation failed',
      };
    }

    try {
      const res = await this.safeFetchWithRedirects(sec.sanitizedUrl, {
        method: 'GET',
        headers: {
          Range: 'bytes=0-8191', // First 8KB
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'application/pdf,application/octet-stream,*/*',
        },
      });

      if (!res.ok) {
        return {
          isValid: false,
          httpStatus: res.status,
          isPdfMagicValid: false,
          errorReason: `Upstream returned HTTP status ${res.status}: ${res.statusText}`,
        };
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get('content-type') || undefined;
      const contentLengthHeader = res.headers.get('content-length');
      const contentLength = contentLengthHeader ? parseInt(contentLengthHeader, 10) : buffer.length;

      // Check for HTML challenge or error page
      const isHtml = this.detectHtmlContent(buffer);
      if (isHtml) {
        return {
          isValid: false,
          httpStatus: res.status,
          contentType: 'text/html',
          isPdfMagicValid: false,
          errorReason: 'Upstream returned HTML content/challenge instead of valid PDF.',
        };
      }

      // Check PDF magic bytes: "%PDF-"
      const isPdfMagicValid = this.verifyPdfMagicBytes(buffer);
      if (!isPdfMagicValid) {
        return {
          isValid: false,
          httpStatus: res.status,
          contentType,
          isPdfMagicValid: false,
          errorReason: 'Missing "%PDF-" magic byte header; file is not a valid PDF.',
        };
      }

      // Compute probe hash (hash of first 8KB)
      const probeHash = crypto.createHash('sha256').update(buffer).digest('hex');

      return {
        isValid: true,
        httpStatus: res.status,
        contentType,
        contentLength,
        probeHash,
        isPdfMagicValid: true,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        isValid: false,
        httpStatus: 0,
        isPdfMagicValid: false,
        errorReason: `Probe connection error: ${msg}`,
      };
    }
  }

  /**
   * Downloads the complete document stream (with size cap) and calculates the full canonical SHA-256.
   */
  public async downloadAndComputeFullHash(
    url: string
  ): Promise<{ isValid: boolean; fullSha256?: string; byteSize?: number; errorReason?: string }> {
    const sec = this.urlSecurity.validateUrl(url);
    if (!sec.isSafe || !sec.sanitizedUrl) {
      return { isValid: false, errorReason: sec.errorReason };
    }

    try {
      const res = await this.safeFetchWithRedirects(sec.sanitizedUrl, {
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'application/pdf,application/octet-stream,*/*',
        },
      });

      if (!res.ok) {
        return { isValid: false, errorReason: `HTTP ${res.status}: ${res.statusText}` };
      }

      const contentLengthHeader = res.headers.get('content-length');
      if (contentLengthHeader) {
        const declaredSize = parseInt(contentLengthHeader, 10);
        if (declaredSize > MAX_DOCUMENT_SIZE_BYTES) {
          return {
            isValid: false,
            errorReason: `Declared file size (${declaredSize} bytes) exceeds maximum limit (${MAX_DOCUMENT_SIZE_BYTES} bytes).`,
          };
        }
      }

      const body = res.body;
      if (!body) {
        return { isValid: false, errorReason: 'Empty response body from upstream server.' };
      }

      const hash = crypto.createHash('sha256');
      let totalBytes = 0;
      let firstChunk: Uint8Array | null = null;

      // Stream chunks to enforce size limit and calculate hash without memory explosion
      const reader = body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (!firstChunk && value) {
          firstChunk = value;
        }

        totalBytes += value.length;
        if (totalBytes > MAX_DOCUMENT_SIZE_BYTES) {
          await reader.cancel();
          return {
            isValid: false,
            errorReason: `Document exceeded maximum size threshold of ${MAX_DOCUMENT_SIZE_BYTES} bytes.`,
          };
        }

        hash.update(value);
      }

      if (firstChunk) {
        const isPdfMagicValid = this.verifyPdfMagicBytes(Buffer.from(firstChunk));
        if (!isPdfMagicValid) {
          return {
            isValid: false,
            errorReason: 'Stream payload does not begin with "%PDF-" signature.',
          };
        }
      }

      const fullSha256 = hash.digest('hex');

      return {
        isValid: true,
        fullSha256,
        byteSize: totalBytes,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { isValid: false, errorReason: `Stream download failed: ${msg}` };
    }
  }

  /**
   * Safely follows HTTP redirects, manually validating each hop destination against SSRF allowlists.
   */
  public async safeFetchWithRedirects(
    initialUrl: string,
    init: RequestInit
  ): Promise<Response> {
    let currentUrl = initialUrl;
    let redirectCount = 0;

    while (redirectCount <= MAX_REDIRECT_HOPS) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DEFAULT_DOCUMENT_TIMEOUT_MS);

      try {
        const res = await fetch(currentUrl, {
          ...init,
          redirect: 'manual', // Intercept all redirects
          signal: controller.signal,
        });

        // If redirect status (301, 302, 303, 307, 308)
        if (res.status >= 300 && res.status < 400) {
          const location = res.headers.get('location');
          if (!location) {
            throw new Error(`Upstream returned redirect status ${res.status} without Location header.`);
          }

          redirectCount++;
          if (redirectCount > MAX_REDIRECT_HOPS) {
            throw new Error(`Exceeded maximum redirect limit of ${MAX_REDIRECT_HOPS} hops.`);
          }

          // Re-validate redirect hop destination against domain allowlist & SSRF rules
          const hopSec = this.urlSecurity.validateRedirectHop(currentUrl, location);
          if (!hopSec.isSafe || !hopSec.sanitizedUrl) {
            throw new Error(
              `Redirect to "${location}" was blocked by SSRF security policy: ${hopSec.errorReason}`
            );
          }

          currentUrl = hopSec.sanitizedUrl;
          continue;
        }

        return res;
      } finally {
        clearTimeout(timeoutId);
      }
    }

    throw new Error('Too many redirects');
  }

  /**
   * Verifies that the buffer begins with the PDF magic bytes: %PDF- (0x25 0x50 0x44 0x46 0x2D)
   */
  public verifyPdfMagicBytes(buffer: Buffer): boolean {
    if (!buffer || buffer.length < 5) return false;
    const header = buffer.subarray(0, 5).toString('ascii');
    return header === '%PDF-';
  }

  /**
   * Detects HTML signatures like <!DOCTYPE html, <html, or common challenge strings.
   */
  public detectHtmlContent(buffer: Buffer): boolean {
    if (!buffer || buffer.length === 0) return false;
    const sample = buffer.subarray(0, 512).toString('ascii').toLowerCase();
    return (
      sample.includes('<!doctype html') ||
      sample.includes('<html') ||
      sample.includes('<head>') ||
      sample.includes('cloudflare') ||
      sample.includes('access denied') ||
      sample.includes('challenge-platform')
    );
  }
}

export const documentContentValidator = new DocumentContentValidator();
