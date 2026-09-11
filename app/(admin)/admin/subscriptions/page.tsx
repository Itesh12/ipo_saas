import React from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { formatSubscriptionMultiple } from "@/features/ipo/services/subscriptionEngine";
import { BarChart3, Plus } from "lucide-react";
import { recordSubscriptionAction } from "@/features/ipo/actions/researchActions";

interface SubscriptionRow {
  id: string;
  ipo_id: string;
  day_number: number;
  snapshot_date: string;
  qib_x: number | null;
  nii_x: number | null;
  retail_x: number | null;
  employee_x: number | null;
  overall_x: number;
  source: string;
  ipos: {
    company_name?: string;
    symbol?: string;
  } | null;
}

interface IPORow {
  id: string;
  company_name: string;
  symbol: string | null;
}

export default async function AdminSubscriptionsPage() {
  const supabase = await createClient();

  const [iposRes, subsRes] = await Promise.all([
    supabase
      .from("ipos")
      .select("id, company_name, symbol")
      .in("status", ["open", "closed", "allotment_pending", "listing_soon"])
      .order("company_name", { ascending: true }),
    supabase
      .from("ipo_subscription_snapshots")
      .select(`
        id,
        ipo_id,
        day_number,
        snapshot_date,
        qib_x,
        nii_x,
        retail_x,
        employee_x,
        overall_x,
        source,
        ipos (
          company_name,
          symbol
        )
      `)
      .order("snapshot_date", { ascending: false })
      .limit(50),
  ]);

  const ipos = (iposRes.data || []) as IPORow[];
  const snapshots = (subsRes.data || []) as unknown as SubscriptionRow[];

  const handleRecordSubscription = async (formData: FormData) => {
    "use server";
    await recordSubscriptionAction(formData);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subscription Demand Operations"
        description="Record day-wise cumulative bidding multiples across QIB, NII, Retail, and Employee quotas."
      />

      {/* Snapshot Entry Form */}
      <Card className="border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <CardHeader className="py-3 px-5 bg-[var(--bg-surface-elevated)]/30 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-[var(--brand-primary)]" />
            <CardTitle className="text-sm">Record Daily Subscription Snapshot</CardTitle>
          </div>
        </CardHeader>

        <CardContent className="p-5">
          <form action={handleRecordSubscription} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--text-secondary)]">Target IPO</label>
                <Select name="ipo_id" required>
                  <option value="">Select an IPO</option>
                  {ipos.map((ipo) => (
                    <option key={ipo.id} value={ipo.id}>
                      {ipo.company_name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--text-secondary)]">Bidding Day</label>
                <Select name="day_number" required>
                  <option value="1">Day 1 (Opening Day)</option>
                  <option value="2">Day 2</option>
                  <option value="3">Day 3 (Final Cutoff)</option>
                  <option value="4">Day 4 (Extended)</option>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--text-secondary)]">Snapshot Date</label>
                <Input name="snapshot_date" type="date" required defaultValue={new Date().toISOString().split("T")[0]} />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 items-end">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--text-secondary)]">QIB (x)</label>
                <Input name="qib_x" type="number" step="0.01" placeholder="e.g. 1.25" />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--text-secondary)]">NII / HNI (x)</label>
                <Input name="nii_x" type="number" step="0.01" placeholder="e.g. 3.40" />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--text-secondary)]">Retail RII (x)</label>
                <Input name="retail_x" type="number" step="0.01" placeholder="e.g. 2.80" />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--text-secondary)]">Total / Overall (x)</label>
                <Input name="overall_x" type="number" step="0.01" placeholder="e.g. 2.45" required />
              </div>

              <Button type="submit" variant="primary" leftIcon={<Plus className="w-3.5 h-3.5" />}>
                Record Snapshot
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Snapshot List Table */}
      <Card className="border-[var(--border-subtle)] overflow-hidden">
        <CardHeader className="py-3 px-5 bg-[var(--bg-surface-elevated)]/30 border-b border-[var(--border-subtle)] flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[var(--brand-primary)]" />
            <CardTitle className="text-sm">Recorded Bidding Snapshots</CardTitle>
          </div>
          <span className="text-xs text-[var(--text-muted)]">{snapshots.length} Snapshots</span>
        </CardHeader>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--bg-surface-elevated)]/40 border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
              <tr>
                <th className="py-2.5 px-4 font-semibold">IPO Company</th>
                <th className="py-2.5 px-4 font-semibold">Day / Date</th>
                <th className="py-2.5 px-4 text-right font-semibold">QIB (x)</th>
                <th className="py-2.5 px-4 text-right font-semibold">NII (x)</th>
                <th className="py-2.5 px-4 text-right font-semibold">Retail (x)</th>
                <th className="py-2.5 px-4 text-right font-bold text-[var(--brand-primary)]">Overall (x)</th>
                <th className="py-2.5 px-4 font-semibold">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]/60 text-[var(--text-primary)]">
              {snapshots.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-xs text-[var(--text-muted)]">
                    No subscription snapshots recorded yet.
                  </td>
                </tr>
              ) : (
                snapshots.map((snap) => {
                  const company = (snap.ipos as { company_name?: string })?.company_name || "IPO";
                  return (
                    <tr key={snap.id} className="hover:bg-[var(--bg-surface-elevated)]/20 transition-colors">
                      <td className="py-2.5 px-4 font-semibold">{company}</td>
                      <td className="py-2.5 px-4">
                        <Badge variant="default" size="sm">
                          Day {snap.day_number}
                        </Badge>
                        <span className="text-[11px] text-[var(--text-muted)] ml-1.5">
                          {formatDate(snap.snapshot_date)}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right">{formatSubscriptionMultiple(snap.qib_x)}</td>
                      <td className="py-2.5 px-4 text-right">{formatSubscriptionMultiple(snap.nii_x)}</td>
                      <td className="py-2.5 px-4 text-right">{formatSubscriptionMultiple(snap.retail_x)}</td>
                      <td className="py-2.5 px-4 text-right font-bold text-[var(--brand-primary)]">
                        {formatSubscriptionMultiple(snap.overall_x)}
                      </td>
                      <td className="py-2.5 px-4 text-[var(--text-muted)]">{snap.source}</td>
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
