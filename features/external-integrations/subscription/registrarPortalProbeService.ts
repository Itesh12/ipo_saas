/**
 * features/external-integrations/subscription/registrarPortalProbeService.ts
 *
 * Phase 9 Stage 3C: Observable Registrar Portal Monitoring (Revision 2.2).
 *
 * Strict Rules:
 * 1. Observable States: not_discovered -> announced -> portal_reachable -> query_endpoint_detected -> query_active.
 * 2. Positive evidence required for query_active: company MUST be detected in active dropdown / endpoint.
 * 3. Domain allowlist: enforced via DOC_SOURCE_REGISTRY_V1.
 * 4. Zero Credential Submission: absolutely NO automated submission of PAN, DP ID, or application numbers.
 */

import { DocumentUrlSecurity } from '../documents/documentUrlSecurity';
import { RegistrarPortalProbeResult, RegistrarQueryState } from './subscriptionTypes';

export class RegistrarPortalProbeService {
  private static urlSecurity = new DocumentUrlSecurity();

  /**
   * Probes a registrar allotment portal for positive evidence of target IPO availability.
   */
  public static async probePortal(params: {
    ipoId: string;
    registrarName: string;
    portalUrl: string;
    companyName: string;
    companySymbol?: string | null;
  }): Promise<RegistrarPortalProbeResult> {
    const { ipoId, registrarName, portalUrl, companyName, companySymbol } = params;

    // 1. SSRF & Domain allowlist validation
    const ssrfCheck = this.urlSecurity.validateUrl(portalUrl);
    if (!ssrfCheck.isSafe) {
      return {
        ipo_id: ipoId,
        registrar_name: registrarName,
        portal_url: portalUrl,
        query_state: 'blocked',
        last_probed_at: new Date().toISOString(),
        probe_http_status: null,
        company_detected_in_dropdown: false,
        error_details: `SSRF security violation: ${ssrfCheck.errorReason}`,
      };
    }

    // 2. Perform non-credentialed HTTP probe
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(portalUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'IPOSaaS-AllotmentProbe/1.0',
          Accept: 'text/html,application/xhtml+xml,application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const statusCode = response.status;

      if (!response.ok) {
        if (statusCode === 403 || statusCode === 401) {
          return {
            ipo_id: ipoId,
            registrar_name: registrarName,
            portal_url: portalUrl,
            query_state: 'blocked',
            last_probed_at: new Date().toISOString(),
            probe_http_status: statusCode,
            company_detected_in_dropdown: false,
            error_details: `HTTP ${statusCode} WAF or Access Denied.`,
          };
        }
        return {
          ipo_id: ipoId,
          registrar_name: registrarName,
          portal_url: portalUrl,
          query_state: 'temporarily_unavailable',
          last_probed_at: new Date().toISOString(),
          probe_http_status: statusCode,
          company_detected_in_dropdown: false,
          error_details: `HTTP error response: ${statusCode}`,
        };
      }

      const htmlText = await response.text();

      // 3. Positive Evidence Extraction
      // Clean company terms for fuzzy match in dropdown / select elements
      const normalizedCompany = companyName.toLowerCase().replace(/limited|ltd|pvt/gi, '').trim();
      const symbolLower = (companySymbol || '').toLowerCase().trim();

      const htmlLower = htmlText.toLowerCase();

      // Check if dropdown or company listing exists
      const hasCompanyMatch =
        (normalizedCompany.length > 3 && htmlLower.includes(normalizedCompany)) ||
        (symbolLower.length > 2 && htmlLower.includes(symbolLower));

      // Check if active query form is present
      const hasQueryForm =
        htmlLower.includes('pan') ||
        htmlLower.includes('application') ||
        htmlLower.includes('dp client') ||
        htmlLower.includes('select company');

      let state: RegistrarQueryState = 'portal_reachable';

      if (hasCompanyMatch && hasQueryForm) {
        // Positive evidence: company is listed and query form is available
        state = 'query_active';
      } else if (hasCompanyMatch) {
        state = 'query_endpoint_detected';
      }

      return {
        ipo_id: ipoId,
        registrar_name: registrarName,
        portal_url: portalUrl,
        query_state: state,
        last_probed_at: new Date().toISOString(),
        probe_http_status: statusCode,
        company_detected_in_dropdown: hasCompanyMatch,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        ipo_id: ipoId,
        registrar_name: registrarName,
        portal_url: portalUrl,
        query_state: 'temporarily_unavailable',
        last_probed_at: new Date().toISOString(),
        probe_http_status: null,
        company_detected_in_dropdown: false,
        error_details: `Probe request failed: ${errMsg}`,
      };
    }
  }

  /**
   * Formats registrar state into a human-readable badge label.
   */
  public static formatStateLabel(state: RegistrarQueryState): {
    label: string;
    variant: 'default' | 'success' | 'warning' | 'danger' | 'info';
  } {
    switch (state) {
      case 'query_active':
        return { label: 'Allotment Query Active', variant: 'success' };
      case 'query_endpoint_detected':
        return { label: 'Issue Listed on Portal', variant: 'info' };
      case 'portal_reachable':
        return { label: 'Registrar Portal Online', variant: 'default' };
      case 'announced':
        return { label: 'Portal Announced', variant: 'warning' };
      case 'temporarily_unavailable':
        return { label: 'Temporarily Unavailable', variant: 'danger' };
      case 'blocked':
        return { label: 'Access Restricted', variant: 'danger' };
      default:
        return { label: 'Awaiting Registrar Link', variant: 'warning' };
    }
  }
}
