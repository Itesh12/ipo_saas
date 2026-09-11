-- ============================================================================
-- Phase 3: IPO Research & Intelligence Migration
-- Creates normalized research tables, provenance fields, and RLS policies
-- ============================================================================

-- 1. Create Enums
DO $$ BEGIN
  CREATE TYPE ipo_doc_type AS ENUM (
    'drhp',
    'rhp',
    'prospectus',
    'presentation',
    'financials',
    'notice',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE ipo_risk_severity AS ENUM (
    'low',
    'medium',
    'high'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE ipo_sentiment AS ENUM (
    'positive',
    'neutral',
    'negative',
    'cautious'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE ipo_verification_status AS ENUM (
    'unverified',
    'verified',
    'official',
    'estimated'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE ipo_statement_type AS ENUM (
    'consolidated',
    'standalone'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE ipo_audit_status AS ENUM (
    'audited',
    'unaudited',
    'restated'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Business Profiles Table
CREATE TABLE IF NOT EXISTS ipo_business_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ipo_id UUID NOT NULL REFERENCES ipos(id) ON DELETE CASCADE UNIQUE,
  company_overview TEXT,
  industry TEXT,
  business_model TEXT,
  products_services TEXT[] DEFAULT '{}',
  competitive_strengths TEXT[] DEFAULT '{}',
  geographic_presence TEXT,
  key_customers TEXT,
  source TEXT NOT NULL DEFAULT 'Official RHP Filing',
  source_url TEXT,
  as_of TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Financials Table
CREATE TABLE IF NOT EXISTS ipo_financials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ipo_id UUID NOT NULL REFERENCES ipos(id) ON DELETE CASCADE,
  financial_year TEXT NOT NULL,
  period_type TEXT NOT NULL DEFAULT 'full_year',
  statement_type ipo_statement_type NOT NULL DEFAULT 'consolidated',
  audit_status ipo_audit_status NOT NULL DEFAULT 'restated',
  currency TEXT NOT NULL DEFAULT 'INR',
  unit TEXT NOT NULL DEFAULT 'Crores',
  revenue_cr NUMERIC(15,2),
  revenue_growth_pct NUMERIC(8,2),
  ebitda_cr NUMERIC(15,2),
  ebitda_margin_pct NUMERIC(8,2),
  pat_cr NUMERIC(15,2),
  pat_margin_pct NUMERIC(8,2),
  eps NUMERIC(10,2),
  roe_pct NUMERIC(8,2),
  roce_pct NUMERIC(8,2),
  total_assets_cr NUMERIC(15,2),
  total_debt_cr NUMERIC(15,2),
  net_worth_cr NUMERIC(15,2),
  operating_cash_flow_cr NUMERIC(15,2),
  free_cash_flow_cr NUMERIC(15,2),
  is_derived BOOLEAN NOT NULL DEFAULT FALSE,
  source TEXT NOT NULL DEFAULT 'RHP Financial Statements',
  source_url TEXT,
  as_of TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(ipo_id, financial_year, statement_type)
);

-- 4. Valuations Table
CREATE TABLE IF NOT EXISTS ipo_valuations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ipo_id UUID NOT NULL REFERENCES ipos(id) ON DELETE CASCADE UNIQUE,
  pe_ratio_low NUMERIC(10,2),
  pe_ratio_high NUMERIC(10,2),
  pb_ratio NUMERIC(10,2),
  ev_ebitda NUMERIC(10,2),
  market_cap_cr NUMERIC(15,2),
  post_issue_shares_cr NUMERIC(12,4),
  eps_diluted NUMERIC(10,2),
  industry_pe_median NUMERIC(10,2),
  valuation_summary TEXT,
  source TEXT NOT NULL DEFAULT 'RHP / Platform Calculations',
  as_of TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Peers Table
CREATE TABLE IF NOT EXISTS ipo_peers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ipo_id UUID NOT NULL REFERENCES ipos(id) ON DELETE CASCADE,
  peer_company_name TEXT NOT NULL,
  peer_symbol TEXT,
  market_cap_cr NUMERIC(15,2),
  revenue_cr NUMERIC(15,2),
  pat_cr NUMERIC(15,2),
  eps NUMERIC(10,2),
  pe_ratio NUMERIC(10,2),
  pb_ratio NUMERIC(10,2),
  roe_pct NUMERIC(8,2),
  roce_pct NUMERIC(8,2),
  debt_to_equity NUMERIC(8,2),
  source TEXT NOT NULL DEFAULT 'Exchange / Financial Reports',
  as_of TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Promoters Table
CREATE TABLE IF NOT EXISTS ipo_promoters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ipo_id UUID NOT NULL REFERENCES ipos(id) ON DELETE CASCADE,
  promoter_name TEXT NOT NULL,
  holding_pre_pct NUMERIC(6,2),
  holding_post_pct NUMERIC(6,2),
  designation TEXT,
  bio TEXT,
  source TEXT NOT NULL DEFAULT 'RHP Capital Structure',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Strengths Table
CREATE TABLE IF NOT EXISTS ipo_strengths (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ipo_id UUID NOT NULL REFERENCES ipos(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'Internal Research / RHP',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Risks Table
CREATE TABLE IF NOT EXISTS ipo_risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ipo_id UUID NOT NULL REFERENCES ipos(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  severity ipo_risk_severity NOT NULL DEFAULT 'medium',
  category TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'RHP Risk Factors',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. GMP Entries Table
CREATE TABLE IF NOT EXISTS ipo_gmp_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ipo_id UUID NOT NULL REFERENCES ipos(id) ON DELETE CASCADE,
  gmp_value NUMERIC(10,2) NOT NULL,
  gmp_percentage NUMERIC(8,2),
  estimated_listing_price NUMERIC(12,2),
  estimated_listing_gain_pct NUMERIC(8,2),
  confidence_level ipo_verification_status NOT NULL DEFAULT 'unverified',
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL DEFAULT 'Market Intelligence (Unofficial)',
  source_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Subscription Snapshots Table
CREATE TABLE IF NOT EXISTS ipo_subscription_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ipo_id UUID NOT NULL REFERENCES ipos(id) ON DELETE CASCADE,
  day_number INTEGER NOT NULL,
  snapshot_date DATE NOT NULL,
  snapshot_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  qib_x NUMERIC(10,2),
  nii_x NUMERIC(10,2),
  nii_bighni_x NUMERIC(10,2),
  nii_smallhni_x NUMERIC(10,2),
  retail_x NUMERIC(10,2),
  employee_x NUMERIC(10,2),
  overall_x NUMERIC(10,2) NOT NULL,
  total_bids_count BIGINT,
  total_shares_offered BIGINT,
  source TEXT NOT NULL DEFAULT 'BSE / NSE Cumulative Feed',
  as_of TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(ipo_id, day_number, snapshot_date)
);

-- 11. IPO Scores Table
CREATE TABLE IF NOT EXISTS ipo_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ipo_id UUID NOT NULL REFERENCES ipos(id) ON DELETE CASCADE UNIQUE,
  score_version TEXT NOT NULL DEFAULT 'v1.0-standard',
  overall_score NUMERIC(5,2) NOT NULL,
  financial_health_score NUMERIC(5,2) NOT NULL,
  financial_health_max NUMERIC(5,2) NOT NULL DEFAULT 25,
  valuation_score NUMERIC(5,2) NOT NULL,
  valuation_max NUMERIC(5,2) NOT NULL DEFAULT 20,
  issue_structure_score NUMERIC(5,2) NOT NULL,
  issue_structure_max NUMERIC(5,2) NOT NULL DEFAULT 15,
  market_sentiment_score NUMERIC(5,2) NOT NULL,
  market_sentiment_max NUMERIC(5,2) NOT NULL DEFAULT 15,
  subscription_demand_score NUMERIC(5,2) NOT NULL,
  subscription_demand_max NUMERIC(5,2) NOT NULL DEFAULT 15,
  industry_risk_score NUMERIC(5,2) NOT NULL,
  industry_risk_max NUMERIC(5,2) NOT NULL DEFAULT 10,
  is_insufficient_data BOOLEAN NOT NULL DEFAULT FALSE,
  missing_categories TEXT[] NOT NULL DEFAULT '{}',
  methodology_summary TEXT,
  breakdown_json JSONB NOT NULL DEFAULT '{}',
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. Documents Table
CREATE TABLE IF NOT EXISTS ipo_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ipo_id UUID NOT NULL REFERENCES ipos(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  document_type ipo_doc_type NOT NULL DEFAULT 'other',
  file_url TEXT NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  file_size_bytes BIGINT,
  source TEXT NOT NULL DEFAULT 'SEBI / Company Filing',
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. News Table
CREATE TABLE IF NOT EXISTS ipo_news (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ipo_id UUID NOT NULL REFERENCES ipos(id) ON DELETE CASCADE,
  headline TEXT NOT NULL,
  summary TEXT,
  source TEXT NOT NULL,
  source_url TEXT,
  sentiment ipo_sentiment NOT NULL DEFAULT 'neutral',
  published_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Indexes for Performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_ipo_financials_ipo_id ON ipo_financials(ipo_id);
CREATE INDEX IF NOT EXISTS idx_ipo_peers_ipo_id ON ipo_peers(ipo_id);
CREATE INDEX IF NOT EXISTS idx_ipo_promoters_ipo_id ON ipo_promoters(ipo_id);
CREATE INDEX IF NOT EXISTS idx_ipo_strengths_ipo_id ON ipo_strengths(ipo_id);
CREATE INDEX IF NOT EXISTS idx_ipo_risks_ipo_id ON ipo_risks(ipo_id);
CREATE INDEX IF NOT EXISTS idx_ipo_gmp_entries_ipo_id ON ipo_gmp_entries(ipo_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_ipo_subscription_ipo_id ON ipo_subscription_snapshots(ipo_id, day_number ASC);
CREATE INDEX IF NOT EXISTS idx_ipo_documents_ipo_id ON ipo_documents(ipo_id);
CREATE INDEX IF NOT EXISTS idx_ipo_news_ipo_id ON ipo_news(ipo_id, published_at DESC);

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================
ALTER TABLE ipo_business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ipo_financials ENABLE ROW LEVEL SECURITY;
ALTER TABLE ipo_valuations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ipo_peers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ipo_promoters ENABLE ROW LEVEL SECURITY;
ALTER TABLE ipo_strengths ENABLE ROW LEVEL SECURITY;
ALTER TABLE ipo_risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ipo_gmp_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ipo_subscription_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE ipo_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE ipo_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ipo_news ENABLE ROW LEVEL SECURITY;

-- Macro policy: Public can read research attached to published IPOs
CREATE POLICY "Public can view published business profiles" ON ipo_business_profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM ipos WHERE ipos.id = ipo_business_profiles.ipo_id AND ipos.publication_status = 'published')
  );

CREATE POLICY "Public can view published financials" ON ipo_financials
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM ipos WHERE ipos.id = ipo_financials.ipo_id AND ipos.publication_status = 'published')
  );

CREATE POLICY "Public can view published valuations" ON ipo_valuations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM ipos WHERE ipos.id = ipo_valuations.ipo_id AND ipos.publication_status = 'published')
  );

CREATE POLICY "Public can view published peers" ON ipo_peers
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM ipos WHERE ipos.id = ipo_peers.ipo_id AND ipos.publication_status = 'published')
  );

CREATE POLICY "Public can view published promoters" ON ipo_promoters
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM ipos WHERE ipos.id = ipo_promoters.ipo_id AND ipos.publication_status = 'published')
  );

CREATE POLICY "Public can view published strengths" ON ipo_strengths
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM ipos WHERE ipos.id = ipo_strengths.ipo_id AND ipos.publication_status = 'published')
  );

CREATE POLICY "Public can view published risks" ON ipo_risks
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM ipos WHERE ipos.id = ipo_risks.ipo_id AND ipos.publication_status = 'published')
  );

CREATE POLICY "Public can view published gmp entries" ON ipo_gmp_entries
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM ipos WHERE ipos.id = ipo_gmp_entries.ipo_id AND ipos.publication_status = 'published')
  );

CREATE POLICY "Public can view published subscription snapshots" ON ipo_subscription_snapshots
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM ipos WHERE ipos.id = ipo_subscription_snapshots.ipo_id AND ipos.publication_status = 'published')
  );

CREATE POLICY "Public can view published scores" ON ipo_scores
  FOR SELECT USING (
    is_published = TRUE AND EXISTS (SELECT 1 FROM ipos WHERE ipos.id = ipo_scores.ipo_id AND ipos.publication_status = 'published')
  );

CREATE POLICY "Public can view public documents" ON ipo_documents
  FOR SELECT USING (
    is_public = TRUE AND EXISTS (SELECT 1 FROM ipos WHERE ipos.id = ipo_documents.ipo_id AND ipos.publication_status = 'published')
  );

CREATE POLICY "Public can view published news" ON ipo_news
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM ipos WHERE ipos.id = ipo_news.ipo_id AND ipos.publication_status = 'published')
  );

-- Admins and Editors full access via RBAC
CREATE POLICY "Admins full access on research tables" ON ipo_business_profiles
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('super_admin', 'admin', 'editor', 'analyst'))
  );
CREATE POLICY "Admins full access on financials" ON ipo_financials
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('super_admin', 'admin', 'editor', 'analyst'))
  );
CREATE POLICY "Admins full access on valuations" ON ipo_valuations
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('super_admin', 'admin', 'editor', 'analyst'))
  );
CREATE POLICY "Admins full access on peers" ON ipo_peers
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('super_admin', 'admin', 'editor', 'analyst'))
  );
CREATE POLICY "Admins full access on promoters" ON ipo_promoters
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('super_admin', 'admin', 'editor', 'analyst'))
  );
CREATE POLICY "Admins full access on strengths" ON ipo_strengths
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('super_admin', 'admin', 'editor', 'analyst'))
  );
CREATE POLICY "Admins full access on risks" ON ipo_risks
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('super_admin', 'admin', 'editor', 'analyst'))
  );
CREATE POLICY "Admins full access on gmp" ON ipo_gmp_entries
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('super_admin', 'admin', 'editor', 'analyst'))
  );
CREATE POLICY "Admins full access on subscriptions" ON ipo_subscription_snapshots
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('super_admin', 'admin', 'editor', 'analyst'))
  );
CREATE POLICY "Admins full access on scores" ON ipo_scores
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('super_admin', 'admin', 'editor', 'analyst'))
  );
CREATE POLICY "Admins full access on documents" ON ipo_documents
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('super_admin', 'admin', 'editor', 'analyst'))
  );
CREATE POLICY "Admins full access on news" ON ipo_news
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('super_admin', 'admin', 'editor', 'analyst'))
  );
