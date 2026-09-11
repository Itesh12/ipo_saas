/**
 * features/admin/types/intelligence.types.ts
 *
 * Types for Administrative Intelligence, Telemetry, and Data Quality.
 */

export interface SystemHealthMetrics {
  pending_notifications: number;
  processing_notifications: number;
  dead_letter_notifications: number;
  completed_24h_notifications: number;
  submitted_applications: number;
  mandate_pending_applications: number;
  allotment_pending_applications: number;
  critical_work_items: number;
  total_active_work_items: number;
}

export interface IpoDataQualityItem {
  ipo_id: string;
  symbol: string | null;
  company_name: string;
  status: string;
  open_date: string | null;
  close_date: string | null;
  allotment_date: string | null;
  listing_date: string | null;
  has_basic_details: boolean;
  has_financials: boolean;
  has_valuation: boolean;
  has_promoters: boolean;
  has_risks: boolean;
  has_subscription: boolean;
  has_fresh_gmp: boolean;
  has_documents: boolean;
  has_news: boolean;
  completeness_score: number;
}

export interface IpoPipelineOverview {
  total_ipos: number;
  announced: number;
  upcoming: number;
  open: number;
  closed: number;
  allotment_pending: number;
  listing_soon: number;
  listed: number;
}
