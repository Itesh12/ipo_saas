import React from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { createClient } from "@/lib/supabase/server";
import { formatINR, formatPercentage, formatDate } from "@/lib/utils";
import { TrendingUp, Plus } from "lucide-react";
import { recordGMPAction } from "@/features/ipo/actions/researchActions";

export default async function AdminGmpPage() {
  const supabase = await createClient();

  const [iposRes, gmpRes] = await Promise.all([
    supabase
      .from("ipos")
      .select("id, company_name, symbol, price_band_high, price_band_low")
      .in("status", ["announced", "upcoming", "open", "closed", "allotment_pending", "listing_soon"])
      .order("company_name", { ascending: true }),
    supabase
      .from("ipo_gmp_entries")
      .select(`
        id,
        ipo_id,
        gmp_value,
        gmp_percentage,
        estimated_listing_price,
        estimated_listing_gain_pct,
        confidence_level,
        observed_at,
        source,
        notes,
        ipos (
          company_name,
          symbol,
          price_band_high
        )
      `)
      .order("observed_at", { ascending: false })
      .limit(50),
  ]);

  const ipos = (iposRes.data || []) as unknown as {
    id: string;
    company_name: string;
    symbol: string | null;
    price_band_high: number | null;
    price_band_low: number | null;
  }[];

  const entries = (gmpRes.data || []) as unknown as {
    id: string;
    ipo_id: string;
    gmp_value: number;
    gmp_percentage: number | null;
    estimated_listing_price: number | null;
    estimated_listing_gain_pct: number | null;
    confidence_level: string;
    observed_at: string;
    source: string;
    notes: string | null;
    ipos: {
      company_name?: string;
      symbol?: string | null;
      price_band_high?: number | null;
    } | null;
  }[];

  const handleCreateGMP = async (formData: FormData) => {
    "use server";
    await recordGMPAction(formData);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Grey Market Premium (GMP) Operations"
        description="Log daily unofficial GMP quotes, track price sentiment, and observe estimated listing gains for active IPOs."
      />

      {/* Record GMP Snapshot Form */}
      <Card className="border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <CardHeader className="py-3 px-5 bg-[var(--bg-surface-elevated)]/30 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-[var(--brand-primary)]" />
            <CardTitle className="text-sm">Log New Daily GMP Observation</CardTitle>
          </div>
        </CardHeader>

        <CardContent className="p-5">
          <form action={handleCreateGMP} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Target IPO</label>
              <Select name="ipo_id" required>
                <option value="">Select an IPO</option>
                {ipos.map((ipo) => (
                  <option key={ipo.id} value={ipo.id}>
                    {ipo.company_name} (Upper: ₹{ipo.price_band_high || "—"})
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-[var(--text-secondary)]">GMP Amount (₹)</label>
              <Input name="gmp_value" type="number" step="0.5" placeholder="e.g. 120" required />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Cutoff Price (₹)</label>
              <Input name="cutoff_price" type="number" step="1" placeholder="e.g. 450" required />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Source Attribution</label>
              <Input name="source" placeholder="e.g. Market Intelligence" defaultValue="Market Intelligence (Unofficial)" />
            </div>

            <Button type="submit" variant="primary" leftIcon={<Plus className="w-3.5 h-3.5" />}>
              Save GMP Quote
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Historical Audit Table */}
      <Card className="border-[var(--border-subtle)] overflow-hidden">
        <CardHeader className="py-3 px-5 bg-[var(--bg-surface-elevated)]/30 border-b border-[var(--border-subtle)] flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[var(--brand-primary)]" />
            <CardTitle className="text-sm">Recent GMP Log Entries</CardTitle>
          </div>
          <span className="text-xs text-[var(--text-muted)]">{entries.length} Observations</span>
        </CardHeader>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--bg-surface-elevated)]/40 border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
              <tr>
                <th className="py-2.5 px-4 font-semibold">IPO Company</th>
                <th className="py-2.5 px-4 text-right font-semibold">GMP (₹)</th>
                <th className="py-2.5 px-4 text-right font-semibold">Est. Listing Price</th>
                <th className="py-2.5 px-4 text-right font-semibold">Est. Gain (%)</th>
                <th className="py-2.5 px-4 font-semibold">Recorded At</th>
                <th className="py-2.5 px-4 font-semibold">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]/60 text-[var(--text-primary)]">
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-[var(--text-muted)]">
                    No GMP observations logged yet.
                  </td>
                </tr>
              ) : (
                entries.map((entry) => {
                  const company = entry.ipos?.company_name || "IPO";
                  return (
                    <tr key={entry.id} className="hover:bg-[var(--bg-surface-elevated)]/20 transition-colors">
                      <td className="py-2.5 px-4 font-semibold">{company}</td>
                      <td className="py-2.5 px-4 text-right font-bold">{formatINR(entry.gmp_value)}</td>
                      <td className="py-2.5 px-4 text-right text-[var(--brand-primary)]">
                        {formatINR(entry.estimated_listing_price)}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <Badge
                          variant={
                            (entry.gmp_percentage || 0) > 0
                              ? "success"
                              : (entry.gmp_percentage || 0) === 0
                              ? "secondary"
                              : "danger"
                          }
                          size="sm"
                        >
                          {formatPercentage(entry.gmp_percentage, { showSign: true })}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-4 text-[var(--text-muted)]">
                        {formatDate(entry.observed_at, { includeTime: true })}
                      </td>
                      <td className="py-2.5 px-4 text-[var(--text-muted)] truncate max-w-[150px]">{entry.source}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
