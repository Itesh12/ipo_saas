import { Database } from "@/types/database.types";

export type IPORow = Database["public"]["Tables"]["ipos"]["Row"];
export type IPOInsert = Database["public"]["Tables"]["ipos"]["Insert"];
export type IPOUpdate = Database["public"]["Tables"]["ipos"]["Update"];
export type IPOEventRow = Database["public"]["Tables"]["ipo_events"]["Row"];
export type IPOBusinessProfileRow = Database["public"]["Tables"]["ipo_business_profiles"]["Row"];
export type IPOFinancialRow = Database["public"]["Tables"]["ipo_financials"]["Row"];
export type IPOValuationRow = Database["public"]["Tables"]["ipo_valuations"]["Row"];
export type IPOPeerRow = Database["public"]["Tables"]["ipo_peers"]["Row"];
export type IPOPromoterRow = Database["public"]["Tables"]["ipo_promoters"]["Row"];
export type IPOStrengthRow = Database["public"]["Tables"]["ipo_strengths"]["Row"];
export type IPORiskRow = Database["public"]["Tables"]["ipo_risks"]["Row"];
export type IPOGMPEntryRow = Database["public"]["Tables"]["ipo_gmp_entries"]["Row"];
export type IPOSubscriptionSnapshotRow = Database["public"]["Tables"]["ipo_subscription_snapshots"]["Row"];
export type IPOScoreRow = Database["public"]["Tables"]["ipo_scores"]["Row"];
export type IPODocumentRow = Database["public"]["Tables"]["ipo_documents"]["Row"];
export type IPONewsRow = Database["public"]["Tables"]["ipo_news"]["Row"];

export type IPOCategory = Database["public"]["Enums"]["ipo_category"];
export type IPOIssueType = Database["public"]["Enums"]["ipo_issue_type"];
export type IPOStatus = Database["public"]["Enums"]["ipo_status"];
export type IPOPublicationStatus = Database["public"]["Enums"]["ipo_publication_status"];
export type IPOEventType = Database["public"]["Enums"]["ipo_event_type"];
export type IPODocType = Database["public"]["Enums"]["ipo_doc_type"];
export type IPORiskSeverity = Database["public"]["Enums"]["ipo_risk_severity"];
export type IPOSentiment = Database["public"]["Enums"]["ipo_sentiment"];
export type IPOVerificationStatus = Database["public"]["Enums"]["ipo_verification_status"];
export type IPOSatementType = Database["public"]["Enums"]["ipo_statement_type"];
export type IPOAuditStatus = Database["public"]["Enums"]["ipo_audit_status"];

export interface IPOFilterParams {
  category?: IPOCategory | "all";
  status?: IPOStatus | "all" | "current" | "upcoming" | "past" | "active_universe";
  searchQuery?: string;
  sortBy?: "open_date" | "close_date" | "listing_date" | "issue_size" | "company_name";
  sortOrder?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface IPOWithEvents extends IPORow {
  events?: IPOEventRow[];
}

export interface IPOTimelineMilestone {
  type: IPOEventType;
  title: string;
  date: string | null;
  status: "completed" | "active" | "upcoming";
  description?: string;
}

export interface IPOCalendarEvent {
  id: string;
  ipoId: string;
  slug: string;
  companyName: string;
  category: IPOCategory;
  eventType: IPOEventType;
  eventDate: string;
  title: string;
  priceBand?: string;
}

export interface IPOResearchBundle {
  ipo: IPORow;
  businessProfile: IPOBusinessProfileRow | null;
  financials: IPOFinancialRow[];
  valuation: IPOValuationRow | null;
  peers: IPOPeerRow[];
  promoters: IPOPromoterRow[];
  strengths: IPOStrengthRow[];
  risks: IPORiskRow[];
  latestGmp: IPOGMPEntryRow | null;
  gmpHistory: IPOGMPEntryRow[];
  latestSubscription: IPOSubscriptionSnapshotRow | null;
  subscriptionSnapshots: IPOSubscriptionSnapshotRow[];
  score: IPOScoreRow | null;
  documents: IPODocumentRow[];
  news: IPONewsRow[];
}

export interface IPOScoreBreakdown {
  financialHealth: { score: number; max: number; notes: string[] };
  valuation: { score: number; max: number; notes: string[] };
  issueStructure: { score: number; max: number; notes: string[] };
  marketSentiment: { score: number; max: number; notes: string[] };
  subscriptionDemand: { score: number; max: number; notes: string[] };
  industryRisk: { score: number; max: number; notes: string[] };
  overall: number;
  maxOverall: number;
  isInsufficientData: boolean;
  missingCategories: string[];
  version: string;
}

export interface GMPTrackerItem {
  id: string;
  slug: string;
  company_name: string;
  symbol: string | null;
  category: IPOCategory;
  status: IPOStatus;
  price_band_low: number | null;
  price_band_high: number | null;
  open_date: string | null;
  close_date: string | null;
  listing_date: string | null;
  ipo_gmp_entries: IPOGMPEntryRow[];
}

export interface SubscriptionTrackerItem {
  id: string;
  slug: string;
  company_name: string;
  symbol: string | null;
  category: IPOCategory;
  status: IPOStatus;
  issue_size_cr: number | null;
  open_date: string | null;
  close_date: string | null;
  ipo_subscription_snapshots: IPOSubscriptionSnapshotRow[];
}
