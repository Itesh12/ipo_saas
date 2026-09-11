export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "super_admin" | "admin" | "editor" | "analyst" | "user";

export type IPOCategory = "mainboard" | "sme_bse" | "sme_nse";
export type IPOIssueType = "book_building" | "fixed_price";
export type IPOStatus =
  | "announced"
  | "upcoming"
  | "open"
  | "closed"
  | "allotment_pending"
  | "listing_soon"
  | "listed"
  | "withdrawn"
  | "cancelled";

export type IPOPublicationStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "published"
  | "archived";

export type IPOEventType =
  | "announcement"
  | "open"
  | "close"
  | "allotment"
  | "refund"
  | "listing";

export type IPODocType =
  | "drhp"
  | "rhp"
  | "prospectus"
  | "presentation"
  | "financials"
  | "notice"
  | "other";

export type IPORiskSeverity = "low" | "medium" | "high";

export type IPOSentiment = "positive" | "neutral" | "negative" | "cautious";

export type IPOVerificationStatus =
  | "unverified"
  | "verified"
  | "official"
  | "estimated";

export type IPOSatementType = "consolidated" | "standalone";

export type IPOAuditStatus = "audited" | "unaudited" | "restated";

export type ApplicantRelationship =
  | "self"
  | "father"
  | "mother"
  | "spouse"
  | "son"
  | "daughter"
  | "brother"
  | "sister"
  | "friend"
  | "other";

export type InvestorCategory =
  | "retail"
  | "s_hni"
  | "b_hni"
  | "employee"
  | "shareholder";

export type ApplicationStatus =
  | "draft"
  | "applied"
  | "mandate_pending"
  | "mandate_approved"
  | "funds_blocked"
  | "bidding_closed"
  | "allotment_pending"
  | "allotted"
  | "partially_allotted"
  | "not_allotted"
  | "refund_pending"
  | "refund_completed"
  | "funds_unblocked"
  | "completed"
  | "cancelled";

export type MandateStatus =
  | "not_required"
  | "created"
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "cancelled"
  | "blocked"
  | "unblocked";

export type AllotmentStatus =
  | "pending"
  | "allotted"
  | "partially_allotted"
  | "not_allotted";

export type ApplicationEventType =
  | "application_created"
  | "bid_added"
  | "bid_updated"
  | "mandate_pending"
  | "mandate_requested"
  | "mandate_approved"
  | "mandate_rejected"
  | "funds_blocked"
  | "bidding_closed"
  | "allotment_pending"
  | "allotment_processed"
  | "allotted"
  | "partially_allotted"
  | "not_allotted"
  | "refund_pending"
  | "refund_completed"
  | "funds_unblocked"
  | "completed"
  | "cancelled";

export type AccountClassification = "asset" | "liability" | "equity" | "revenue" | "expense";
export type JournalStatus = "draft" | "posted" | "reversed";
export type JournalType =
  | "opening_balance"
  | "capital_deposit"
  | "capital_withdrawal"
  | "ipo_funds_blocked"
  | "ipo_funds_unblocked"
  | "ipo_allotment_debit"
  | "security_sale"
  | "reversal"
  | "manual_adjustment";
export type InvestmentTransactionType =
  | "ipo_allotment"
  | "secondary_purchase"
  | "secondary_sale"
  | "bonus_shares"
  | "split_adjustment"
  | "external_holding";
export type FundingOwnerType = "user_personal" | "applicant_direct" | "family_pool" | "external_tracked";
export type OwnershipCategory = "user_personal" | "applicant_direct" | "family_pool" | "external_tracked";
export type FinanceBackfillState = "verified" | "partially_verified" | "unverified" | "not_migrated";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          role: UserRole;
          phone: string | null;
          preferred_theme: string;
          is_suspended: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          role?: UserRole;
          phone?: string | null;
          preferred_theme?: string;
          is_suspended?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          role?: UserRole;
          phone?: string | null;
          preferred_theme?: string;
          is_suspended?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      ipos: {
        Row: {
          id: string;
          slug: string;
          company_name: string;
          symbol: string | null;
          company_logo: string | null;
          category: IPOCategory;
          issue_type: IPOIssueType;
          status: IPOStatus;
          publication_status: IPOPublicationStatus;
          price_band_low: number | null;
          price_band_high: number | null;
          face_value: number | null;
          lot_size: number;
          min_investment: number | null;
          issue_size_cr: number | null;
          fresh_issue_cr: number | null;
          ofs_cr: number | null;
          shares_offered: number | null;
          retail_quota_pct: number | null;
          qib_quota_pct: number | null;
          hni_quota_pct: number | null;
          exchange: string | null;
          lead_managers: string[] | null;
          registrar_name: string | null;
          announcement_date: string | null;
          open_date: string | null;
          close_date: string | null;
          allotment_date: string | null;
          refund_date: string | null;
          listing_date: string | null;
          listing_price: number | null;
          about_company: string | null;
          created_by: string | null;
          approved_by: string | null;
          published_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          company_name: string;
          symbol?: string | null;
          company_logo?: string | null;
          category?: IPOCategory;
          issue_type?: IPOIssueType;
          status?: IPOStatus;
          publication_status?: IPOPublicationStatus;
          price_band_low?: number | null;
          price_band_high?: number | null;
          face_value?: number | null;
          lot_size?: number;
          min_investment?: number | null;
          issue_size_cr?: number | null;
          fresh_issue_cr?: number | null;
          ofs_cr?: number | null;
          shares_offered?: number | null;
          retail_quota_pct?: number | null;
          qib_quota_pct?: number | null;
          hni_quota_pct?: number | null;
          exchange?: string | null;
          lead_managers?: string[] | null;
          registrar_name?: string | null;
          announcement_date?: string | null;
          open_date?: string | null;
          close_date?: string | null;
          allotment_date?: string | null;
          refund_date?: string | null;
          listing_date?: string | null;
          listing_price?: number | null;
          about_company?: string | null;
          created_by?: string | null;
          approved_by?: string | null;
          published_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          company_name?: string;
          symbol?: string | null;
          company_logo?: string | null;
          category?: IPOCategory;
          issue_type?: IPOIssueType;
          status?: IPOStatus;
          publication_status?: IPOPublicationStatus;
          price_band_low?: number | null;
          price_band_high?: number | null;
          face_value?: number | null;
          lot_size?: number;
          min_investment?: number | null;
          issue_size_cr?: number | null;
          fresh_issue_cr?: number | null;
          ofs_cr?: number | null;
          shares_offered?: number | null;
          retail_quota_pct?: number | null;
          qib_quota_pct?: number | null;
          hni_quota_pct?: number | null;
          exchange?: string | null;
          lead_managers?: string[] | null;
          registrar_name?: string | null;
          announcement_date?: string | null;
          open_date?: string | null;
          close_date?: string | null;
          allotment_date?: string | null;
          refund_date?: string | null;
          listing_date?: string | null;
          listing_price?: number | null;
          about_company?: string | null;
          created_by?: string | null;
          approved_by?: string | null;
          published_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      ipo_events: {
        Row: {
          id: string;
          ipo_id: string;
          event_type: IPOEventType;
          title: string;
          event_date: string;
          description: string | null;
          is_completed: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          ipo_id: string;
          event_type: IPOEventType;
          title: string;
          event_date: string;
          description?: string | null;
          is_completed?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          ipo_id?: string;
          event_type?: IPOEventType;
          title?: string;
          event_date?: string;
          description?: string | null;
          is_completed?: boolean;
          created_at?: string;
        };
      };
      ipo_business_profiles: {
        Row: {
          id: string;
          ipo_id: string;
          company_overview: string | null;
          industry: string | null;
          business_model: string | null;
          products_services: string[];
          competitive_strengths: string[];
          geographic_presence: string | null;
          key_customers: string | null;
          source: string;
          source_url: string | null;
          as_of: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          ipo_id: string;
          company_overview?: string | null;
          industry?: string | null;
          business_model?: string | null;
          products_services?: string[];
          competitive_strengths?: string[];
          geographic_presence?: string | null;
          key_customers?: string | null;
          source?: string;
          source_url?: string | null;
          as_of?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          ipo_id?: string;
          company_overview?: string | null;
          industry?: string | null;
          business_model?: string | null;
          products_services?: string[];
          competitive_strengths?: string[];
          geographic_presence?: string | null;
          key_customers?: string | null;
          source?: string;
          source_url?: string | null;
          as_of?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      ipo_financials: {
        Row: {
          id: string;
          ipo_id: string;
          financial_year: string;
          period_type: string;
          statement_type: IPOSatementType;
          audit_status: IPOAuditStatus;
          currency: string;
          unit: string;
          revenue_cr: number | null;
          revenue_growth_pct: number | null;
          ebitda_cr: number | null;
          ebitda_margin_pct: number | null;
          pat_cr: number | null;
          pat_margin_pct: number | null;
          eps: number | null;
          roe_pct: number | null;
          roce_pct: number | null;
          total_assets_cr: number | null;
          total_debt_cr: number | null;
          net_worth_cr: number | null;
          operating_cash_flow_cr: number | null;
          free_cash_flow_cr: number | null;
          is_derived: boolean;
          source: string;
          source_url: string | null;
          as_of: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          ipo_id: string;
          financial_year: string;
          period_type?: string;
          statement_type?: IPOSatementType;
          audit_status?: IPOAuditStatus;
          currency?: string;
          unit?: string;
          revenue_cr?: number | null;
          revenue_growth_pct?: number | null;
          ebitda_cr?: number | null;
          ebitda_margin_pct?: number | null;
          pat_cr?: number | null;
          pat_margin_pct?: number | null;
          eps?: number | null;
          roe_pct?: number | null;
          roce_pct?: number | null;
          total_assets_cr?: number | null;
          total_debt_cr?: number | null;
          net_worth_cr?: number | null;
          operating_cash_flow_cr?: number | null;
          free_cash_flow_cr?: number | null;
          is_derived?: boolean;
          source?: string;
          source_url?: string | null;
          as_of?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          ipo_id?: string;
          financial_year?: string;
          period_type?: string;
          statement_type?: IPOSatementType;
          audit_status?: IPOAuditStatus;
          currency?: string;
          unit?: string;
          revenue_cr?: number | null;
          revenue_growth_pct?: number | null;
          ebitda_cr?: number | null;
          ebitda_margin_pct?: number | null;
          pat_cr?: number | null;
          pat_margin_pct?: number | null;
          eps?: number | null;
          roe_pct?: number | null;
          roce_pct?: number | null;
          total_assets_cr?: number | null;
          total_debt_cr?: number | null;
          net_worth_cr?: number | null;
          operating_cash_flow_cr?: number | null;
          free_cash_flow_cr?: number | null;
          is_derived?: boolean;
          source?: string;
          source_url?: string | null;
          as_of?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      ipo_valuations: {
        Row: {
          id: string;
          ipo_id: string;
          pe_ratio_low: number | null;
          pe_ratio_high: number | null;
          pb_ratio: number | null;
          ev_ebitda: number | null;
          market_cap_cr: number | null;
          post_issue_shares_cr: number | null;
          eps_diluted: number | null;
          industry_pe_median: number | null;
          valuation_summary: string | null;
          source: string;
          as_of: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          ipo_id: string;
          pe_ratio_low?: number | null;
          pe_ratio_high?: number | null;
          pb_ratio?: number | null;
          ev_ebitda?: number | null;
          market_cap_cr?: number | null;
          post_issue_shares_cr?: number | null;
          eps_diluted?: number | null;
          industry_pe_median?: number | null;
          valuation_summary?: string | null;
          source?: string;
          as_of?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          ipo_id?: string;
          pe_ratio_low?: number | null;
          pe_ratio_high?: number | null;
          pb_ratio?: number | null;
          ev_ebitda?: number | null;
          market_cap_cr?: number | null;
          post_issue_shares_cr?: number | null;
          eps_diluted?: number | null;
          industry_pe_median?: number | null;
          valuation_summary?: string | null;
          source?: string;
          as_of?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      ipo_peers: {
        Row: {
          id: string;
          ipo_id: string;
          peer_company_name: string;
          peer_symbol: string | null;
          market_cap_cr: number | null;
          revenue_cr: number | null;
          pat_cr: number | null;
          eps: number | null;
          pe_ratio: number | null;
          pb_ratio: number | null;
          roe_pct: number | null;
          roce_pct: number | null;
          debt_to_equity: number | null;
          source: string;
          as_of: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          ipo_id: string;
          peer_company_name: string;
          peer_symbol?: string | null;
          market_cap_cr?: number | null;
          revenue_cr?: number | null;
          pat_cr?: number | null;
          eps?: number | null;
          pe_ratio?: number | null;
          pb_ratio?: number | null;
          roe_pct?: number | null;
          roce_pct?: number | null;
          debt_to_equity?: number | null;
          source?: string;
          as_of?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          ipo_id?: string;
          peer_company_name?: string;
          peer_symbol?: string | null;
          market_cap_cr?: number | null;
          revenue_cr?: number | null;
          pat_cr?: number | null;
          eps?: number | null;
          pe_ratio?: number | null;
          pb_ratio?: number | null;
          roe_pct?: number | null;
          roce_pct?: number | null;
          debt_to_equity?: number | null;
          source?: string;
          as_of?: string | null;
          created_at?: string;
        };
      };
      ipo_promoters: {
        Row: {
          id: string;
          ipo_id: string;
          promoter_name: string;
          holding_pre_pct: number | null;
          holding_post_pct: number | null;
          designation: string | null;
          bio: string | null;
          source: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          ipo_id: string;
          promoter_name: string;
          holding_pre_pct?: number | null;
          holding_post_pct?: number | null;
          designation?: string | null;
          bio?: string | null;
          source?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          ipo_id?: string;
          promoter_name?: string;
          holding_pre_pct?: number | null;
          holding_post_pct?: number | null;
          designation?: string | null;
          bio?: string | null;
          source?: string;
          created_at?: string;
        };
      };
      ipo_strengths: {
        Row: {
          id: string;
          ipo_id: string;
          title: string;
          description: string | null;
          category: string | null;
          display_order: number;
          source: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          ipo_id: string;
          title: string;
          description?: string | null;
          category?: string | null;
          display_order?: number;
          source?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          ipo_id?: string;
          title?: string;
          description?: string | null;
          category?: string | null;
          display_order?: number;
          source?: string;
          created_at?: string;
        };
      };
      ipo_risks: {
        Row: {
          id: string;
          ipo_id: string;
          title: string;
          description: string | null;
          severity: IPORiskSeverity;
          category: string | null;
          display_order: number;
          source: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          ipo_id: string;
          title: string;
          description?: string | null;
          severity?: IPORiskSeverity;
          category?: string | null;
          display_order?: number;
          source?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          ipo_id?: string;
          title?: string;
          description?: string | null;
          severity?: IPORiskSeverity;
          category?: string | null;
          display_order?: number;
          source?: string;
          created_at?: string;
        };
      };
      ipo_gmp_entries: {
        Row: {
          id: string;
          ipo_id: string;
          gmp_value: number;
          gmp_percentage: number | null;
          estimated_listing_price: number | null;
          estimated_listing_gain_pct: number | null;
          confidence_level: IPOVerificationStatus;
          observed_at: string;
          source: string;
          source_url: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          ipo_id: string;
          gmp_value: number;
          gmp_percentage?: number | null;
          estimated_listing_price?: number | null;
          estimated_listing_gain_pct?: number | null;
          confidence_level?: IPOVerificationStatus;
          observed_at?: string;
          source?: string;
          source_url?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          ipo_id?: string;
          gmp_value?: number;
          gmp_percentage?: number | null;
          estimated_listing_price?: number | null;
          estimated_listing_gain_pct?: number | null;
          confidence_level?: IPOVerificationStatus;
          observed_at?: string;
          source?: string;
          source_url?: string | null;
          notes?: string | null;
          created_at?: string;
        };
      };
      ipo_subscription_snapshots: {
        Row: {
          id: string;
          ipo_id: string;
          day_number: number;
          snapshot_date: string;
          snapshot_time: string;
          qib_x: number | null;
          nii_x: number | null;
          nii_bighni_x: number | null;
          nii_smallhni_x: number | null;
          retail_x: number | null;
          employee_x: number | null;
          overall_x: number;
          total_bids_count: number | null;
          total_shares_offered: number | null;
          source: string;
          as_of: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          ipo_id: string;
          day_number: number;
          snapshot_date: string;
          snapshot_time?: string;
          qib_x?: number | null;
          nii_x?: number | null;
          nii_bighni_x?: number | null;
          nii_smallhni_x?: number | null;
          retail_x?: number | null;
          employee_x?: number | null;
          overall_x: number;
          total_bids_count?: number | null;
          total_shares_offered?: number | null;
          source?: string;
          as_of?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          ipo_id?: string;
          day_number?: number;
          snapshot_date?: string;
          snapshot_time?: string;
          qib_x?: number | null;
          nii_x?: number | null;
          nii_bighni_x?: number | null;
          nii_smallhni_x?: number | null;
          retail_x?: number | null;
          employee_x?: number | null;
          overall_x?: number;
          total_bids_count?: number | null;
          total_shares_offered?: number | null;
          source?: string;
          as_of?: string | null;
          created_at?: string;
        };
      };
      ipo_scores: {
        Row: {
          id: string;
          ipo_id: string;
          score_version: string;
          overall_score: number;
          financial_health_score: number;
          financial_health_max: number;
          valuation_score: number;
          valuation_max: number;
          issue_structure_score: number;
          issue_structure_max: number;
          market_sentiment_score: number;
          market_sentiment_max: number;
          subscription_demand_score: number;
          subscription_demand_max: number;
          industry_risk_score: number;
          industry_risk_max: number;
          is_insufficient_data: boolean;
          missing_categories: string[];
          methodology_summary: string | null;
          breakdown_json: Json;
          calculated_at: string;
          is_published: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          ipo_id: string;
          score_version?: string;
          overall_score: number;
          financial_health_score: number;
          financial_health_max?: number;
          valuation_score: number;
          valuation_max?: number;
          issue_structure_score: number;
          issue_structure_max?: number;
          market_sentiment_score: number;
          market_sentiment_max?: number;
          subscription_demand_score: number;
          subscription_demand_max?: number;
          industry_risk_score: number;
          industry_risk_max?: number;
          is_insufficient_data?: boolean;
          missing_categories?: string[];
          methodology_summary?: string | null;
          breakdown_json?: Json;
          calculated_at?: string;
          is_published?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          ipo_id?: string;
          score_version?: string;
          overall_score?: number;
          financial_health_score?: number;
          financial_health_max?: number;
          valuation_score?: number;
          valuation_max?: number;
          issue_structure_score?: number;
          issue_structure_max?: number;
          market_sentiment_score?: number;
          market_sentiment_max?: number;
          subscription_demand_score?: number;
          subscription_demand_max?: number;
          industry_risk_score?: number;
          industry_risk_max?: number;
          is_insufficient_data?: boolean;
          missing_categories?: string[];
          methodology_summary?: string | null;
          breakdown_json?: Json;
          calculated_at?: string;
          is_published?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      ipo_documents: {
        Row: {
          id: string;
          ipo_id: string;
          title: string;
          document_type: IPODocType;
          file_url: string;
          is_public: boolean;
          file_size_bytes: number | null;
          source: string;
          published_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          ipo_id: string;
          title: string;
          document_type?: IPODocType;
          file_url: string;
          is_public?: boolean;
          file_size_bytes?: number | null;
          source?: string;
          published_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          ipo_id?: string;
          title?: string;
          document_type?: IPODocType;
          file_url?: string;
          is_public?: boolean;
          file_size_bytes?: number | null;
          source?: string;
          published_at?: string | null;
          created_at?: string;
        };
      };
      ipo_news: {
        Row: {
          id: string;
          ipo_id: string;
          headline: string;
          summary: string | null;
          source: string;
          source_url: string | null;
          sentiment: IPOSentiment;
          published_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          ipo_id: string;
          headline: string;
          summary?: string | null;
          source: string;
          source_url?: string | null;
          sentiment?: IPOSentiment;
          published_at: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          ipo_id?: string;
          headline?: string;
          summary?: string | null;
          source?: string;
          source_url?: string | null;
          sentiment?: IPOSentiment;
          published_at?: string;
          created_at?: string;
        };
      };
      audit_logs: {
        Row: {
          id: string;
          actor_id: string | null;
          action: string;
          resource_type: string;
          resource_id: string | null;
          old_values: Json | null;
          new_values: Json | null;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_id?: string | null;
          action: string;
          resource_type: string;
          resource_id?: string | null;
          old_values?: Json | null;
          new_values?: Json | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          actor_id?: string | null;
          action?: string;
          resource_type?: string;
          resource_id?: string | null;
          old_values?: Json | null;
          new_values?: Json | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
      };
      applicant_profiles: {
        Row: {
          id: string;
          user_id: string;
          relationship: ApplicantRelationship;
          display_name: string;
          pan_masked: string;
          demat_dp_id_masked: string | null;
          demat_account_no_masked: string | null;
          upi_id_masked: string | null;
          default_category: InvestorCategory;
          notes: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          relationship?: ApplicantRelationship;
          display_name: string;
          pan_masked: string;
          demat_dp_id_masked?: string | null;
          demat_account_no_masked?: string | null;
          upi_id_masked?: string | null;
          default_category?: InvestorCategory;
          notes?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          relationship?: ApplicantRelationship;
          display_name?: string;
          pan_masked?: string;
          demat_dp_id_masked?: string | null;
          demat_account_no_masked?: string | null;
          upi_id_masked?: string | null;
          default_category?: InvestorCategory;
          notes?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      ipo_applications: {
        Row: {
          id: string;
          user_id: string;
          ipo_id: string;
          applicant_id: string;
          application_number: string;
          investor_category: InvestorCategory;
          status: ApplicationStatus;
          applied_at: string;
          total_lots: number;
          total_quantity: number;
          bid_price: number;
          is_cutoff: boolean;
          application_amount: number;
          mandate_amount: number;
          blocked_amount: number;
          allotment_amount: number;
          refund_amount: number;
          currency: string;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          ipo_id: string;
          applicant_id: string;
          application_number: string;
          investor_category?: InvestorCategory;
          status?: ApplicationStatus;
          applied_at?: string;
          total_lots: number;
          total_quantity: number;
          bid_price: number;
          is_cutoff?: boolean;
          application_amount: number;
          mandate_amount?: number;
          blocked_amount?: number;
          allotment_amount?: number;
          refund_amount?: number;
          currency?: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          ipo_id?: string;
          applicant_id?: string;
          application_number?: string;
          investor_category?: InvestorCategory;
          status?: ApplicationStatus;
          applied_at?: string;
          total_lots?: number;
          total_quantity?: number;
          bid_price?: number;
          is_cutoff?: boolean;
          application_amount?: number;
          mandate_amount?: number;
          blocked_amount?: number;
          allotment_amount?: number;
          refund_amount?: number;
          currency?: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      ipo_application_bids: {
        Row: {
          id: string;
          application_id: string;
          bid_number: number;
          lot_count: number;
          quantity: number;
          price: number;
          is_cutoff: boolean;
          amount: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          application_id: string;
          bid_number: number;
          lot_count: number;
          quantity: number;
          price: number;
          is_cutoff?: boolean;
          amount: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          application_id?: string;
          bid_number?: number;
          lot_count?: number;
          quantity?: number;
          price?: number;
          is_cutoff?: boolean;
          amount?: number;
          created_at?: string;
        };
      };
      ipo_application_mandates: {
        Row: {
          id: string;
          application_id: string;
          provider: string;
          provider_reference: string | null;
          upi_id_masked: string | null;
          mandate_status: MandateStatus;
          requested_amount: number;
          blocked_amount: number;
          created_at: string;
          approved_at: string | null;
          rejected_at: string | null;
          unblocked_at: string | null;
          expiry_at: string | null;
          failure_reason: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          application_id: string;
          provider?: string;
          provider_reference?: string | null;
          upi_id_masked?: string | null;
          mandate_status?: MandateStatus;
          requested_amount: number;
          blocked_amount?: number;
          created_at?: string;
          approved_at?: string | null;
          rejected_at?: string | null;
          unblocked_at?: string | null;
          expiry_at?: string | null;
          failure_reason?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          application_id?: string;
          provider?: string;
          provider_reference?: string | null;
          upi_id_masked?: string | null;
          mandate_status?: MandateStatus;
          requested_amount?: number;
          blocked_amount?: number;
          created_at?: string;
          approved_at?: string | null;
          rejected_at?: string | null;
          unblocked_at?: string | null;
          expiry_at?: string | null;
          failure_reason?: string | null;
          updated_at?: string;
        };
      };
      ipo_application_allotments: {
        Row: {
          id: string;
          application_id: string;
          allotment_status: AllotmentStatus;
          shares_applied: number;
          shares_allotted: number;
          lots_applied: number;
          lots_allotted: number;
          allotment_price: number | null;
          allotment_amount: number;
          refund_amount: number;
          basis_of_allotment_ref: string | null;
          processed_at: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          application_id: string;
          allotment_status?: AllotmentStatus;
          shares_applied: number;
          shares_allotted?: number;
          lots_applied: number;
          lots_allotted?: number;
          allotment_price?: number | null;
          allotment_amount?: number;
          refund_amount?: number;
          basis_of_allotment_ref?: string | null;
          processed_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          application_id?: string;
          allotment_status?: AllotmentStatus;
          shares_applied?: number;
          shares_allotted?: number;
          lots_applied?: number;
          lots_allotted?: number;
          allotment_price?: number | null;
          allotment_amount?: number;
          refund_amount?: number;
          basis_of_allotment_ref?: string | null;
          processed_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      ipo_application_events: {
        Row: {
          id: string;
          application_id: string;
          event_type: ApplicationEventType;
          description: string;
          actor_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          application_id: string;
          event_type: ApplicationEventType;
          description: string;
          actor_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          application_id?: string;
          event_type?: ApplicationEventType;
          description?: string;
          actor_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
      };
      watchlist_items: {
        Row: {
          id: string;
          user_id: string;
          ipo_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          ipo_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          ipo_id?: string;
          created_at?: string;
        };
      };
      financial_accounts: {
        Row: {
          id: string;
          user_id: string;
          account_code: string;
          account_name: string;
          classification: AccountClassification;
          ownership_category: OwnershipCategory;
          beneficial_applicant_id: string | null;
          currency: string;
          is_system_account: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          account_code: string;
          account_name: string;
          classification: AccountClassification;
          ownership_category?: OwnershipCategory;
          beneficial_applicant_id?: string | null;
          currency?: string;
          is_system_account?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          account_code?: string;
          account_name?: string;
          classification?: AccountClassification;
          ownership_category?: OwnershipCategory;
          beneficial_applicant_id?: string | null;
          currency?: string;
          is_system_account?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      journal_entries: {
        Row: {
          id: string;
          user_id: string;
          journal_number: string;
          idempotency_key: string;
          status: JournalStatus;
          journal_type: JournalType;
          reference_type: string;
          reference_id: string | null;
          transaction_date: string;
          narration: string;
          reverses_journal_id: string | null;
          reversed_by_journal_id: string | null;
          reversal_reason: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          journal_number: string;
          idempotency_key: string;
          status?: JournalStatus;
          journal_type: JournalType;
          reference_type: string;
          reference_id?: string | null;
          transaction_date: string;
          narration: string;
          reverses_journal_id?: string | null;
          reversed_by_journal_id?: string | null;
          reversal_reason?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          journal_number?: string;
          idempotency_key?: string;
          status?: JournalStatus;
          journal_type?: JournalType;
          reference_type?: string;
          reference_id?: string | null;
          transaction_date?: string;
          narration?: string;
          reverses_journal_id?: string | null;
          reversed_by_journal_id?: string | null;
          reversal_reason?: string | null;
          metadata?: Json;
          created_at?: string;
        };
      };
      journal_lines: {
        Row: {
          id: string;
          journal_id: string;
          account_id: string;
          applicant_id: string | null;
          debit: number;
          credit: number;
          currency: string;
          line_narration: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          journal_id: string;
          account_id: string;
          applicant_id?: string | null;
          debit?: number;
          credit?: number;
          currency?: string;
          line_narration?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          journal_id?: string;
          account_id?: string;
          applicant_id?: string | null;
          debit?: number;
          credit?: number;
          currency?: string;
          line_narration?: string | null;
          created_at?: string;
        };
      };
      securities: {
        Row: {
          id: string;
          ipo_id: string | null;
          isin: string | null;
          symbol: string;
          exchange: string;
          company_name: string;
          face_value: number | null;
          lot_size: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          ipo_id?: string | null;
          isin?: string | null;
          symbol: string;
          exchange?: string;
          company_name: string;
          face_value?: number | null;
          lot_size?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          ipo_id?: string | null;
          isin?: string | null;
          symbol?: string;
          exchange?: string;
          company_name?: string;
          face_value?: number | null;
          lot_size?: number;
          created_at?: string;
        };
      };
      investment_transactions: {
        Row: {
          id: string;
          user_id: string;
          applicant_id: string | null;
          security_id: string;
          application_id: string | null;
          journal_id: string | null;
          idempotency_key: string;
          transaction_type: InvestmentTransactionType;
          funding_owner_type: FundingOwnerType;
          transaction_date: string;
          quantity: number;
          price_per_share: number;
          gross_amount: number;
          fees: number;
          net_amount: number;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          applicant_id?: string | null;
          security_id: string;
          application_id?: string | null;
          journal_id?: string | null;
          idempotency_key: string;
          transaction_type: InvestmentTransactionType;
          funding_owner_type?: FundingOwnerType;
          transaction_date: string;
          quantity: number;
          price_per_share: number;
          gross_amount: number;
          fees?: number;
          net_amount: number;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          applicant_id?: string | null;
          security_id?: string;
          application_id?: string | null;
          journal_id?: string | null;
          idempotency_key?: string;
          transaction_type?: InvestmentTransactionType;
          funding_owner_type?: FundingOwnerType;
          transaction_date?: string;
          quantity?: number;
          price_per_share?: number;
          gross_amount?: number;
          fees?: number;
          net_amount?: number;
          notes?: string | null;
          created_at?: string;
        };
      };
      portfolio_positions: {
        Row: {
          id: string;
          user_id: string;
          applicant_id: string | null;
          security_id: string;
          quantity: number;
          average_cost_price: number;
          total_invested_cost: number;
          realized_pnl: number;
          is_external_tracked: boolean;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          applicant_id?: string | null;
          security_id: string;
          quantity?: number;
          average_cost_price?: number;
          total_invested_cost?: number;
          realized_pnl?: number;
          is_external_tracked?: boolean;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          applicant_id?: string | null;
          security_id?: string;
          quantity?: number;
          average_cost_price?: number;
          total_invested_cost?: number;
          realized_pnl?: number;
          is_external_tracked?: boolean;
          updated_at?: string;
        };
      };
      security_prices: {
        Row: {
          id: string;
          security_id: string;
          price: number;
          day_open: number | null;
          day_high: number | null;
          day_low: number | null;
          previous_close: number | null;
          source: string;
          is_verified: boolean;
          captured_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          security_id: string;
          price: number;
          day_open?: number | null;
          day_high?: number | null;
          day_low?: number | null;
          previous_close?: number | null;
          source?: string;
          is_verified?: boolean;
          captured_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          security_id?: string;
          price?: number;
          day_open?: number | null;
          day_high?: number | null;
          day_low?: number | null;
          previous_close?: number | null;
          source?: string;
          is_verified?: boolean;
          captured_at?: string;
          created_at?: string;
        };
      };
      finance_processed_events: {
        Row: {
          event_id: string;
          event_type: string;
          reference_id: string | null;
          payload: Json;
          processed_at: string;
        };
        Insert: {
          event_id: string;
          event_type: string;
          reference_id?: string | null;
          payload?: Json;
          processed_at?: string;
        };
        Update: {
          event_id?: string;
          event_type?: string;
          reference_id?: string | null;
          payload?: Json;
          processed_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_current_user_role: {
        Args: Record<PropertyKey, never>;
        Returns: UserRole;
      };
      is_admin_or_super: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_editor_or_above: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      post_journal_entry_atomic: {
        Args: {
          p_user_id: string;
          p_journal_number: string;
          p_idempotency_key: string;
          p_journal_type: JournalType;
          p_reference_type: string;
          p_reference_id: string | null;
          p_transaction_date: string;
          p_narration: string;
          p_lines: Json;
          p_metadata?: Json;
        };
        Returns: string;
      };
    };
    Enums: {
      user_role: UserRole;
      ipo_category: IPOCategory;
      ipo_issue_type: IPOIssueType;
      ipo_status: IPOStatus;
      ipo_publication_status: IPOPublicationStatus;
      ipo_event_type: IPOEventType;
      ipo_doc_type: IPODocType;
      ipo_risk_severity: IPORiskSeverity;
      ipo_sentiment: IPOSentiment;
      ipo_verification_status: IPOVerificationStatus;
      ipo_statement_type: IPOSatementType;
      ipo_audit_status: IPOAuditStatus;
      applicant_relationship: ApplicantRelationship;
      investor_category: InvestorCategory;
      application_status: ApplicationStatus;
      mandate_status: MandateStatus;
      allotment_status: AllotmentStatus;
      application_event_type: ApplicationEventType;
      account_classification: AccountClassification;
      journal_status: JournalStatus;
      journal_type: JournalType;
      investment_transaction_type: InvestmentTransactionType;
      funding_owner_type: FundingOwnerType;
      ownership_category: OwnershipCategory;
      finance_backfill_state: FinanceBackfillState;
    };
  };
}
