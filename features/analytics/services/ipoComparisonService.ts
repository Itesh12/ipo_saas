/**
 * features/analytics/services/ipoComparisonService.ts
 *
 * Phase 6: Head-to-Head IPO Comparison Engine
 * Contrasts 2 to 4 IPOs across 6 structured modules,
 * strictly segregating official subscription metrics from unofficial grey market sentiment.
 */

import { ComparisonMatrix, ComparisonModuleItem } from '../types/analytics.types';
import { getIPOResearchBundle } from '@/features/ipo/services/ipoResearchService';

export class IpoComparisonService {
  /**
   * Generates a side-by-side comparison matrix for up to 4 IPOs.
   */
  static async buildComparisonMatrix(slugs: string[]): Promise<ComparisonMatrix> {
    const limitedSlugs = slugs.slice(0, 4);

    // Fetch research bundles concurrently
    const bundles = await Promise.all(
      limitedSlugs.map(async (slug) => {
        try {
          return await getIPOResearchBundle(slug);
        } catch {
          return null;
        }
      })
    );

    const validBundles = bundles.filter((b): b is NonNullable<typeof b> => b !== null);

    const ipos = validBundles.map((b) => ({
      id: b.ipo.id,
      slug: b.ipo.slug,
      companyName: b.ipo.company_name,
      symbol: b.ipo.symbol,
      status: b.ipo.status,
      category: b.ipo.category,
      score: b.score ? Number(b.score.overall_score) : null,
    }));

    // Helper to extract values per IPO slug
    const extractMap = (fn: (b: (typeof validBundles)[number]) => string | number | null) => {
      const map: Record<string, string | number | null> = {};
      for (const b of validBundles) {
        map[b.ipo.slug] = fn(b);
      }
      return map;
    };

    // 1. Issue Profile Module
    const issueProfile: ComparisonModuleItem[] = [
      {
        key: 'category',
        label: 'Category',
        values: extractMap((b) => b.ipo.category.toUpperCase()),
      },
      {
        key: 'price_band',
        label: 'Price Band',
        unit: '₹',
        values: extractMap((b) =>
          b.ipo.price_band_low && b.ipo.price_band_high
            ? `₹${b.ipo.price_band_low} – ₹${b.ipo.price_band_high}`
            : b.ipo.price_band_high
            ? `₹${b.ipo.price_band_high}`
            : null
        ),
      },
      {
        key: 'lot_size',
        label: 'Lot Size',
        unit: 'Shares',
        values: extractMap((b) => b.ipo.lot_size),
      },
      {
        key: 'min_investment',
        label: 'Min Lot Commitment',
        unit: '₹',
        values: extractMap((b) => (b.ipo.min_investment ? Number(b.ipo.min_investment) : null)),
      },
      {
        key: 'issue_size_cr',
        label: 'Total Issue Size',
        unit: '₹ Cr',
        values: extractMap((b) => (b.ipo.issue_size_cr ? Number(b.ipo.issue_size_cr) : null)),
      },
      {
        key: 'fresh_vs_ofs',
        label: 'Fresh Issue / OFS',
        unit: '₹ Cr',
        values: extractMap((b) => {
          const fresh = b.ipo.fresh_issue_cr ? `₹${b.ipo.fresh_issue_cr} Cr` : '—';
          const ofs = b.ipo.ofs_cr ? `₹${b.ipo.ofs_cr} Cr` : '—';
          return `${fresh} / ${ofs}`;
        }),
      },
    ];

    // 2. Valuations Module
    const valuations: ComparisonModuleItem[] = [
      {
        key: 'pe_ratio',
        label: 'P/E Multiple (Upper Band)',
        unit: 'x',
        values: extractMap((b) => (b.valuation?.pe_ratio_high ? Number(b.valuation.pe_ratio_high) : null)),
      },
      {
        key: 'industry_pe',
        label: 'Industry Median P/E',
        unit: 'x',
        values: extractMap((b) => (b.valuation?.industry_pe_median ? Number(b.valuation.industry_pe_median) : null)),
      },
      {
        key: 'pb_ratio',
        label: 'P/B Multiple',
        unit: 'x',
        values: extractMap((b) => (b.valuation?.pb_ratio ? Number(b.valuation.pb_ratio) : null)),
      },
      {
        key: 'ev_ebitda',
        label: 'EV / EBITDA',
        unit: 'x',
        values: extractMap((b) => (b.valuation?.ev_ebitda ? Number(b.valuation.ev_ebitda) : null)),
      },
      {
        key: 'post_market_cap',
        label: 'Post-Issue Market Cap',
        unit: '₹ Cr',
        values: extractMap((b) => (b.valuation?.market_cap_cr ? Number(b.valuation.market_cap_cr) : null)),
      },
    ];

    // 3. Financial Trajectory Module
    const financialTrajectory: ComparisonModuleItem[] = [
      {
        key: 'revenue_cr',
        label: 'Latest Revenue',
        unit: '₹ Cr',
        values: extractMap((b) => {
          const latest = b.financials[b.financials.length - 1];
          return latest?.revenue_cr ? Number(latest.revenue_cr) : null;
        }),
      },
      {
        key: 'revenue_growth',
        label: 'Revenue Growth',
        unit: '%',
        values: extractMap((b) => {
          const latest = b.financials[b.financials.length - 1];
          return latest?.revenue_growth_pct ? Number(latest.revenue_growth_pct) : null;
        }),
      },
      {
        key: 'pat_margin',
        label: 'PAT Margin',
        unit: '%',
        values: extractMap((b) => {
          const latest = b.financials[b.financials.length - 1];
          return latest?.pat_margin_pct ? Number(latest.pat_margin_pct) : null;
        }),
      },
      {
        key: 'roe',
        label: 'Return on Equity (ROE)',
        unit: '%',
        values: extractMap((b) => {
          const latest = b.financials[b.financials.length - 1];
          return latest?.roe_pct ? Number(latest.roe_pct) : null;
        }),
      },
      {
        key: 'debt_to_equity',
        label: 'Debt / Equity Ratio',
        unit: 'x',
        values: extractMap((b) => {
          const latest = b.financials[b.financials.length - 1];
          if (!latest || !latest.total_debt_cr || !latest.net_worth_cr || latest.net_worth_cr <= 0) return null;
          return Number((latest.total_debt_cr / latest.net_worth_cr).toFixed(2));
        }),
      },
    ];

    // 4. Peer Comparison Module
    const peerComparison: ComparisonModuleItem[] = [
      {
        key: 'primary_peer',
        label: 'Key Listed Peer',
        values: extractMap((b) => (b.peers.length > 0 ? b.peers[0].peer_company_name : null)),
      },
      {
        key: 'peer_pe',
        label: 'Key Peer P/E',
        unit: 'x',
        values: extractMap((b) => (b.peers.length > 0 && b.peers[0].pe_ratio ? Number(b.peers[0].pe_ratio) : null)),
      },
    ];

    // 5. Official Subscription & Bidding Demand (Statutory / Exchange Feed)
    const officialSubscription: ComparisonModuleItem[] = [
      {
        key: 'overall_sub',
        label: 'Overall Subscription Multiple',
        unit: 'x',
        values: extractMap((b) => (b.latestSubscription ? Number(b.latestSubscription.overall_x) : null)),
      },
      {
        key: 'qib_sub',
        label: 'QIB Subscription',
        unit: 'x',
        values: extractMap((b) => (b.latestSubscription?.qib_x ? Number(b.latestSubscription.qib_x) : null)),
      },
      {
        key: 'retail_sub',
        label: 'Retail Subscription',
        unit: 'x',
        values: extractMap((b) => (b.latestSubscription?.retail_x ? Number(b.latestSubscription.retail_x) : null)),
      },
    ];

    // 6. Unofficial Grey Market Sentiment (Explicitly Marked Unofficial)
    const unofficialSentiment: ComparisonModuleItem[] = [
      {
        key: 'gmp_premium',
        label: 'Grey Market Premium (Unofficial)',
        unit: '₹',
        isUnofficial: true,
        values: extractMap((b) => (b.latestGmp ? Number(b.latestGmp.gmp_value) : null)),
      },
      {
        key: 'est_listing_gain',
        label: 'Estimated Listing Gain (Unofficial)',
        unit: '%',
        isUnofficial: true,
        values: extractMap((b) => (b.latestGmp?.estimated_listing_gain_pct ? Number(b.latestGmp.estimated_listing_gain_pct) : null)),
      },
    ];

    // 7. Governance & Risk
    const governanceAndRisk: ComparisonModuleItem[] = [
      {
        key: 'overall_score',
        label: 'Explainable IPO Score',
        unit: '/ 100',
        values: extractMap((b) => (b.score ? Number(b.score.overall_score) : null)),
      },
      {
        key: 'promoter_holding_post',
        label: 'Promoter Holding Post-Issue',
        unit: '%',
        values: extractMap((b) => {
          const main = b.promoters[0];
          return main?.holding_post_pct ? Number(main.holding_post_pct) : null;
        }),
      },
      {
        key: 'high_risks_count',
        label: 'High Severity Risk Factors',
        unit: 'Flags',
        values: extractMap((b) => b.risks.filter((r) => r.severity === 'high').length),
      },
    ];

    return {
      ipos,
      modules: {
        issueProfile,
        valuations,
        financialTrajectory,
        peerComparison,
        officialSubscription,
        unofficialSentiment,
        governanceAndRisk,
      },
    };
  }
}
