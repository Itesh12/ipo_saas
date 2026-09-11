import React from "react";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getIPOResearchBundle } from "@/features/ipo/services/ipoResearchService";
import { buildIPOTimeline } from "@/features/ipo/services/ipoLifecycle";
import { calculateIPOScore } from "@/features/ipo/services/ipoScoreEngine";
import { IPOStatusBadge } from "@/components/ipo/IPOStatusBadge";
import { IPOTimeline } from "@/components/ipo/IPOTimeline";
import { IPOQuickFacts } from "@/components/ipo/IPOQuickFacts";
import { IPONavSticky } from "@/components/ipo/research/IPONavSticky";
import { IPOFinancialsTable } from "@/components/ipo/research/IPOFinancialsTable";
import { IPOValuationPeers } from "@/components/ipo/research/IPOValuationPeers";
import { IPOGMPCard } from "@/components/ipo/research/IPOGMPCard";
import { IPOSubscriptionCard } from "@/components/ipo/research/IPOSubscriptionCard";
import { IPOScoreCard } from "@/components/ipo/research/IPOScoreCard";
import { IPOStrengthsRisks } from "@/components/ipo/research/IPOStrengthsRisks";
import { IPOPromotersStructure } from "@/components/ipo/research/IPOPromotersStructure";
import { IPOBusinessProfile } from "@/components/ipo/research/IPOBusinessProfile";
import { IPODocumentsNews } from "@/components/ipo/research/IPODocumentsNews";
import { WatchlistButton } from "@/components/application/WatchlistButton";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatINR, formatCrores } from "@/lib/utils";
import {
  Building2,
  Calendar,
  ArrowLeft,
  FileCheck2,
  TrendingUp,
  Coins,
  FileText,
} from "lucide-react";

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const bundle = await getIPOResearchBundle(slug);

  if (!bundle || !bundle.ipo) {
    return {
      title: "IPO Not Found | IPO OS",
      description: "The requested IPO details could not be located.",
    };
  }

  const { ipo } = bundle;
  const priceStr =
    ipo.price_band_low && ipo.price_band_high
      ? `₹${ipo.price_band_low} - ₹${ipo.price_band_high}`
      : "TBA";

  return {
    title: `${ipo.company_name} IPO Research — Financials, GMP, Valuation & Score`,
    description: `Institutional-grade IPO research for ${ipo.company_name} (${ipo.symbol || "IPO"}). Price: ${priceStr}, Issue Size: ${formatCrores(ipo.issue_size_cr)}, Financials, Live GMP, and Subscription multiples.`,
    openGraph: {
      title: `${ipo.company_name} IPO Research & Intelligence | IPO OS`,
      description: `Complete research report for ${ipo.company_name} IPO covering financials, peer valuations, grey market trends, and quantitative score.`,
      type: "website",
    },
  };
}

export default async function IPODetailPage({ params }: PageProps) {
  const { slug } = await params;
  const bundle = await getIPOResearchBundle(slug);

  if (!bundle || !bundle.ipo) {
    notFound();
  }

  const {
    ipo,
    businessProfile,
    financials,
    valuation,
    peers,
    promoters,
    strengths,
    risks,
    latestGmp,
    gmpHistory,
    latestSubscription,
    subscriptionSnapshots,
    score,
    documents,
    news,
  } = bundle;

  const milestones = buildIPOTimeline(ipo);
  const computedScoreBreakdown = calculateIPOScore({
    ipo,
    financials,
    valuation,
    promoters,
    latestGmp,
    latestSubscription,
    risks,
  });

  const categoryLabels: Record<string, string> = {
    mainboard: "Mainboard IPO",
    sme_bse: "BSE SME Issue",
    sme_nse: "NSE SME (Emerge)",
  };

  const formattedPriceBand =
    ipo.price_band_low && ipo.price_band_high
      ? ipo.price_band_low === ipo.price_band_high
        ? `₹${ipo.price_band_high}`
        : `₹${ipo.price_band_low} – ₹${ipo.price_band_high}`
      : "TBA";

  return (
    <div className="min-h-screen pb-16 space-y-6">
      {/* Top Header & Breadcrumb */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        <div className="flex items-center justify-between">
          <Link
            href="/ipos"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to IPO Directory</span>
          </Link>

          <div className="flex items-center gap-2">
            <Link href="/dashboard">
              <Button size="sm" variant="secondary" leftIcon={<FileCheck2 className="w-3.5 h-3.5 text-[var(--brand-primary)]" />}>
                Track in Portfolio
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Hero Card */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Card className="p-6 md:p-8 bg-gradient-to-b from-[var(--bg-surface-elevated)]/40 to-[var(--bg-surface)] border-[var(--border-subtle)]">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            {/* Company Info */}
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-2xl bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] flex items-center justify-center font-bold text-xl text-[var(--brand-primary)] shrink-0 shadow-xs">
                {ipo.company_logo ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={ipo.company_logo} alt={ipo.company_name} className="w-12 h-12 object-contain" />
                ) : (
                  <Building2 className="w-8 h-8 text-[var(--brand-primary)]" />
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl md:text-2xl font-bold text-[var(--text-primary)] tracking-tight">
                    {ipo.company_name}
                  </h1>
                  {ipo.symbol && (
                    <Badge variant="secondary" size="sm">
                      {ipo.symbol}
                    </Badge>
                  )}
                  <Badge variant="default" size="sm">
                    {categoryLabels[ipo.category] || ipo.category}
                  </Badge>
                  <IPOStatusBadge status={ipo.status} />
                </div>
                <p className="text-xs text-[var(--text-secondary)]">
                  Exchange: <strong className="text-[var(--text-primary)]">{ipo.exchange || "NSE / BSE"}</strong> •
                  Registrar: <strong className="text-[var(--text-primary)]">{ipo.registrar_name || "TBA"}</strong>
                </p>

                <div className="flex items-center gap-2 pt-2">
                  <Link href={`/ipos/${slug}/apply`}>
                    <Button variant="primary" size="sm">
                      Apply for IPO
                    </Button>
                  </Link>
                  <WatchlistButton ipoId={ipo.id} />
                </div>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full md:w-auto">
              <div className="p-3 rounded-xl bg-[var(--bg-surface-elevated)]/60 border border-[var(--border-subtle)] min-w-[120px]">
                <span className="text-[10px] text-[var(--text-muted)] font-medium">Price Band</span>
                <p className="text-sm font-bold text-[var(--text-primary)] mt-0.5">{formattedPriceBand}</p>
                <span className="text-[10px] text-[var(--text-secondary)]">Per Share</span>
              </div>

              <div className="p-3 rounded-xl bg-[var(--bg-surface-elevated)]/60 border border-[var(--border-subtle)] min-w-[120px]">
                <span className="text-[10px] text-[var(--text-muted)] font-medium">Lot Size</span>
                <p className="text-sm font-bold text-[var(--text-primary)] mt-0.5">{ipo.lot_size} Shares</p>
                <span className="text-[10px] text-[var(--text-secondary)]">1 Retail Lot</span>
              </div>

              <div className="p-3 rounded-xl bg-[var(--bg-surface-elevated)]/60 border border-[var(--border-subtle)] min-w-[120px]">
                <span className="text-[10px] text-[var(--text-muted)] font-medium">Min Investment</span>
                <p className="text-sm font-bold text-[var(--brand-primary)] mt-0.5">
                  {formatINR(ipo.min_investment)}
                </p>
                <span className="text-[10px] text-[var(--text-secondary)]">1 Lot @ Upper</span>
              </div>

              <div className="p-3 rounded-xl bg-[var(--bg-surface-elevated)]/60 border border-[var(--border-subtle)] min-w-[120px]">
                <span className="text-[10px] text-[var(--text-muted)] font-medium">Issue Size</span>
                <p className="text-sm font-bold text-[var(--status-success)] mt-0.5">
                  {formatCrores(ipo.issue_size_cr)}
                </p>
                <span className="text-[10px] text-[var(--text-secondary)]">Total Capital</span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Sticky Section Navigation */}
      <IPONavSticky />

      {/* Main Research Content Sections */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12 pt-2">
        {/* Section 1: Overview & Quick Facts */}
        <section id="overview" className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-[var(--border-subtle)]">
            <Coins className="w-4 h-4 text-[var(--brand-primary)]" />
            <h2 className="text-base font-bold text-[var(--text-primary)]">Issue Summary & Quick Facts</h2>
          </div>
          <IPOQuickFacts ipo={ipo} />
        </section>

        {/* Section 2: Milestone Timeline */}
        <section id="timeline" className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-[var(--border-subtle)]">
            <Calendar className="w-4 h-4 text-[var(--brand-primary)]" />
            <h2 className="text-base font-bold text-[var(--text-primary)]">Issue Timetable & Important Dates</h2>
          </div>
          <IPOTimeline milestones={milestones} />
        </section>

        {/* Section 3: Business Model & Operations */}
        <section id="business" className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-[var(--border-subtle)]">
            <Building2 className="w-4 h-4 text-[var(--brand-primary)]" />
            <h2 className="text-base font-bold text-[var(--text-primary)]">Business & Company Profile</h2>
          </div>
          <IPOBusinessProfile ipo={ipo} profile={businessProfile} />
        </section>

        {/* Section 4: Multi-Year Financials */}
        <section id="financials" className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-[var(--border-subtle)]">
            <TrendingUp className="w-4 h-4 text-[var(--brand-primary)]" />
            <h2 className="text-base font-bold text-[var(--text-primary)]">Multi-Year Financial Statement Analysis</h2>
          </div>
          <IPOFinancialsTable financials={financials} />
        </section>

        {/* Section 5: Valuation & Peer Comparisons */}
        <section id="valuation" className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-[var(--border-subtle)]">
            <TrendingUp className="w-4 h-4 text-[var(--brand-primary)]" />
            <h2 className="text-base font-bold text-[var(--text-primary)]">Valuation Multiples & Listed Peer Comparison</h2>
          </div>
          <IPOValuationPeers ipo={ipo} valuation={valuation} peers={peers} />
        </section>

        {/* Section 6: Structure & Promoters */}
        <section id="structure" className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-[var(--border-subtle)]">
            <Coins className="w-4 h-4 text-[var(--brand-primary)]" />
            <h2 className="text-base font-bold text-[var(--text-primary)]">Capital Structure & Promoters</h2>
          </div>
          <IPOPromotersStructure ipo={ipo} promoters={promoters} />
        </section>

        {/* Section 7: Strengths & Risks */}
        <section id="strengths-risks" className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-[var(--border-subtle)]">
            <FileText className="w-4 h-4 text-[var(--brand-primary)]" />
            <h2 className="text-base font-bold text-[var(--text-primary)]">Investment Strengths & Key Risk Disclosures</h2>
          </div>
          <IPOStrengthsRisks strengths={strengths} risks={risks} />
        </section>

        {/* Section 8: Grey Market Premium (GMP) */}
        <section id="gmp" className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-[var(--border-subtle)]">
            <TrendingUp className="w-4 h-4 text-[var(--brand-primary)]" />
            <h2 className="text-base font-bold text-[var(--text-primary)]">Grey Market Premium (GMP) & Sentiment Trend</h2>
          </div>
          <IPOGMPCard ipo={ipo} latestGmp={latestGmp} history={gmpHistory} />
        </section>

        {/* Section 9: Subscription Demand Multiples */}
        <section id="subscription" className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-[var(--border-subtle)]">
            <TrendingUp className="w-4 h-4 text-[var(--brand-primary)]" />
            <h2 className="text-base font-bold text-[var(--text-primary)]">Live Subscription Demand & Quota Breakdown</h2>
          </div>
          <IPOSubscriptionCard ipo={ipo} latestSubscription={latestSubscription} snapshots={subscriptionSnapshots} />
        </section>

        {/* Section 10: Quantitative IPO Score */}
        <section id="score" className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-[var(--border-subtle)]">
            <TrendingUp className="w-4 h-4 text-[var(--brand-primary)]" />
            <h2 className="text-base font-bold text-[var(--text-primary)]">Quantitative IPO Score & Analytical Model</h2>
          </div>
          <IPOScoreCard score={score} computedBreakdown={computedScoreBreakdown} />
        </section>

        {/* Section 11 & 12: Regulatory Documents & News */}
        <section id="documents" className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-[var(--border-subtle)]">
            <FileText className="w-4 h-4 text-[var(--brand-primary)]" />
            <h2 className="text-base font-bold text-[var(--text-primary)]">Official Prospectus Filings & Curated News</h2>
          </div>
          <div id="news">
            <IPODocumentsNews documents={documents} news={news} />
          </div>
        </section>
      </div>
    </div>
  );
}
