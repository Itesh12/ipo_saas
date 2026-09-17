/**
 * IPO Tiered Cache & Freshness Management Service
 *
 * Implements the Phase E production caching architecture:
 * 1. Tiered TTLs: Static research (24h) vs Dynamic subscription/GMP (60s).
 * 2. Granular Invalidation: Tag-based invalidation that NEVER purges unaffected IPOs or tiers.
 * 3. Cache Contamination Immunity: Strictly isolates keys and memory spaces by IPO ID.
 * 4. Freshness Contracts: Explicit testable contracts ensuring dynamic data does not leak into static bundles.
 */

export type CacheTier = "STATIC" | "DAILY" | "DYNAMIC" | "EVENT_DRIVEN" | "POLLING";

export interface FreshnessContract {
  ttlSeconds: number;
  tier: CacheTier;
  invalidationMode: string;
  description: string;
}

export const IPO_FRESHNESS_CONTRACTS: Record<string, FreshnessContract> = {
  PROSPECTUS_RESEARCH: {
    ttlSeconds: 86400, // 24 hours
    tier: "STATIC",
    invalidationMode: "EVENT_DRIVEN_ON_FILING",
    description: "Multi-year audited financials, business profiles, and RHP prospectus disclosures.",
  },
  STATIC_COMPANY_DATA: {
    ttlSeconds: 86400, // 24 hours
    tier: "STATIC",
    invalidationMode: "EVENT_DRIVEN_ON_MUTATION",
    description: "Core IPO metadata, dates, exchange, and issue structure.",
  },
  DAILY_PEER_MARKET: {
    ttlSeconds: 86400, // 24 hours
    tier: "DAILY",
    invalidationMode: "DAILY_SCHEDULED",
    description: "Listed peer valuations, comparable P/E, and sector multiples.",
  },
  SUBSCRIPTION: {
    ttlSeconds: 60, // 60 seconds during bidding
    tier: "DYNAMIC",
    invalidationMode: "BIDDING_BURST_60S",
    description: "Official exchange cumulative bidding quotas (QIB, NII, Retail, Total).",
  },
  GMP: {
    ttlSeconds: 60, // 60 seconds
    tier: "DYNAMIC",
    invalidationMode: "TICK_OBSERVATION_60S",
    description: "Unofficial grey market intelligence and sentiment quotes.",
  },
  LIFECYCLE: {
    ttlSeconds: 300, // 5 minutes or event-driven
    tier: "EVENT_DRIVEN",
    invalidationMode: "STATE_MACHINE_TRANSITION",
    description: "Derived IST lifecycle transitions and milestone progression.",
  },
  ALLOTMENT: {
    ttlSeconds: 300, // 5 minutes or webhook-driven
    tier: "EVENT_DRIVEN",
    invalidationMode: "REGISTRAR_PORTAL_PROBE",
    description: "Registrar portal query states and allotment probability facts.",
  },
  REGULATORY_NEWS: {
    ttlSeconds: 900, // 15 minutes
    tier: "POLLING",
    invalidationMode: "DISCLOSURE_POLLING_15M",
    description: "Exchange announcements and curated market news disclosures.",
  },
} as const;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  tags: string[];
  cachedAt: number;
}

export class IPOTieredCacheService {
  private static cache = new Map<string, CacheEntry<unknown>>();
  private static tagIndex = new Map<string, Set<string>>(); // tag -> Set<cacheKey>

  private static stats = {
    hits: 0,
    misses: 0,
    invalidations: 0,
  };

  /**
   * Generates isolated cache tags for an IPO and sub-domain
   */
  public static getTags(ipoId: string) {
    return {
      research: `ipo:research:${ipoId}`,
      company: `ipo:company:${ipoId}`,
      peers: `ipo:peers:${ipoId}`,
      subscription: `ipo:subscription:${ipoId}`,
      gmp: `ipo:gmp:${ipoId}`,
      lifecycle: `ipo:lifecycle:${ipoId}`,
      allotment: `ipo:allotment:${ipoId}`,
      news: `ipo:news:${ipoId}`,
    };
  }

  /**
   * Fetches data or sets it in cache with explicit tags and TTL.
   */
  public static async getOrSet<T>(
    key: string,
    tags: string[],
    ttlSeconds: number,
    fetcher: () => Promise<T>
  ): Promise<T> {
    const now = Date.now();
    const existing = this.cache.get(key) as CacheEntry<T> | undefined;

    if (existing && existing.expiresAt > now) {
      this.stats.hits++;
      return existing.data;
    }

    this.stats.misses++;
    const data = await fetcher();

    const entry: CacheEntry<T> = {
      data,
      expiresAt: now + ttlSeconds * 1000,
      tags,
      cachedAt: now,
    };

    this.cache.set(key, entry as CacheEntry<unknown>);

    // Update tag index
    for (const tag of tags) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)!.add(key);
    }

    return data;
  }

  /**
   * Invalidates a single tag, purging ONLY the keys bound to that tag.
   * Crucial: Leaves all other IPOs and tiers completely untouched.
   */
  public static invalidateTag(tag: string): number {
    const keys = this.tagIndex.get(tag);
    if (!keys || keys.size === 0) return 0;

    let purgedCount = 0;
    for (const key of keys) {
      if (this.cache.delete(key)) {
        purgedCount++;
      }
    }

    this.tagIndex.delete(tag);
    this.stats.invalidations += purgedCount;
    return purgedCount;
  }

  /**
   * Granular Invalidation Helpers
   */
  public static revalidateResearch(ipoId: string): number {
    return this.invalidateTag(this.getTags(ipoId).research);
  }

  public static revalidateGMP(ipoId: string): number {
    return this.invalidateTag(this.getTags(ipoId).gmp);
  }

  public static revalidateSubscription(ipoId: string): number {
    return this.invalidateTag(this.getTags(ipoId).subscription);
  }

  public static revalidateLifecycle(ipoId: string): number {
    return this.invalidateTag(this.getTags(ipoId).lifecycle);
  }

  public static revalidateAllotment(ipoId: string): number {
    return this.invalidateTag(this.getTags(ipoId).allotment);
  }

  /**
   * Inspection & Telemetry
   */
  public static getStats() {
    return {
      ...this.stats,
      activeEntries: this.cache.size,
      activeTags: this.tagIndex.size,
    };
  }

  public static clear(): void {
    this.cache.clear();
    this.tagIndex.clear();
    this.stats = { hits: 0, misses: 0, invalidations: 0 };
  }
}
