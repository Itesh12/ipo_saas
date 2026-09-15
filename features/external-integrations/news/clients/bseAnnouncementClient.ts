/**
 * features/external-integrations/news/clients/bseAnnouncementClient.ts
 *
 * Phase 9 Stage 3E: BSE Corporate Announcements & Public Notices Client.
 *
 * Enforces:
 * 1. Concrete client with explicit BSE exchange endpoints.
 * 2. SSRF validation via DocumentUrlSecurity.
 * 3. Fails closed (source_state = 'unavailable') if endpoint unverified.
 * 4. Distinct authoritativeness: 'official_regulatory', independenceGroup: 'GRP_EXCHANGE_BSE'.
 */

import { DocumentUrlSecurity } from '../../documents/documentUrlSecurity';
import { RawNewsPayload } from '../newsTypes';

export interface BseFetchResult {
  success: boolean;
  sourceId: string;
  items: RawNewsPayload[];
  error?: string;
  sourceState: 'available' | 'unavailable';
  itemCount: number;
}

export class BseAnnouncementClient {
  public static readonly SOURCE_ID = 'bse_corporate_announcements';
  public static readonly DEFAULT_ENDPOINT = 'https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryData/w';
  public static readonly INDEPENDENCE_GROUP = 'GRP_EXCHANGE_BSE';

  private endpointUrl: string | null;
  private urlSecurity: DocumentUrlSecurity;

  constructor(endpointUrl: string | null = null, urlSecurity?: DocumentUrlSecurity) {
    this.endpointUrl = endpointUrl;
    this.urlSecurity = urlSecurity || new DocumentUrlSecurity();
  }

  public async fetchLiveAnnouncements(customFetch?: typeof fetch): Promise<BseFetchResult> {
    if (!this.endpointUrl) {
      return {
        success: false,
        sourceId: BseAnnouncementClient.SOURCE_ID,
        items: [],
        error: 'BSE announcement endpoint is unconfigured. Failing closed.',
        sourceState: 'unavailable',
        itemCount: 0,
      };
    }

    const secCheck = this.urlSecurity.validateUrl(this.endpointUrl);
    if (!secCheck.isSafe) {
      return {
        success: false,
        sourceId: BseAnnouncementClient.SOURCE_ID,
        items: [],
        error: `SSRF Rejection: ${secCheck.errorReason}`,
        sourceState: 'unavailable',
        itemCount: 0,
      };
    }

    const fetchFn = customFetch || fetch;

    try {
      const response = await fetchFn(this.endpointUrl, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'IPO-OS-Intelligence-Engine/1.0',
        },
      });

      if (!response.ok) {
        return {
          success: false,
          sourceId: BseAnnouncementClient.SOURCE_ID,
          items: [],
          error: `HTTP ${response.status} ${response.statusText} from BSE`,
          sourceState: 'unavailable',
          itemCount: 0,
        };
      }

      const json = await response.json();
      const rawList = Array.isArray(json) ? json : json.Table || [];

      const items: RawNewsPayload[] = rawList.map((item: Record<string, unknown>) => ({
        sourceId: BseAnnouncementClient.SOURCE_ID,
        sourceFamily: 'exchange_feed',
        publisherId: 'bse_india',
        upstreamSourceId: item.SCRIP_CD ? `bse_scrip_${String(item.SCRIP_CD)}` : null,
        independenceGroup: BseAnnouncementClient.INDEPENDENCE_GROUP,
        headline: (item.NEWSSUB as string) || (item.HEADLINE as string) || 'Corporate Announcement',
        rawContent: (item.MORE as string) || (item.DESCRIPTION as string) || null,
        sourceUrl: (item.ATTACHMENT as string) || (item.URL as string) || `https://www.bseindia.com/xml-data/corpfiling/AttachLive/${(item.ATTACHMENT as string) || ''}`,
        publishedAt: (item.NEWS_DT as string) || new Date().toISOString(),
        authoritativeness: 'official_regulatory',
        categoryHint: 'regulatory_announcement',
        isPriceSensitive: !!item.PRICE_SENSITIVE,
        identifierHints: {
          symbol: item.SCRIP_CD ? String(item.SCRIP_CD) : undefined,
          companyName: (item.SLONGNAME as string) || (item.COMPANY_NAME as string),
        },
      }));

      return {
        success: true,
        sourceId: BseAnnouncementClient.SOURCE_ID,
        items,
        sourceState: 'available',
        itemCount: items.length,
      };
    } catch (err: unknown) {
      return {
        success: false,
        sourceId: BseAnnouncementClient.SOURCE_ID,
        items: [],
        error: `Acquisition failed: ${err instanceof Error ? err.message : String(err)}`,
        sourceState: 'unavailable',
        itemCount: 0,
      };
    }
  }
}
