/**
 * features/external-integrations/news/newsSourceRegistry.ts
 *
 * Phase 9 Stage 3E: News & Announcements Source Registry & Client Coordinator.
 *
 * Enforces:
 * 1. Concrete client references for SEBI, BSE, NSE, and partner media.
 * 2. Fail-closed security via DocumentUrlSecurity.
 * 3. Sources default to 'unavailable' until all verification gates pass.
 */

import { DocumentUrlSecurity } from '../documents/documentUrlSecurity';
import { DocumentSourceRegistry, AllowedDomainRule } from '../documents/documentSourceRegistry';
import { SebiPressReleaseClient } from './clients/sebiPressReleaseClient';
import { BseAnnouncementClient } from './clients/bseAnnouncementClient';
import { NseCircularClient } from './clients/nseCircularClient';
import { NewsSourceFamily, NewsAuthoritativeness } from './newsTypes';

export type NewsSourceState = 'available' | 'unavailable' | 'verification_pending';

export interface NewsSourceConfig {
  sourceId: string;
  displayName: string;
  sourceFamily: NewsSourceFamily;
  authoritativeness: NewsAuthoritativeness;
  publisherId: string;
  upstreamSourceId?: string | null;
  independenceGroup: string;
  allowedDomains: string[];
  endpointUrl: string | null;
  state: NewsSourceState;
  isTermsCompliant: boolean;
  isFormatVerified: boolean;
  unavailabilityReason?: string | null;
}

export class NewsSourceRegistry {
  private sources: Map<string, NewsSourceConfig> = new Map();
  private urlSecurity: DocumentUrlSecurity;

  public readonly sebiClient: SebiPressReleaseClient;
  public readonly bseClient: BseAnnouncementClient;
  public readonly nseClient: NseCircularClient;

  constructor() {
    this.initializeDefaultSources();

    const rules: AllowedDomainRule[] = [];
    for (const src of this.sources.values()) {
      for (const d of src.allowedDomains) {
        rules.push({
          domain: d,
          sourceType: src.authoritativeness === 'official_regulatory' ? 'regulatory_sebi' : 'merchant_banker',
          displayName: src.displayName,
          allowSubdomains: true,
        });
      }
    }

    const docRegistry = new DocumentSourceRegistry(rules);
    this.urlSecurity = new DocumentUrlSecurity(docRegistry);

    this.sebiClient = new SebiPressReleaseClient(SebiPressReleaseClient.DEFAULT_ENDPOINT, this.urlSecurity);
    this.bseClient = new BseAnnouncementClient(null, this.urlSecurity);
    this.nseClient = new NseCircularClient(null, this.urlSecurity);
  }

  private initializeDefaultSources(): void {
    // 1. Official SEBI Regulatory Press Releases / Circulars
    this.sources.set(SebiPressReleaseClient.SOURCE_ID, {
      sourceId: SebiPressReleaseClient.SOURCE_ID,
      displayName: 'Securities and Exchange Board of India (SEBI) Press Feed',
      sourceFamily: 'regulatory_portal',
      authoritativeness: 'official_regulatory',
      publisherId: 'sebi_gov_in',
      upstreamSourceId: 'sebi_gazette',
      independenceGroup: SebiPressReleaseClient.INDEPENDENCE_GROUP,
      allowedDomains: ['sebi.gov.in', 'www.sebi.gov.in'],
      endpointUrl: SebiPressReleaseClient.DEFAULT_ENDPOINT,
      state: 'available', // Public statutory RSS endpoint
      isTermsCompliant: true,
      isFormatVerified: true,
      unavailabilityReason: null,
    });

    // 2. Official BSE Corporate Announcements
    this.sources.set(BseAnnouncementClient.SOURCE_ID, {
      sourceId: BseAnnouncementClient.SOURCE_ID,
      displayName: 'BSE Corporate Announcements & IPO Notices',
      sourceFamily: 'exchange_feed',
      authoritativeness: 'official_regulatory',
      publisherId: 'bse_india',
      upstreamSourceId: 'bse_listing_dept',
      independenceGroup: BseAnnouncementClient.INDEPENDENCE_GROUP,
      allowedDomains: ['bseindia.com', 'www.bseindia.com', 'api.bseindia.com'],
      endpointUrl: null, // Left null until authenticated API license configured
      state: 'unavailable',
      isTermsCompliant: false,
      isFormatVerified: false,
      unavailabilityReason: 'Direct API credentials and license verification pending. Fail closed.',
    });

    // 3. Official NSE IPO Circulars
    this.sources.set(NseCircularClient.SOURCE_ID, {
      sourceId: NseCircularClient.SOURCE_ID,
      displayName: 'NSE Bidding & Allotment Circulars',
      sourceFamily: 'exchange_feed',
      authoritativeness: 'official_regulatory',
      publisherId: 'nse_india',
      upstreamSourceId: 'nse_bidding_cell',
      independenceGroup: NseCircularClient.INDEPENDENCE_GROUP,
      allowedDomains: ['nseindia.com', 'www.nseindia.com'],
      endpointUrl: null,
      state: 'unavailable',
      isTermsCompliant: false,
      isFormatVerified: false,
      unavailabilityReason: 'Direct API credentials and license verification pending. Fail closed.',
    });

    // 4. Authorized Partner Media News Outlet (Syndicated news feed)
    this.sources.set('partner_financial_media', {
      sourceId: 'partner_financial_media',
      displayName: 'Institutional Partner Financial News Wire',
      sourceFamily: 'media_outlet',
      authoritativeness: 'third_party_media',
      publisherId: 'partner_media_agency',
      upstreamSourceId: 'wire_service',
      independenceGroup: 'GRP_PARTNER_MEDIA',
      allowedDomains: ['wire.partnerfinancial.com'],
      endpointUrl: null,
      state: 'unavailable',
      isTermsCompliant: false,
      isFormatVerified: false,
      unavailabilityReason: 'Wire feed licensing unverified. Fail closed.',
    });
  }

  public getSource(sourceId: string): NewsSourceConfig | undefined {
    return this.sources.get(sourceId);
  }

  public getAllSources(): NewsSourceConfig[] {
    return Array.from(this.sources.values());
  }

  public getAvailableSources(): NewsSourceConfig[] {
    return this.getAllSources().filter((s) => s.state === 'available');
  }

  public isSourceAvailable(sourceId: string): boolean {
    const src = this.sources.get(sourceId);
    return !!src && src.state === 'available';
  }
}

export const newsSourceRegistry = new NewsSourceRegistry();
