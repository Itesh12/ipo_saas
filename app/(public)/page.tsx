import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import {
  TrendingUp,
  ShieldCheck,
  Users2,
  PieChart,
  BarChart3,
  SlidersHorizontal,
  ArrowRight,
  Sparkles,
  Layers,
  Wallet,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="space-y-20 pb-20">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-16 md:pt-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center">
        {/* Ambient background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-[var(--brand-primary)]/15 blur-[120px] rounded-full pointer-events-none" />

        <div className="relative z-10 space-y-6 max-w-3xl mx-auto">
          <Badge variant="info" size="md" className="gap-1.5 px-3 py-1">
            <Sparkles className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
            <span>The Indian IPO Operating System</span>
          </Badge>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-[var(--text-primary)] leading-[1.15]">
            Discover, Research & Manage IPOs with{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--brand-primary)] via-[var(--brand-accent)] to-[var(--status-info)]">
              Precision
            </span>
          </h1>

          <p className="text-sm sm:text-base text-[var(--text-secondary)] max-w-2xl mx-auto leading-relaxed">
            From live Grey Market Premium (GMP) intelligence and subscription momentum to multi-account family applications and double-entry portfolio tracking.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link href="/register">
              <Button size="lg" variant="primary" rightIcon={<ArrowRight className="w-4 h-4" />}>
                Get Started Free
              </Button>
            </Link>
            <Link href="/ipos">
              <Button size="lg" variant="secondary" leftIcon={<Layers className="w-4 h-4" />}>
                Explore Current IPOs
              </Button>
            </Link>
          </div>

          <div className="pt-4 flex items-center justify-center gap-6 text-xs text-[var(--text-muted)]">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[var(--status-success)]" /> No Broker Passwords
            </span>
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-[var(--brand-primary)]" /> Multi-Theme Ready
            </span>
            <span className="flex items-center gap-1.5">
              <Users2 className="w-4 h-4 text-[var(--status-info)]" /> Family & Friends Accounts
            </span>
          </div>
        </div>
      </section>

      {/* Feature Pillar Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center space-y-2 mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)]">
            Everything You Need for Systematic IPO Investing
          </h2>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] max-w-xl mx-auto">
            Built from first principles for Mainboard & SME investors in Indian equity markets.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1 */}
          <Card className="hover:border-[var(--border-strong)] transition-all">
            <CardHeader>
              <div className="w-10 h-10 rounded-xl bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--brand-primary)] mb-3">
                <TrendingUp className="w-5 h-5" />
              </div>
              <CardTitle>GMP Intelligence & Sentiment</CardTitle>
              <CardDescription>
                Track live and historical Grey Market Premium with estimated listing gain percentages and sentiment indicators.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/ipo-gmp" className="text-xs font-semibold text-[var(--brand-primary)] hover:underline inline-flex items-center gap-1">
                View Live GMP <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </CardContent>
          </Card>

          {/* Card 2 */}
          <Card className="hover:border-[var(--border-strong)] transition-all">
            <CardHeader>
              <div className="w-10 h-10 rounded-xl bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--status-success)] mb-3">
                <Users2 className="w-5 h-5" />
              </div>
              <CardTitle>Family & Applicant Management</CardTitle>
              <CardDescription>
                Coordinate multiple Demat applications across family and friends with masked identifiers and allotment outcome tracking.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/applicants" className="text-xs font-semibold text-[var(--brand-primary)] hover:underline inline-flex items-center gap-1">
                Manage Applicants <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </CardContent>
          </Card>

          {/* Card 3 */}
          <Card className="hover:border-[var(--border-strong)] transition-all">
            <CardHeader>
              <div className="w-10 h-10 rounded-xl bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--brand-accent)] mb-3">
                <Wallet className="w-5 h-5" />
              </div>
              <CardTitle>Financial Ledger & Portfolio</CardTitle>
              <CardDescription>
                Track blocked capital, refunds, and realized listing gains with a deterministic accounting ledger.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/capital" className="text-xs font-semibold text-[var(--brand-primary)] hover:underline inline-flex items-center gap-1">
                View Ledger Model <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </CardContent>
          </Card>

          {/* Card 4 */}
          <Card className="hover:border-[var(--border-strong)] transition-all">
            <CardHeader>
              <div className="w-10 h-10 rounded-xl bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--status-info)] mb-3">
                <BarChart3 className="w-5 h-5" />
              </div>
              <CardTitle>Live Subscription Tracking</CardTitle>
              <CardDescription>
                Day-wise category breakdown across QIB, NII/HNI, Retail, and Employee quotas with real-time oversubscription multiples.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/ipo-subscription" className="text-xs font-semibold text-[var(--brand-primary)] hover:underline inline-flex items-center gap-1">
                Explore Subscriptions <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </CardContent>
          </Card>

          {/* Card 5 */}
          <Card className="hover:border-[var(--border-strong)] transition-all">
            <CardHeader>
              <div className="w-10 h-10 rounded-xl bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--status-warning)] mb-3">
                <SlidersHorizontal className="w-5 h-5" />
              </div>
              <CardTitle>Multi-Factor Screener</CardTitle>
              <CardDescription>
                Filter IPOs by issue size, P/E multiples, ROE, ROCE, GMP percentage, and our explainable IPO Score.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/ipo-screener" className="text-xs font-semibold text-[var(--brand-primary)] hover:underline inline-flex items-center gap-1">
                Launch Screener <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </CardContent>
          </Card>

          {/* Card 6 */}
          <Card className="hover:border-[var(--border-strong)] transition-all">
            <CardHeader>
              <div className="w-10 h-10 rounded-xl bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--brand-primary)] mb-3">
                <PieChart className="w-5 h-5" />
              </div>
              <CardTitle>Allotment Analytics</CardTitle>
              <CardDescription>
                Understand historical allotment rates by category, registrar speed, and return on capital deployed.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/analytics" className="text-xs font-semibold text-[var(--brand-primary)] hover:underline inline-flex items-center gap-1">
                View Analytics <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
