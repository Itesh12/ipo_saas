/**
 * Admin Research Mutation Service
 * Handles administrative insertions and updates for research records with audit logging.
 */

import { createClient } from "@/lib/supabase/server";
import { calculateGMPEstimate } from "./gmpEngine";
import {
  IPOVerificationStatus,
  IPOSatementType,
  IPOAuditStatus,
} from "../types/ipo.types";

/**
 * Records a new Grey Market Premium (GMP) observation.
 */
export async function recordGMPEntry(params: {
  ipoId: string;
  gmpValue: number;
  cutoffPrice: number;
  confidenceLevel?: IPOVerificationStatus;
  source?: string;
  sourceUrl?: string;
  notes?: string;
  actorId?: string | null;
}) {
  const supabase = await createClient();
  const { gmpPercentage, estimatedListingPrice, estimatedListingGainPct } =
    calculateGMPEstimate(params.gmpValue, params.cutoffPrice);

  const payload = {
    ipo_id: params.ipoId,
    gmp_value: params.gmpValue,
    gmp_percentage: gmpPercentage,
    estimated_listing_price: estimatedListingPrice,
    estimated_listing_gain_pct: estimatedListingGainPct,
    confidence_level: params.confidenceLevel || ("unofficial" as IPOVerificationStatus),
    source: params.source || "Market Intelligence (Unofficial)",
    source_url: params.sourceUrl || null,
    notes: params.notes || null,
    observed_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("ipo_gmp_entries")
    .insert(payload as never)
    .select()
    .single();

  if (error) throw error;

  await supabase.from("audit_logs").insert({
    actor_id: params.actorId ?? null,
    action: "RECORD_GMP_ENTRY",
    resource_type: "ipo_gmp_entries",
    resource_id: params.ipoId,
    new_values: payload,
  } as never);

  return data;
}

/**
 * Records a subscription demand snapshot.
 */
export async function recordSubscriptionSnapshot(params: {
  ipoId: string;
  dayNumber: number;
  snapshotDate: string;
  qib_x?: number | null;
  nii_x?: number | null;
  retail_x?: number | null;
  employee_x?: number | null;
  overall_x: number;
  source?: string;
  actorId?: string | null;
}) {
  const supabase = await createClient();
  const payload = {
    ipo_id: params.ipoId,
    day_number: params.dayNumber,
    snapshot_date: params.snapshotDate,
    snapshot_time: new Date().toISOString(),
    qib_x: params.qib_x ?? null,
    nii_x: params.nii_x ?? null,
    retail_x: params.retail_x ?? null,
    employee_x: params.employee_x ?? null,
    overall_x: params.overall_x,
    source: params.source || "BSE / NSE Cumulative Feed",
  };

  const { data, error } = await supabase
    .from("ipo_subscription_snapshots")
    .upsert(payload as never)
    .select()
    .single();

  if (error) throw error;

  await supabase.from("audit_logs").insert({
    actor_id: params.actorId ?? null,
    action: "RECORD_SUBSCRIPTION_SNAPSHOT",
    resource_type: "ipo_subscription_snapshots",
    resource_id: params.ipoId,
    new_values: payload,
  } as never);

  return data;
}

/**
 * Upserts a financial year record for an IPO.
 */
export async function upsertFinancialRecord(params: {
  ipoId: string;
  financialYear: string;
  statementType?: IPOSatementType;
  auditStatus?: IPOAuditStatus;
  revenueCr?: number | null;
  revenueGrowthPct?: number | null;
  ebitdaCr?: number | null;
  ebitdaMarginPct?: number | null;
  patCr?: number | null;
  patMarginPct?: number | null;
  eps?: number | null;
  roePct?: number | null;
  rocePct?: number | null;
  totalDebtCr?: number | null;
  netWorthCr?: number | null;
  source?: string;
  actorId?: string | null;
}) {
  const supabase = await createClient();
  const payload = {
    ipo_id: params.ipoId,
    financial_year: params.financialYear,
    statement_type: params.statementType || "consolidated",
    audit_status: params.auditStatus || "restated",
    revenue_cr: params.revenueCr ?? null,
    revenue_growth_pct: params.revenueGrowthPct ?? null,
    ebitda_cr: params.ebitdaCr ?? null,
    ebitda_margin_pct: params.ebitdaMarginPct ?? null,
    pat_cr: params.patCr ?? null,
    pat_margin_pct: params.patMarginPct ?? null,
    eps: params.eps ?? null,
    roe_pct: params.roePct ?? null,
    roce_pct: params.rocePct ?? null,
    total_debt_cr: params.totalDebtCr ?? null,
    net_worth_cr: params.netWorthCr ?? null,
    source: params.source || "RHP Financial Statements",
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("ipo_financials")
    .upsert(payload as never)
    .select()
    .single();

  if (error) throw error;

  await supabase.from("audit_logs").insert({
    actor_id: params.actorId ?? null,
    action: "UPSERT_FINANCIAL_RECORD",
    resource_type: "ipo_financials",
    resource_id: params.ipoId,
    new_values: payload,
  } as never);

  return data;
}
