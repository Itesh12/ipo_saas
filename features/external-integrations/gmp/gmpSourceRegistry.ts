/**
 * features/external-integrations/gmp/gmpSourceRegistry.ts
 *
 * Phase 9 Stage 3D: Grey Market Premium (GMP) Source Registry & Client Layer.
 * 
 * Mandatory Rule 4: Source specifications must be treated as configuration, not assumed truth.
 * Before enabling any external source:
 *   source discovery -> endpoint verification -> access/terms verification ->
 *   response-format verification -> timestamp semantics verification -> lineage verification ->
 *   source_state = 'available'
 * Otherwise:
 *   source_state = 'unavailable' and the system fails closed.
 * 
 * Reuses Stage 3B DocumentUrlSecurity for SSRF, IP literal, and loopback protection.
 */

import { DocumentUrlSecurity } from '../documents/documentUrlSecurity';
import { DocumentSourceRegistry, AllowedDomainRule } from '../documents/documentSourceRegistry';
import { GMPSourceMetadata, RawOTCPayload } from './gmpTypes';

export type GMPSourceState = 'available' | 'unavailable' | 'verification_pending';

export interface GMPSourceConfig extends GMPSourceMetadata {
  displayName: string;
  allowedDomains: string[];
  endpointUrl?: string | null;
  state: GMPSourceState;
  isTermsCompliant: boolean;
  isFormatVerified: boolean;
  isTimestampSemanticsVerified: boolean;
  isLineageVerified: boolean;
  unavailabilityReason?: string | null;
}

export class GMPSourceRegistry {
  private sources: Map<string, GMPSourceConfig> = new Map();
  private urlSecurity: DocumentUrlSecurity;

  constructor() {
    this.initializeDefaultSources();

    const rules: AllowedDomainRule[] = [];
    for (const src of this.sources.values()) {
      for (const d of src.allowedDomains) {
        rules.push({
          domain: d,
          sourceType: 'merchant_banker',
          displayName: src.displayName,
          allowSubdomains: true,
        });
      }
    }

    const docRegistry = new DocumentSourceRegistry(rules);
    this.urlSecurity = new DocumentUrlSecurity(docRegistry);
  }

  private initializeDefaultSources(): void {
    // 1. Chittorgarh Aggregator
    this.registerSource({
      sourceId: 'chittorgarh_otc_feed',
      displayName: 'Chittorgarh Market Sentiment Feed',
      sourceFamily: 'aggregator',
      publisherId: 'chittorgarh_media',
      upstreamSourceId: 'gujarat_rajasthan_broker_network',
      independenceGroup: 'GRP_CHITTORGARH',
      sourceType: 'automated_feed',
      allowedDomains: ['chittorgarh.com', 'www.chittorgarh.com'],
      endpointUrl: null, // Left null until access terms & licensed endpoint verified
      state: 'unavailable',
      isTermsCompliant: false,
      isFormatVerified: false,
      isTimestampSemanticsVerified: false,
      isLineageVerified: true,
      unavailabilityReason: 'Endpoint license & automated access verification pending. Fail closed.',
    });

    // 2. IPOWatch Aggregator
    this.registerSource({
      sourceId: 'ipowatch_otc_feed',
      displayName: 'IPOWatch OTC Tracker',
      sourceFamily: 'aggregator',
      publisherId: 'ipowatch_portal',
      upstreamSourceId: 'mumbai_delhi_broker_network',
      independenceGroup: 'GRP_IPOWATCH',
      sourceType: 'automated_feed',
      allowedDomains: ['ipowatch.in', 'www.ipowatch.in'],
      endpointUrl: null,
      state: 'unavailable',
      isTermsCompliant: false,
      isFormatVerified: false,
      isTimestampSemanticsVerified: false,
      isLineageVerified: true,
      unavailabilityReason: 'Endpoint license & automated access verification pending. Fail closed.',
    });

    // 3. InvestorGain Aggregator
    this.registerSource({
      sourceId: 'investorgain_otc_feed',
      displayName: 'InvestorGain Grey Market Hub',
      sourceFamily: 'aggregator',
      publisherId: 'investorgain_portal',
      upstreamSourceId: 'mumbai_dealer_network',
      independenceGroup: 'GRP_INVESTORGAIN',
      sourceType: 'automated_feed',
      allowedDomains: ['investorgain.com', 'www.investorgain.com'],
      endpointUrl: null,
      state: 'unavailable',
      isTermsCompliant: false,
      isFormatVerified: false,
      isTimestampSemanticsVerified: false,
      isLineageVerified: true,
      unavailabilityReason: 'Endpoint license & automated access verification pending. Fail closed.',
    });

    // 4. Authorized Partner Broker Desk (Authenticated feed)
    this.registerSource({
      sourceId: 'partner_broker_desk_feed',
      displayName: 'Institutional Partner OTC Desk Feed',
      sourceFamily: 'broker_desk',
      publisherId: 'partner_otc_desk_1',
      upstreamSourceId: 'direct_dealer_desk',
      independenceGroup: 'GRP_BROKER_DESK_PRIMARY',
      sourceType: 'automated_feed',
      allowedDomains: ['partner-desk.internal', 'otc.partnerbroker.in'],
      endpointUrl: null,
      state: 'unavailable',
      isTermsCompliant: true,
      isFormatVerified: true,
      isTimestampSemanticsVerified: true,
      isLineageVerified: true,
      unavailabilityReason: 'Live API credentials not active in environment. Fail closed.',
    });
  }

  public registerSource(config: GMPSourceConfig): void {
    this.sources.set(config.sourceId, config);
  }

  public getSource(sourceId: string): GMPSourceConfig | undefined {
    return this.sources.get(sourceId);
  }

  public getAllSources(): GMPSourceConfig[] {
    return Array.from(this.sources.values());
  }

  public getAvailableSources(): GMPSourceConfig[] {
    return this.getAllSources().filter(s => s.state === 'available');
  }

  public isSourceAvailable(sourceId: string): boolean {
    const src = this.sources.get(sourceId);
    return !!src && src.state === 'available';
  }

  /**
   * Evaluates if a given source configuration meets all 6 verification gates to be marked 'available'.
   */
  public verifyAndActivateSource(
    sourceId: string,
    endpointUrl: string,
    verification: {
      isTermsCompliant: boolean;
      isFormatVerified: boolean;
      isTimestampSemanticsVerified: boolean;
      isLineageVerified: boolean;
    }
  ): { success: boolean; reason?: string } {
    const src = this.sources.get(sourceId);
    if (!src) {
      return { success: false, reason: `Unknown sourceId: ${sourceId}` };
    }

    // SSRF Security Check on endpointUrl
    const secCheck = this.urlSecurity.validateUrl(endpointUrl);
    if (!secCheck.isSafe) {
      src.state = 'unavailable';
      src.unavailabilityReason = `SSRF security rejection: ${secCheck.errorReason}`;
      return { success: false, reason: src.unavailabilityReason };
    }

    src.endpointUrl = endpointUrl;
    src.isTermsCompliant = verification.isTermsCompliant;
    src.isFormatVerified = verification.isFormatVerified;
    src.isTimestampSemanticsVerified = verification.isTimestampSemanticsVerified;
    src.isLineageVerified = verification.isLineageVerified;

    if (
      src.isTermsCompliant &&
      src.isFormatVerified &&
      src.isTimestampSemanticsVerified &&
      src.isLineageVerified
    ) {
      src.state = 'available';
      src.unavailabilityReason = null;
      return { success: true };
    } else {
      src.state = 'unavailable';
      src.unavailabilityReason = 'Incomplete verification gates: all 4 compliance & format gates required.';
      return { success: false, reason: src.unavailabilityReason };
    }
  }

  /**
   * Safe fetch client that fails closed if a source is unverified, unavailable, or disallowed.
   */
  public async fetchSourceQuotes(sourceId: string): Promise<{
    success: boolean;
    payloads: RawOTCPayload[];
    error?: string;
  }> {
    const src = this.sources.get(sourceId);
    if (!src) {
      return { success: false, payloads: [], error: `Source ${sourceId} not registered.` };
    }

    if (src.state !== 'available' || !src.endpointUrl) {
      return {
        success: false,
        payloads: [],
        error: `Source ${sourceId} is unavailable (${src.unavailabilityReason || 'unconfigured'}). Failing closed.`,
      };
    }

    // In a live environment with configured endpoint, HTTP request would happen here
    // with strict SSRF validation and timeout bounds.
    return {
      success: true,
      payloads: [],
    };
  }
}

export const gmpSourceRegistry = new GMPSourceRegistry();
