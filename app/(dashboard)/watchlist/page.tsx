import React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatINR, formatPercentage } from "@/lib/utils";
import { requireAuth } from "@/lib/security/auth-guards";
import { getUserWatchlist } from "@/features/application/services/watchlistService";
import { WatchlistButton } from "@/components/application/WatchlistButton";
import { Star, TrendingUp, ArrowRight, ShieldAlert } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function WatchlistPage() {
  const user = await requireAuth();
  const userId = user.id;

  const items = await getUserWatchlist(userId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Watchlist"
        description="Monitor prioritized IPOs, receive unofficial GMP fluctuation signals, and track upcoming bidding cutoffs."
      />

      {items.length === 0 ? (
        <EmptyState
          icon={Star}
          title="Your watchlist is empty"
          description="Star IPOs from the research terminal or listings to keep track of their unofficial GMP trends and bidding windows."
          actionLabel="Explore Current IPOs"
          actionHref="/ipos"
        />
      ) : (
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-start gap-2.5 text-xs text-[var(--text-secondary)]">
            <ShieldAlert className="w-4 h-4 text-[var(--status-warning)] shrink-0 mt-0.5" />
            <p>
              <strong>GMP (Unofficial Indicator):</strong> Grey Market Premium quotes are unofficial market indicators reported by third-party intelligence sources. They are not official exchange values and do not guarantee listing returns.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map(({ ipo, latest_gmp }) => (
              <Card
                key={ipo.id}
                className="p-5 flex flex-col justify-between space-y-4 border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--brand-primary)]/40 transition-colors"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" size="sm">
                          {ipo.status.toUpperCase()}
                        </Badge>
                        {ipo.symbol && (
                          <span className="text-[11px] font-mono text-[var(--text-muted)]">
                            {ipo.symbol}
                          </span>
                        )}
                      </div>
                      <h3 className="text-base font-bold text-[var(--text-primary)] mt-1 tracking-tight">
                        {ipo.company_name}
                      </h3>
                    </div>
                    <WatchlistButton ipoId={ipo.id} initialIsWatched={true} showLabel={false} />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs py-2 border-y border-[var(--border-subtle)]">
                    <div>
                      <span className="text-[10px] text-[var(--text-muted)]">Price Band</span>
                      <p className="font-semibold text-[var(--text-primary)]">
                        ₹{ipo.price_band_low} - ₹{ipo.price_band_high}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] text-[var(--text-muted)]">Lot Size</span>
                      <p className="font-semibold text-[var(--text-primary)]">
                        {ipo.lot_size} shares ({formatINR(ipo.min_investment)})
                      </p>
                    </div>
                  </div>

                  {/* GMP Widget */}
                  <div className="p-3 rounded-lg bg-[var(--bg-surface-elevated)]/40 border border-[var(--border-subtle)] flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[10px] font-semibold text-[var(--text-muted)] flex items-center gap-1">
                        <TrendingUp className="w-3 h-3 text-[var(--status-success)]" />
                        GMP (Unofficial)
                      </span>
                      <p className="font-bold text-sm text-[var(--status-success)] mt-0.5">
                        {latest_gmp ? formatINR(latest_gmp.gmp_amount) : "TBA"}
                        {latest_gmp?.gmp_percentage && (
                          <span className="text-[11px] text-[var(--status-success)] font-medium ml-1">
                            ({formatPercentage(latest_gmp.gmp_percentage)})
                          </span>
                        )}
                      </p>
                    </div>

                    {latest_gmp?.estimated_listing_price && (
                      <div className="text-right">
                        <span className="text-[10px] text-[var(--text-muted)]">Est. Listing</span>
                        <p className="font-bold text-xs text-[var(--text-primary)] mt-0.5 font-mono">
                          ₹{latest_gmp.estimated_listing_price}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border-subtle)]">
                  <Link href={`/ipos/${ipo.slug}`} className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--brand-primary)]">
                    Research
                  </Link>

                  <Link href={`/ipos/${ipo.slug}/apply`}>
                    <Button size="sm" variant="primary" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
                      Apply Now
                    </Button>
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
