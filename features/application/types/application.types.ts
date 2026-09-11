/**
 * Application & Applicant Feature Types
 */

import { Database } from "@/types/database.types";
import { InvestorCategory } from "@/config/investorCategories";
import { ApplicationStatus, ApplicationEventType } from "../services/applicationLifecycle";
export type { ApplicationStatus, ApplicationEventType };

export type ApplicantRelationship = Database["public"]["Enums"]["applicant_relationship"];
export type MandateStatus = Database["public"]["Enums"]["mandate_status"];
export type AllotmentStatus = Database["public"]["Enums"]["allotment_status"];

export type ApplicantProfileRow = Database["public"]["Tables"]["applicant_profiles"]["Row"];
export type ApplicantProfileInsert = Database["public"]["Tables"]["applicant_profiles"]["Insert"];
export type ApplicantProfileUpdate = Database["public"]["Tables"]["applicant_profiles"]["Update"];

export type IPOApplicationRow = Database["public"]["Tables"]["ipo_applications"]["Row"];
export type IPOApplicationInsert = Database["public"]["Tables"]["ipo_applications"]["Insert"];
export type IPOApplicationUpdate = Database["public"]["Tables"]["ipo_applications"]["Update"];

export type IPOApplicationBidRow = Database["public"]["Tables"]["ipo_application_bids"]["Row"];
export type IPOApplicationBidInsert = Database["public"]["Tables"]["ipo_application_bids"]["Insert"];

export type IPOApplicationMandateRow = Database["public"]["Tables"]["ipo_application_mandates"]["Row"];
export type IPOApplicationMandateInsert = Database["public"]["Tables"]["ipo_application_mandates"]["Insert"];

export type IPOApplicationAllotmentRow = Database["public"]["Tables"]["ipo_application_allotments"]["Row"];
export type IPOApplicationAllotmentInsert = Database["public"]["Tables"]["ipo_application_allotments"]["Insert"];

export type IPOApplicationEventRow = Database["public"]["Tables"]["ipo_application_events"]["Row"];
export type IPOApplicationEventInsert = Database["public"]["Tables"]["ipo_application_events"]["Insert"];

export type WatchlistItemRow = Database["public"]["Tables"]["watchlist_items"]["Row"];

export interface ApplicantSummary {
  id: string;
  relationship: ApplicantRelationship;
  displayName: string;
  panMasked: string;
  dematMasked: string;
  upiMasked: string;
  defaultCategory: InvestorCategory;
  isActive: boolean;
  applicationCount: number;
}

export interface ApplicationDetailBundle {
  application: IPOApplicationRow;
  applicant: ApplicantProfileRow;
  ipo: {
    id: string;
    company_name: string;
    symbol: string | null;
    slug: string;
    company_logo: string | null;
    status: string;
    price_band_low: number;
    price_band_high: number;
    lot_size: number;
    open_date: string;
    close_date: string;
    allotment_date: string;
    refund_date: string;
    listing_date: string;
    listing_price: number | null;
  };
  bids: IPOApplicationBidRow[];
  mandate: IPOApplicationMandateRow | null;
  allotment: IPOApplicationAllotmentRow | null;
  events: IPOApplicationEventRow[];
}

export interface ApplicationListItem {
  id: string;
  application_number: string;
  status: ApplicationStatus;
  applied_at: string;
  investor_category: InvestorCategory;
  total_lots: number;
  total_quantity: number;
  bid_price: number;
  application_amount: number;
  blocked_amount: number;
  allotment_amount: number;
  refund_amount: number;
  ipo: {
    id: string;
    company_name: string;
    symbol: string | null;
    slug: string;
    company_logo: string | null;
    status: string;
    lot_size: number;
    close_date: string;
    allotment_date: string;
  };
  applicant: {
    id: string;
    display_name: string;
    relationship: ApplicantRelationship;
    pan_masked: string;
  };
  mandate_status?: MandateStatus;
  allotment_status?: AllotmentStatus;
}

export interface WatchlistIPOItem {
  id: string;
  user_id: string;
  ipo_id: string;
  created_at: string;
  ipo: {
    id: string;
    company_name: string;
    symbol: string | null;
    slug: string;
    company_logo: string | null;
    status: string;
    price_band_low: number;
    price_band_high: number;
    lot_size: number;
    min_investment: number;
    open_date: string;
    close_date: string;
    listing_date: string;
  };
  latest_gmp?: {
    gmp_amount: number;
    gmp_percentage: number | null;
    estimated_listing_price: number | null;
    source: string;
    observed_at: string;
  } | null;
}
