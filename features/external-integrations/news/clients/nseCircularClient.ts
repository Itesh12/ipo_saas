/**
 * features/external-integrations/news/clients/nseCircularClient.ts
 *
 * Phase 9 Stage 3E: NSE IPO Bidding Notices & Circulars Client.
 *
 * Enforces:
 * 1. Concrete client with explicit NSE exchange circular endpoints.
 * 2. SSRF validation via DocumentUrlSecurity.
 * 3. Fails closed (source_state = 'unavailable') if endpoint unverified.
 * 4. Distinct authoritativeness: 'official_regulatory', independenceGroup: 'GRP_EXCHANGE_NSE'.
 */

import { DocumentUrlSecurity } from '../../documents/documentUrlSecurity';
import { RawNewsPayload } from '../newsTypes';

export interface NseFetchResult {
  success: boolean;
  sourceId: string;
  items: RawNewsPayload[];
  error?: string;
  sourceState: 'available' | 'unavailable';
  itemCount: number;
}

export class NseCircularClient {
  public static readonly SOURCE_ID = 'nse_bidding_circulars';
  public static readonly DEFAULT_ENDPOINT = 'https://www.nseindia.com/api/circulars';
  public static readonly INDEPENDENCE_GROUP = 'GRP_EXCHANGE_NSE';

  private endpointUrl: string | null;
  private urlSecurity: DocumentUrlSecurity;

  constructor(endpointUrl: string | null = null, urlSecurity?: DocumentUrlSecurity) {
    this.endpointUrl = endpointUrl;
    this.urlSecurity = urlSecurity || new DocumentUrlSecurity();
  }

  public async fetchLiveAnnouncements(customFetch?: typeof fetch): Promise<NseFetchResult> {
    if (!this.endpointUrl) {
      return {
        success: false,
        sourceId: NseCircularClient.SOURCE_ID,
        items: [],
        error: 'NSE circular endpoint is unconfigured. Failing closed.',
        sourceState: 'unavailable',
        itemCount: 0,
      };
    }

    const secCheck = this.urlSecurity.validateUrl(this.endpointUrl);
    if (!secCheck.isSafe) {
      return {
        success: false,
        sourceId: NseCircularClient.SOURCE_ID,
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
          sourceId: NseCircularClient.SOURCE_ID,
          items: [],
          error: `HTTP ${response.status} ${response.statusText} from NSE`,
          sourceState: 'unavailable',
          itemCount: 0,
        };
      }

      const json = await response.json();
      const rawList = Array.isArray(json) ? json : json.data || [];

      const items: RawNewsPayload[] = rawList.map((item: Record<string, unknown>) => ({
        sourceId: NseCircularClient.SOURCE_ID,
        sourceFamily: 'exchange_feed',
        publisherId: 'nse_india',
        upstreamSourceId: item.circNumber ? `nse_circ_${String(item.circNumber)}` : null,
        independenceGroup: NseCircularClient.INDEPENDENCE_GROUP,
        headline: (item.circSubject as string) || (item.subject as string) || 'NSE Exchange Circular',
        rawContent: (item.circDetails as string) || (item.details as string) || null,
        sourceUrl: (item.circFile as string) || (item.fileUrl as string) || 'https://www.nseindia.com',
        publishedAt: (item.circDate as string) || new Date().toISOString(),
        authoritativeness: 'official_regulatory',
        categoryHint: 'regulatory_announcement',
        isPriceSensitive: false,
        identifierHints: {
          symbol: item.symbol as string | undefined,
          companyName: item.companyName as string | undefined,
        },
      }));

      return {
        success: true,
        sourceId: NseCircularClient.SOURCE_ID,
        items,
        sourceState: 'available',
        itemCount: items.length,
      };
    } catch (err: unknown) {
      return {
        success: false,
        sourceId: NseCircularClient.SOURCE_ID,
        items: [],
        error: `Acquisition failed: ${err instanceof Error ? err.message : String(err)}`,
        sourceState: 'unavailable',
        itemCount: 0,
      };
    }
  }
}
