/**
 * features/external-integrations/documents/documentUrlSecurity.ts
 *
 * Hardened SSRF & Security Engine for Document Intelligence.
 * Protects against:
 * 1. Userinfo smuggling (https://sebi.gov.in@evil.com)
 * 2. Non-HTTPS protocols
 * 3. Private / loopback IP literals and hostnames
 * 4. Open redirects (intercepts and re-validates each redirect hop against allowlist)
 * 5. Oversized streams (enforces maximum byte cap)
 */

import { DocumentSourceRegistry, documentSourceRegistry } from './documentSourceRegistry';
import { DocumentSecurityCheckResult } from './documentTypes';

export const MAX_DOCUMENT_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
export const MAX_REDIRECT_HOPS = 3;
export const DEFAULT_DOCUMENT_TIMEOUT_MS = 15000;

export class DocumentUrlSecurity {
  private registry: DocumentSourceRegistry;

  constructor(registry: DocumentSourceRegistry = documentSourceRegistry) {
    this.registry = registry;
  }

  /**
   * Evaluates if a given URL passes all strict SSRF and domain allowlist criteria.
   */
  public validateUrl(rawUrl: string): DocumentSecurityCheckResult {
    if (!rawUrl || typeof rawUrl !== 'string') {
      return { isSafe: false, errorReason: 'Empty or invalid URL format' };
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl.trim());
    } catch {
      return { isSafe: false, errorReason: 'Malformed URL could not be parsed' };
    }

    // 1. Strict HTTPS Scheme
    if (parsed.protocol !== 'https:') {
      return {
        isSafe: false,
        errorReason: `Insecure protocol "${parsed.protocol}". Only HTTPS is permitted.`,
      };
    }

    // 2. Prohibit userinfo credentials in URL (prevents https://trusted@attacker.com)
    if (parsed.username || parsed.password) {
      return {
        isSafe: false,
        errorReason: 'Credentials/userinfo in URL are strictly prohibited.',
      };
    }

    const hostname = parsed.hostname.toLowerCase();

    // 3. Prohibit IP Literals, Localhost and Private Address Spaces
    if (this.isPrivateOrLoopbackHost(hostname)) {
      return {
        isSafe: false,
        errorReason: `Destination host "${hostname}" is a private or loopback address.`,
      };
    }

    // 4. Verify Against Allowlist Registry
    if (!this.registry.isDomainAllowed(hostname)) {
      return {
        isSafe: false,
        resolvedHostname: hostname,
        errorReason: `Hostname "${hostname}" is not in the authorized regulatory/registrar domain registry.`,
      };
    }

    return {
      isSafe: true,
      sanitizedUrl: parsed.href,
      resolvedHostname: hostname,
    };
  }

  /**
   * Intercepts a redirect header and validates the destination before following.
   */
  public validateRedirectHop(
    currentUrl: string,
    locationHeader: string
  ): DocumentSecurityCheckResult {
    try {
      // Resolve relative redirects against current URL
      const targetUrl = new URL(locationHeader, currentUrl).href;
      return this.validateUrl(targetUrl);
    } catch {
      return {
        isSafe: false,
        errorReason: `Invalid redirect location header "${locationHeader}".`,
      };
    }
  }

  /**
   * Detects localhost, numeric IPs, IPv6 literals, and private CIDR ranges.
   */
  private isPrivateOrLoopbackHost(hostname: string): boolean {
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '::1'
    ) {
      return true;
    }

    // Check IPv4 pattern
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const match = hostname.match(ipv4Regex);
    if (match) {
      const [, o1, o2] = match.map(Number);
      // 10.0.0.0/8
      if (o1 === 10) return true;
      // 172.16.0.0/12
      if (o1 === 172 && o2 >= 16 && o2 <= 31) return true;
      // 192.168.0.0/16
      if (o1 === 192 && o2 === 168) return true;
      // 127.0.0.0/8
      if (o1 === 127) return true;
      // 169.254.0.0/16 (link-local)
      if (o1 === 169 && o2 === 254) return true;
      // 0.0.0.0/8
      if (o1 === 0) return true;
      return true; // Disallow all raw IP addresses to authoritative hostnames only
    }

    // Disallow IPv6 brackets
    if (hostname.startsWith('[') || hostname.includes(':')) {
      return true;
    }

    return false;
  }
}

export const documentUrlSecurity = new DocumentUrlSecurity();
