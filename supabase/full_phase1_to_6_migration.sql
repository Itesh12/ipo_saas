-- ==============================================================================
-- IPO SaaS Platform (IPO OS) â€” Phase 1 Foundation Database Migration
-- ==============================================================================

-- 1. USER ROLES ENUM
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'editor', 'analyst', 'user');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT,
    avatar_url TEXT,
    role user_role NOT NULL DEFAULT 'user',
    phone TEXT,
    preferred_theme TEXT DEFAULT 'dark',
    is_suspended BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for role-based lookups
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- 3. AUDIT LOGS TABLE (Immutable platform action tracker)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    old_values JSONB,
    new_values JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON public.audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- 4. SECURITY DEFINER HELPER FUNCTIONS (Prevent RLS recursion)
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS user_role
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_super()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'super_admin') AND NOT is_suspended
  );
$$;

-- 5. TRIGGER: Auto-create Profile on Auth Signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', ''),
    COALESCE(new.raw_user_meta_data->>'avatar_url', ''),
    'user'
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      updated_at = NOW();
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. ROW LEVEL SECURITY (RLS) ENFORCEMENT
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- PROFILES POLICIES
-- Users can view their own profile; Admins & Analysts can view all profiles
CREATE POLICY "Users view own profile or admins view all"
  ON public.profiles
  FOR SELECT
  USING (
    auth.uid() = id
    OR public.get_current_user_role() IN ('super_admin', 'admin', 'analyst')
  );

-- Users can update only their own non-role fields
CREATE POLICY "Users update own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id 
    AND (role = (SELECT role FROM public.profiles WHERE id = auth.uid()))
  );

-- Super Admins can update any profile (including roles and suspension)
CREATE POLICY "Super Admins manage all profiles"
  ON public.profiles
  FOR UPDATE
  USING (public.get_current_user_role() = 'super_admin');

-- AUDIT LOGS POLICIES
-- Super Admins and Admins can view audit logs
CREATE POLICY "Admins view audit logs"
  ON public.audit_logs
  FOR SELECT
  USING (public.is_admin_or_super());

-- Authenticated users/system can insert audit logs
CREATE POLICY "System insert audit logs"
  ON public.audit_logs
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Explicitly disallow UPDATE and DELETE on audit logs to preserve immutability
-- (No UPDATE or DELETE policies created)
-- ==============================================================================
-- IPO SaaS Platform (IPO OS) â€” Phase 2: IPO Core Database Migration
-- ==============================================================================

-- 1. ENUMS FOR IPO CORE
DO $$ BEGIN
    CREATE TYPE ipo_category AS ENUM ('mainboard', 'sme_bse', 'sme_nse');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE ipo_issue_type AS ENUM ('book_building', 'fixed_price');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE ipo_status AS ENUM (
        'announced',
        'upcoming',
        'open',
        'closed',
        'allotment_pending',
        'listing_soon',
        'listed',
        'withdrawn',
        'cancelled'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE ipo_publication_status AS ENUM (
        'draft',
        'in_review',
        'approved',
        'published',
        'archived'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE ipo_event_type AS ENUM (
        'announcement',
        'open',
        'close',
        'allotment',
        'refund',
        'listing'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. IPOS MASTER TABLE
CREATE TABLE IF NOT EXISTS public.ipos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    company_name TEXT NOT NULL,
    symbol TEXT,
    company_logo TEXT,
    category ipo_category NOT NULL DEFAULT 'mainboard',
    issue_type ipo_issue_type NOT NULL DEFAULT 'book_building',
    status ipo_status NOT NULL DEFAULT 'announced',
    publication_status ipo_publication_status NOT NULL DEFAULT 'draft',
    
    -- Pricing & Lots
    price_band_low NUMERIC(12,2),
    price_band_high NUMERIC(12,2),
    face_value NUMERIC(10,2) DEFAULT 10.00,
    lot_size INT NOT NULL DEFAULT 1 CHECK (lot_size > 0),
    min_investment NUMERIC(14,2),
    
    -- Issue Size & Structure
    issue_size_cr NUMERIC(14,2),
    fresh_issue_cr NUMERIC(14,2),
    ofs_cr NUMERIC(14,2),
    shares_offered BIGINT,
    
    -- Quota Percentages
    retail_quota_pct NUMERIC(5,2) DEFAULT 35.00,
    qib_quota_pct NUMERIC(5,2) DEFAULT 50.00,
    hni_quota_pct NUMERIC(5,2) DEFAULT 15.00,
    
    -- Market Metadata
    exchange TEXT DEFAULT 'NSE, BSE',
    lead_managers TEXT[] DEFAULT '{}',
    registrar_name TEXT,
    
    -- Core Timeline Dates
    announcement_date DATE,
    open_date DATE,
    close_date DATE,
    allotment_date DATE,
    refund_date DATE,
    listing_date DATE,
    
    -- Post Listing Data
    listing_price NUMERIC(12,2),
    
    -- Content & Overview
    about_company TEXT,
    
    -- Governance & Audit Reference
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT chk_price_band CHECK (
        (price_band_low IS NULL AND price_band_high IS NULL) OR
        (price_band_low IS NOT NULL AND price_band_high IS NOT NULL AND price_band_high >= price_band_low)
    ),
    CONSTRAINT chk_dates_sequence CHECK (
        (open_date IS NULL OR close_date IS NULL OR close_date >= open_date) AND
        (close_date IS NULL OR allotment_date IS NULL OR allotment_date >= close_date) AND
        (allotment_date IS NULL OR listing_date IS NULL OR listing_date >= allotment_date)
    )
);

-- Indexes for high-performance public filtering and searches
CREATE INDEX IF NOT EXISTS idx_ipos_slug ON public.ipos(slug);
CREATE INDEX IF NOT EXISTS idx_ipos_publication_status ON public.ipos(publication_status);
CREATE INDEX IF NOT EXISTS idx_ipos_status ON public.ipos(status);
CREATE INDEX IF NOT EXISTS idx_ipos_category ON public.ipos(category);
CREATE INDEX IF NOT EXISTS idx_ipos_open_date ON public.ipos(open_date);
CREATE INDEX IF NOT EXISTS idx_ipos_close_date ON public.ipos(close_date);
CREATE INDEX IF NOT EXISTS idx_ipos_listing_date ON public.ipos(listing_date);
CREATE INDEX IF NOT EXISTS idx_ipos_company_name ON public.ipos USING gin(to_tsvector('english', company_name));

-- 3. IPO EVENTS TABLE (Extensible timeline)
CREATE TABLE IF NOT EXISTS public.ipo_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ipo_id UUID NOT NULL REFERENCES public.ipos(id) ON DELETE CASCADE,
    event_type ipo_event_type NOT NULL,
    title TEXT NOT NULL,
    event_date DATE NOT NULL,
    description TEXT,
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ipo_events_ipo_id ON public.ipo_events(ipo_id);
CREATE INDEX IF NOT EXISTS idx_ipo_events_date ON public.ipo_events(event_date);

-- 4. ROW LEVEL SECURITY (RLS) POLICIES

ALTER TABLE public.ipos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ipo_events ENABLE ROW LEVEL SECURITY;

-- Helper to check if current actor has editor privileges or higher
CREATE OR REPLACE FUNCTION public.is_editor_or_above()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('editor', 'admin', 'super_admin') AND NOT is_suspended
  );
$$;

-- IPOS POLICIES
-- Public (anonymous + authenticated) can view ONLY published IPOs
CREATE POLICY "Public read published ipos"
  ON public.ipos
  FOR SELECT
  USING (
    publication_status = 'published'
    OR public.get_current_user_role() IN ('super_admin', 'admin', 'editor', 'analyst')
  );

-- Editors & Admins can create IPOs
CREATE POLICY "Editors insert ipos"
  ON public.ipos
  FOR INSERT
  WITH CHECK (public.is_editor_or_above());

-- Editors & Admins can update IPOs
CREATE POLICY "Editors update ipos"
  ON public.ipos
  FOR UPDATE
  USING (public.is_editor_or_above())
  WITH CHECK (public.is_editor_or_above());

-- Admins and Super Admins can delete IPOs
CREATE POLICY "Admins delete ipos"
  ON public.ipos
  FOR DELETE
  USING (public.is_admin_or_super());

-- IPO EVENTS POLICIES
CREATE POLICY "Public read events for published ipos"
  ON public.ipo_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.ipos
      WHERE public.ipos.id = public.ipo_events.ipo_id
        AND (public.ipos.publication_status = 'published' OR public.get_current_user_role() IN ('super_admin', 'admin', 'editor', 'analyst'))
    )
  );

CREATE POLICY "Editors manage ipo events"
  ON public.ipo_events
  FOR ALL
  USING (public.is_editor_or_above())
  WITH CHECK (public.is_editor_or_above());
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
-- ==============================================================================
-- PHASE 4: USER IPO APPLICATIONS, APPLICANTS & ALLOTMENT ORCHESTRATION
-- Migration: 20260910000004_phase4_applications.sql
-- ==============================================================================

-- 1. Custom PostgreSQL Enums
CREATE TYPE applicant_relationship AS ENUM (
  'self',
  'father',
  'mother',
  'spouse',
  'son',
  'daughter',
  'brother',
  'sister',
  'friend',
  'other'
);

CREATE TYPE investor_category AS ENUM (
  'retail',
  's_hni',
  'b_hni',
  'employee',
  'shareholder'
);

CREATE TYPE application_status AS ENUM (
  'draft',
  'applied',
  'mandate_pending',
  'mandate_approved',
  'funds_blocked',
  'bidding_closed',
  'allotment_pending',
  'allotted',
  'partially_allotted',
  'not_allotted',
  'refund_pending',
  'refund_completed',
  'funds_unblocked',
  'completed',
  'cancelled'
);

CREATE TYPE mandate_status AS ENUM (
  'not_required',
  'created',
  'pending',
  'approved',
  'rejected',
  'expired',
  'cancelled',
  'blocked',
  'unblocked'
);

CREATE TYPE allotment_status AS ENUM (
  'pending',
  'allotted',
  'partially_allotted',
  'not_allotted'
);

CREATE TYPE application_event_type AS ENUM (
  'application_created',
  'bid_added',
  'bid_updated',
  'mandate_pending',
  'mandate_requested',
  'mandate_approved',
  'mandate_rejected',
  'funds_blocked',
  'bidding_closed',
  'allotment_pending',
  'allotment_processed',
  'allotted',
  'partially_allotted',
  'not_allotted',
  'refund_pending',
  'refund_completed',
  'funds_unblocked',
  'completed',
  'cancelled'
);

-- 2. Applicant Profiles (Family & Friends accounts per user)
CREATE TABLE IF NOT EXISTS applicant_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  relationship applicant_relationship NOT NULL DEFAULT 'self',
  display_name TEXT NOT NULL,
  pan_masked VARCHAR(20) NOT NULL, -- e.g. ABCDE****F
  demat_dp_id_masked VARCHAR(30),   -- e.g. IN300*** or ****1234
  demat_account_no_masked VARCHAR(30),
  upi_id_masked VARCHAR(100),       -- e.g. it***@okaxis
  default_category investor_category NOT NULL DEFAULT 'retail',
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_applicant_profiles_user ON applicant_profiles(user_id);
CREATE INDEX idx_applicant_profiles_active ON applicant_profiles(user_id, is_active);

-- 3. IPO Applications (Aggregate parent record)
CREATE TABLE IF NOT EXISTS ipo_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ipo_id UUID NOT NULL REFERENCES ipos(id) ON DELETE RESTRICT,
  applicant_id UUID NOT NULL REFERENCES applicant_profiles(id) ON DELETE RESTRICT,
  application_number VARCHAR(60) NOT NULL,
  investor_category investor_category NOT NULL DEFAULT 'retail',
  status application_status NOT NULL DEFAULT 'applied',
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_lots INTEGER NOT NULL CHECK (total_lots > 0),
  total_quantity INTEGER NOT NULL CHECK (total_quantity > 0),
  bid_price NUMERIC(14,2) NOT NULL CHECK (bid_price > 0),
  is_cutoff BOOLEAN NOT NULL DEFAULT true,
  application_amount NUMERIC(14,2) NOT NULL CHECK (application_amount >= 0),
  mandate_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (mandate_amount >= 0),
  blocked_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (blocked_amount >= 0),
  allotment_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (allotment_amount >= 0),
  refund_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (refund_amount >= 0),
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial Unique Index: Prevents duplicate active applications for the same applicant, IPO, and category,
-- while cleanly permitting re-application after terminal cancellation or completion.
CREATE UNIQUE INDEX idx_active_applicant_ipo_category
ON ipo_applications (applicant_id, ipo_id, investor_category)
WHERE status NOT IN ('cancelled', 'completed');

CREATE INDEX idx_ipo_applications_user ON ipo_applications(user_id);
CREATE INDEX idx_ipo_applications_ipo ON ipo_applications(ipo_id);
CREATE INDEX idx_ipo_applications_applicant ON ipo_applications(applicant_id);
CREATE INDEX idx_ipo_applications_status ON ipo_applications(status);
CREATE INDEX idx_ipo_applications_applied_at ON ipo_applications(applied_at DESC);

-- 4. Application Bids (Source-of-truth entries for multi-bid book-building)
CREATE TABLE IF NOT EXISTS ipo_application_bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES ipo_applications(id) ON DELETE CASCADE,
  bid_number SMALLINT NOT NULL CHECK (bid_number BETWEEN 1 AND 3),
  lot_count INTEGER NOT NULL CHECK (lot_count > 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price NUMERIC(14,2) NOT NULL CHECK (price > 0),
  is_cutoff BOOLEAN NOT NULL DEFAULT false,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(application_id, bid_number)
);

CREATE INDEX idx_application_bids_app ON ipo_application_bids(application_id);

-- 5. Application Mandates (UPI mandate orchestration & status tracking)
CREATE TABLE IF NOT EXISTS ipo_application_mandates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES ipo_applications(id) ON DELETE CASCADE UNIQUE,
  provider VARCHAR(60) NOT NULL DEFAULT 'BHIM_UPI',
  provider_reference VARCHAR(100),
  upi_id_masked VARCHAR(100),
  mandate_status mandate_status NOT NULL DEFAULT 'created',
  requested_amount NUMERIC(14,2) NOT NULL CHECK (requested_amount >= 0),
  blocked_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (blocked_amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  unblocked_at TIMESTAMPTZ,
  expiry_at TIMESTAMPTZ,
  failure_reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_application_mandates_app ON ipo_application_mandates(application_id);
CREATE INDEX idx_application_mandates_status ON ipo_application_mandates(mandate_status);

-- 6. Application Allotments (Registrar allotment results & refund derivation)
CREATE TABLE IF NOT EXISTS ipo_application_allotments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES ipo_applications(id) ON DELETE CASCADE UNIQUE,
  allotment_status allotment_status NOT NULL DEFAULT 'pending',
  shares_applied INTEGER NOT NULL CHECK (shares_applied > 0),
  shares_allotted INTEGER NOT NULL DEFAULT 0 CHECK (shares_allotted >= 0),
  lots_applied INTEGER NOT NULL CHECK (lots_applied > 0),
  lots_allotted INTEGER NOT NULL DEFAULT 0 CHECK (lots_allotted >= 0),
  allotment_price NUMERIC(14,2) CHECK (allotment_price > 0),
  allotment_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (allotment_amount >= 0),
  refund_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (refund_amount >= 0),
  basis_of_allotment_ref VARCHAR(100),
  processed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_application_allotments_app ON ipo_application_allotments(application_id);

-- 7. Application Events (Immutable audit log and timeline history)
CREATE TABLE IF NOT EXISTS ipo_application_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES ipo_applications(id) ON DELETE CASCADE,
  event_type application_event_type NOT NULL,
  description TEXT NOT NULL,
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_application_events_app ON ipo_application_events(application_id, created_at ASC);

-- 8. Watchlist Items (Private user watchlist)
CREATE TABLE IF NOT EXISTS watchlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ipo_id UUID NOT NULL REFERENCES ipos(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, ipo_id)
);

CREATE INDEX idx_watchlist_items_user ON watchlist_items(user_id);
CREATE INDEX idx_watchlist_items_ipo ON watchlist_items(ipo_id);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE applicant_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ipo_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE ipo_application_bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE ipo_application_mandates ENABLE ROW LEVEL SECURITY;
ALTER TABLE ipo_application_allotments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ipo_application_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist_items ENABLE ROW LEVEL SECURITY;

-- applicant_profiles RLS
CREATE POLICY "Users can manage their own applicants"
  ON applicant_profiles FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all applicants masked"
  ON applicant_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin')
    )
  );

-- ipo_applications RLS
CREATE POLICY "Users can manage their own applications"
  ON ipo_applications FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Staff can view all applications"
  ON ipo_applications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('analyst', 'editor', 'admin', 'super_admin')
    )
  );

CREATE POLICY "Staff can update application status"
  ON ipo_applications FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('editor', 'admin', 'super_admin')
    )
  );

-- ipo_application_bids RLS
CREATE POLICY "Users can view bids of their applications"
  ON ipo_application_bids FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM ipo_applications
      WHERE ipo_applications.id = ipo_application_bids.application_id
      AND ipo_applications.user_id = auth.uid()
    )
  );

-- ipo_application_mandates RLS
CREATE POLICY "Users can view mandates of their applications"
  ON ipo_application_mandates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ipo_applications
      WHERE ipo_applications.id = ipo_application_mandates.application_id
      AND ipo_applications.user_id = auth.uid()
    )
  );

CREATE POLICY "Staff can manage mandates"
  ON ipo_application_mandates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin', 'editor')
    )
  );

-- ipo_application_allotments RLS
CREATE POLICY "Users can view allotments of their applications"
  ON ipo_application_allotments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ipo_applications
      WHERE ipo_applications.id = ipo_application_allotments.application_id
      AND ipo_applications.user_id = auth.uid()
    )
  );

CREATE POLICY "Staff can manage allotments"
  ON ipo_application_allotments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin', 'editor')
    )
  );

-- ipo_application_events RLS
CREATE POLICY "Users can view events of their applications"
  ON ipo_application_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ipo_applications
      WHERE ipo_applications.id = ipo_application_events.application_id
      AND ipo_applications.user_id = auth.uid()
    )
  );

CREATE POLICY "Staff can view all application events"
  ON ipo_application_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('analyst', 'editor', 'admin', 'super_admin')
    )
  );

-- watchlist_items RLS
CREATE POLICY "Users can manage their own watchlist"
  ON watchlist_items FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
-- ==============================================================================
-- PHASE 5: FINANCE, DOUBLE-ENTRY GENERAL LEDGER & PORTFOLIO ENGINE
-- Migration: 20260910000005_phase5_finance.sql
-- ==============================================================================

-- 1. ENUMS FOR ACCOUNTING & FINANCE
DO $$ BEGIN
    CREATE TYPE account_classification AS ENUM (
        'asset',
        'liability',
        'equity',
        'revenue',
        'expense'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE journal_status AS ENUM (
        'draft',
        'posted',
        'reversed'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE journal_type AS ENUM (
        'opening_balance',
        'capital_deposit',
        'capital_withdrawal',
        'ipo_funds_blocked',
        'ipo_funds_unblocked',
        'ipo_allotment_debit',
        'security_sale',
        'reversal',
        'manual_adjustment'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE investment_transaction_type AS ENUM (
        'ipo_allotment',
        'secondary_purchase',
        'secondary_sale',
        'bonus_shares',
        'split_adjustment',
        'external_holding'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE funding_owner_type AS ENUM (
        'user_personal',
        'applicant_direct',
        'family_pool',
        'external_tracked'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE ownership_category AS ENUM (
        'user_personal',
        'applicant_direct',
        'family_pool',
        'external_tracked'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE finance_backfill_state AS ENUM (
        'verified',
        'partially_verified',
        'unverified',
        'not_migrated'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 2. CHART OF ACCOUNTS (financial_accounts)
CREATE TABLE IF NOT EXISTS public.financial_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    account_code VARCHAR(20) NOT NULL,
    account_name TEXT NOT NULL,
    classification account_classification NOT NULL,
    ownership_category ownership_category NOT NULL DEFAULT 'user_personal',
    beneficial_applicant_id UUID REFERENCES public.applicant_profiles(id) ON DELETE SET NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    is_system_account BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_user_account_code UNIQUE (user_id, account_code)
);

CREATE INDEX IF NOT EXISTS idx_financial_accounts_user ON public.financial_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_financial_accounts_class ON public.financial_accounts(user_id, classification);
CREATE INDEX IF NOT EXISTS idx_financial_accounts_applicant ON public.financial_accounts(beneficial_applicant_id);

-- 3. GENERAL LEDGER: JOURNAL ENTRIES (journal_entries)
CREATE TABLE IF NOT EXISTS public.journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    journal_number VARCHAR(60) NOT NULL UNIQUE,
    idempotency_key VARCHAR(150) NOT NULL UNIQUE,
    status journal_status NOT NULL DEFAULT 'draft',
    journal_type journal_type NOT NULL,
    reference_type VARCHAR(50) NOT NULL,
    reference_id UUID,
    transaction_date TIMESTAMPTZ NOT NULL,
    narration TEXT NOT NULL,
    reverses_journal_id UUID REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
    reversed_by_journal_id UUID REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
    reversal_reason TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_user ON public.journal_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_status ON public.journal_entries(status);
CREATE INDEX IF NOT EXISTS idx_journal_entries_reference ON public.journal_entries(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON public.journal_entries(user_id, transaction_date DESC);

-- 4. GENERAL LEDGER: JOURNAL LINES (journal_lines)
CREATE TABLE IF NOT EXISTS public.journal_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES public.financial_accounts(id) ON DELETE RESTRICT,
    applicant_id UUID REFERENCES public.applicant_profiles(id) ON DELETE SET NULL,
    debit NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
    credit NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    line_narration TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_debit_xor_credit CHECK (
        (debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)
    )
);

CREATE INDEX IF NOT EXISTS idx_journal_lines_journal ON public.journal_lines(journal_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON public.journal_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_applicant ON public.journal_lines(applicant_id);

-- 5. SECURITIES MASTER TABLE (securities)
CREATE TABLE IF NOT EXISTS public.securities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ipo_id UUID REFERENCES public.ipos(id) ON DELETE SET NULL,
    isin VARCHAR(12) UNIQUE,
    symbol VARCHAR(30) NOT NULL,
    exchange VARCHAR(20) NOT NULL DEFAULT 'NSE',
    company_name TEXT NOT NULL,
    face_value NUMERIC(10,2),
    lot_size INTEGER NOT NULL DEFAULT 1 CHECK (lot_size > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_exchange_symbol UNIQUE (exchange, symbol)
);

CREATE INDEX IF NOT EXISTS idx_securities_isin ON public.securities(isin);
CREATE INDEX IF NOT EXISTS idx_securities_symbol ON public.securities(exchange, symbol);
CREATE INDEX IF NOT EXISTS idx_securities_ipo ON public.securities(ipo_id);

-- 6. INVESTMENT TRANSACTIONS (investment_transactions)
CREATE TABLE IF NOT EXISTS public.investment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    applicant_id UUID REFERENCES public.applicant_profiles(id) ON DELETE SET NULL,
    security_id UUID NOT NULL REFERENCES public.securities(id) ON DELETE RESTRICT,
    application_id UUID REFERENCES public.ipo_applications(id) ON DELETE SET NULL,
    journal_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,
    idempotency_key VARCHAR(150) NOT NULL UNIQUE,
    transaction_type investment_transaction_type NOT NULL,
    funding_owner_type funding_owner_type NOT NULL DEFAULT 'user_personal',
    transaction_date TIMESTAMPTZ NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    price_per_share NUMERIC(14,2) NOT NULL CHECK (price_per_share > 0),
    gross_amount NUMERIC(14,2) NOT NULL CHECK (gross_amount > 0),
    fees NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (fees >= 0),
    net_amount NUMERIC(14,2) NOT NULL CHECK (net_amount > 0),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_investment_tx_user ON public.investment_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_investment_tx_security ON public.investment_transactions(security_id);
CREATE INDEX IF NOT EXISTS idx_investment_tx_applicant ON public.investment_transactions(applicant_id);
CREATE INDEX IF NOT EXISTS idx_investment_tx_app ON public.investment_transactions(application_id);

-- 7. PORTFOLIO POSITIONS (portfolio_positions)
CREATE TABLE IF NOT EXISTS public.portfolio_positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    applicant_id UUID REFERENCES public.applicant_profiles(id) ON DELETE SET NULL,
    security_id UUID NOT NULL REFERENCES public.securities(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    average_cost_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (average_cost_price >= 0),
    total_invested_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_invested_cost >= 0),
    realized_pnl NUMERIC(14,2) NOT NULL DEFAULT 0,
    is_external_tracked BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_user_applicant_security UNIQUE NULLS NOT DISTINCT (user_id, applicant_id, security_id)
);

CREATE INDEX IF NOT EXISTS idx_positions_user ON public.portfolio_positions(user_id);
CREATE INDEX IF NOT EXISTS idx_positions_applicant ON public.portfolio_positions(applicant_id);
CREATE INDEX IF NOT EXISTS idx_positions_security ON public.portfolio_positions(security_id);

-- 8. SECURITY PRICES SNAPSHOTS (security_prices)
CREATE TABLE IF NOT EXISTS public.security_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    security_id UUID NOT NULL REFERENCES public.securities(id) ON DELETE CASCADE,
    price NUMERIC(14,2) NOT NULL CHECK (price >= 0),
    day_open NUMERIC(14,2),
    day_high NUMERIC(14,2),
    day_low NUMERIC(14,2),
    previous_close NUMERIC(14,2),
    source VARCHAR(50) NOT NULL DEFAULT 'exchange_feed',
    is_verified BOOLEAN NOT NULL DEFAULT true,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_prices_sec_time ON public.security_prices(security_id, captured_at DESC);

-- 9. FINANCE PROCESSED EVENTS (Idempotent Event Log)
CREATE TABLE IF NOT EXISTS public.finance_processed_events (
    event_id UUID PRIMARY KEY,
    event_type VARCHAR(60) NOT NULL,
    reference_id UUID,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finance_events_type ON public.finance_processed_events(event_type);

-- ==============================================================================
-- 10. POSTGRESQL DOUBLE-ENTRY CONSTRAINT TRIGGERS
-- ==============================================================================

-- A. Journal Header Balance Verification Trigger
CREATE OR REPLACE FUNCTION verify_journal_header_balance()
RETURNS TRIGGER AS $$
DECLARE
    v_debit_sum NUMERIC(14,2);
    v_credit_sum NUMERIC(14,2);
    v_line_count INTEGER;
BEGIN
    IF NEW.status = 'posted' THEN
        SELECT 
            COALESCE(SUM(debit), 0),
            COALESCE(SUM(credit), 0),
            COUNT(*)
        INTO v_debit_sum, v_credit_sum, v_line_count
        FROM public.journal_lines
        WHERE journal_id = NEW.id;

        IF v_line_count < 2 THEN
            RAISE EXCEPTION 'Posted journal % must contain at least 2 lines (found % lines).',
                NEW.id, v_line_count;
        END IF;

        IF v_debit_sum <> v_credit_sum THEN
            RAISE EXCEPTION 'Unbalanced journal %: Total Debits (â‚¹%) does not equal Total Credits (â‚¹%).',
                NEW.id, v_debit_sum, v_credit_sum;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- B. Journal Lines Mutation Trigger (INSERT, UPDATE, DELETE)
CREATE OR REPLACE FUNCTION verify_journal_lines_mutation()
RETURNS TRIGGER AS $$
DECLARE
    v_target_journal_id UUID;
    v_old_journal_id UUID;
    v_status journal_status;
    v_debit_sum NUMERIC(14,2);
    v_credit_sum NUMERIC(14,2);
    v_line_count INTEGER;
BEGIN
    v_target_journal_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.journal_id ELSE NEW.journal_id END;

    -- If journal_id changed on UPDATE, also re-verify OLD journal
    IF TG_OP = 'UPDATE' AND OLD.journal_id <> NEW.journal_id THEN
        v_old_journal_id := OLD.journal_id;
        SELECT status INTO v_status FROM public.journal_entries WHERE id = v_old_journal_id;
        IF v_status = 'posted' THEN
            SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0), COUNT(*)
            INTO v_debit_sum, v_credit_sum, v_line_count
            FROM public.journal_lines WHERE journal_id = v_old_journal_id;

            IF v_line_count < 2 OR v_debit_sum <> v_credit_sum THEN
                RAISE EXCEPTION 'Line update unbalanced the origin journal %.', v_old_journal_id;
            END IF;
        END IF;
    END IF;

    -- Validate target journal if posted
    SELECT status INTO v_status FROM public.journal_entries WHERE id = v_target_journal_id;
    IF v_status = 'posted' THEN
        SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0), COUNT(*)
        INTO v_debit_sum, v_credit_sum, v_line_count
        FROM public.journal_lines WHERE journal_id = v_target_journal_id;

        IF v_line_count < 2 THEN
            RAISE EXCEPTION 'Posted journal % must have at least 2 lines (found %).',
                v_target_journal_id, v_line_count;
        END IF;

        IF v_debit_sum <> v_credit_sum THEN
            RAISE EXCEPTION 'Unbalanced journal %: Debits (â‚¹%) != Credits (â‚¹%).',
                v_target_journal_id, v_debit_sum, v_credit_sum;
        END IF;
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

-- C. Immutability Trigger for Posted Journal Entries
CREATE OR REPLACE FUNCTION protect_posted_journal_entries()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        -- Allow setting reversed_by_journal_id or status to 'reversed'
        IF OLD.status = 'posted' AND NEW.status NOT IN ('posted', 'reversed') THEN
            RAISE EXCEPTION 'Posted journal % is immutable. Use an offsetting reversal journal.', OLD.id;
        END IF;
        IF OLD.status = 'posted' AND (OLD.journal_number <> NEW.journal_number OR OLD.user_id <> NEW.user_id) THEN
            RAISE EXCEPTION 'Cannot mutate core identifiers of posted journal %.', OLD.id;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.status IN ('posted', 'reversed') THEN
            RAISE EXCEPTION 'Posted or reversed journal % cannot be deleted.', OLD.id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- D. Immutability Trigger for Posted Journal Lines
CREATE OR REPLACE FUNCTION protect_posted_journal_lines()
RETURNS TRIGGER AS $$
DECLARE
    v_status journal_status;
BEGIN
    SELECT status INTO v_status FROM public.journal_entries 
    WHERE id = (CASE WHEN TG_OP = 'DELETE' THEN OLD.journal_id ELSE NEW.journal_id END);

    IF v_status IN ('posted', 'reversed') THEN
        RAISE EXCEPTION 'Journal lines belonging to a posted journal are immutable. Post a reversal journal.';
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if present
DROP TRIGGER IF EXISTS trg_journal_header_balance ON public.journal_entries;
DROP TRIGGER IF EXISTS trg_journal_lines_balance ON public.journal_lines;
DROP TRIGGER IF EXISTS trg_protect_posted_journal_entries ON public.journal_entries;
DROP TRIGGER IF EXISTS trg_protect_posted_journal_lines ON public.journal_lines;

-- Attach DEFERRABLE INITIALLY DEFERRED Constraint Triggers
CREATE CONSTRAINT TRIGGER trg_journal_header_balance
AFTER INSERT OR UPDATE OF status ON public.journal_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION verify_journal_header_balance();

CREATE CONSTRAINT TRIGGER trg_journal_lines_balance
AFTER INSERT OR UPDATE OR DELETE ON public.journal_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION verify_journal_lines_mutation();

-- Attach Immutability Triggers (Immediate)
CREATE TRIGGER trg_protect_posted_journal_entries
BEFORE UPDATE OR DELETE ON public.journal_entries
FOR EACH ROW
EXECUTE FUNCTION protect_posted_journal_entries();

CREATE TRIGGER trg_protect_posted_journal_lines
BEFORE UPDATE OR DELETE ON public.journal_lines
FOR EACH ROW
EXECUTE FUNCTION protect_posted_journal_lines();

-- ==============================================================================
-- 11. ATOMIC STORED POSTING FUNCTION
-- ==============================================================================

CREATE OR REPLACE FUNCTION post_journal_entry_atomic(
    p_user_id UUID,
    p_journal_number VARCHAR(60),
    p_idempotency_key VARCHAR(150),
    p_journal_type journal_type,
    p_reference_type VARCHAR(50),
    p_reference_id UUID,
    p_transaction_date TIMESTAMPTZ,
    p_narration TEXT,
    p_lines JSONB,
    p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
    v_journal_id UUID;
    v_line JSONB;
    v_account_id UUID;
    v_applicant_id UUID;
    v_debit NUMERIC(14,2);
    v_credit NUMERIC(14,2);
    v_line_narration TEXT;
BEGIN
    -- 1. Insert header as draft first
    INSERT INTO public.journal_entries (
        user_id,
        journal_number,
        idempotency_key,
        status,
        journal_type,
        reference_type,
        reference_id,
        transaction_date,
        narration,
        metadata
    ) VALUES (
        p_user_id,
        p_journal_number,
        p_idempotency_key,
        'draft',
        p_journal_type,
        p_reference_type,
        p_reference_id,
        p_transaction_date,
        p_narration,
        p_metadata
    ) RETURNING id INTO v_journal_id;

    -- 2. Insert all constituent lines
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
        v_account_id := (v_line->>'account_id')::UUID;
        v_applicant_id := NULL;
        IF v_line ? 'applicant_id' AND v_line->>'applicant_id' IS NOT NULL AND v_line->>'applicant_id' <> '' THEN
            v_applicant_id := (v_line->>'applicant_id')::UUID;
        END IF;
        v_debit := COALESCE((v_line->>'debit')::NUMERIC(14,2), 0);
        v_credit := COALESCE((v_line->>'credit')::NUMERIC(14,2), 0);
        v_line_narration := v_line->>'line_narration';

        INSERT INTO public.journal_lines (
            journal_id,
            account_id,
            applicant_id,
            debit,
            credit,
            line_narration
        ) VALUES (
            v_journal_id,
            v_account_id,
            v_applicant_id,
            v_debit,
            v_credit,
            v_line_narration
        );
    END LOOP;

    -- 3. Transition status to 'posted' (fires deferred constraint trigger at commit)
    UPDATE public.journal_entries
    SET status = 'posted'
    WHERE id = v_journal_id;

    RETURN v_journal_id;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 12. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.securities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_processed_events ENABLE ROW LEVEL SECURITY;

-- Securities & Security Prices: readable by all authenticated users
CREATE POLICY "securities_readable_by_all" ON public.securities
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "securities_staff_manage" ON public.securities
    FOR ALL USING (is_editor_or_above());

CREATE POLICY "security_prices_readable_by_all" ON public.security_prices
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "security_prices_staff_manage" ON public.security_prices
    FOR ALL USING (is_editor_or_above());

-- Financial Accounts: User isolated
CREATE POLICY "user_manage_own_accounts" ON public.financial_accounts
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "staff_read_accounts" ON public.financial_accounts
    FOR SELECT USING (is_admin_or_super());

-- Journal Entries: User isolated read, staff read
CREATE POLICY "user_read_own_journals" ON public.journal_entries
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_insert_own_journals" ON public.journal_entries
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "staff_read_journals" ON public.journal_entries
    FOR SELECT USING (is_admin_or_super());

-- Journal Lines: joined to journal_entries owner
CREATE POLICY "user_read_own_journal_lines" ON public.journal_lines
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.journal_entries je
            WHERE je.id = journal_lines.journal_id AND je.user_id = auth.uid()
        )
    );

CREATE POLICY "user_insert_own_journal_lines" ON public.journal_lines
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.journal_entries je
            WHERE je.id = journal_lines.journal_id AND je.user_id = auth.uid()
        )
    );

CREATE POLICY "staff_read_journal_lines" ON public.journal_lines
    FOR SELECT USING (is_admin_or_super());

-- Investment Transactions: User isolated
CREATE POLICY "user_read_own_investment_tx" ON public.investment_transactions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_insert_own_investment_tx" ON public.investment_transactions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "staff_read_investment_tx" ON public.investment_transactions
    FOR SELECT USING (is_admin_or_super());

-- Portfolio Positions: User isolated
CREATE POLICY "user_manage_own_positions" ON public.portfolio_positions
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "staff_read_positions" ON public.portfolio_positions
    FOR SELECT USING (is_admin_or_super());

-- Finance Processed Events: internal/admin
CREATE POLICY "staff_manage_finance_events" ON public.finance_processed_events
    FOR ALL USING (is_admin_or_super());
-- ==============================================================================
-- PHASE 6: ANALYTICS, SCREENER & INVESTOR INTELLIGENCE
-- Migration: 20260910000006_phase6_analytics.sql
-- ==============================================================================

-- 1. SAVED SCREENS TABLE
CREATE TABLE IF NOT EXISTS public.saved_screens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    filter_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    sort_by VARCHAR(50) NOT NULL DEFAULT 'overall_score',
    sort_direction VARCHAR(4) NOT NULL DEFAULT 'desc',
    selected_columns TEXT[] NOT NULL DEFAULT ARRAY['company_name', 'price_band', 'issue_size_cr', 'pe_ratio_high', 'overall_score', 'status'],
    is_pinned BOOLEAN NOT NULL DEFAULT false,
    is_public BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_user_screen_name UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_saved_screens_user ON public.saved_screens(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_screens_public ON public.saved_screens(is_public, is_pinned);

-- 2. INVESTOR PREFERENCES TABLE (Non-Advisory Analytical Preferences)
CREATE TABLE IF NOT EXISTS public.investor_preferences (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    preferred_categories VARCHAR(20)[] DEFAULT ARRAY['mainboard'],
    preferred_sectors TEXT[] DEFAULT '{}',
    max_lot_investment NUMERIC(14,2),
    min_ipo_score NUMERIC(5,2) DEFAULT 60.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. COMPOSITE INDEXES ON UNDERLYING TABLES FOR SCREENER PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_ipos_pub_status ON public.ipos(publication_status, status);
CREATE INDEX IF NOT EXISTS idx_ipos_status_dates ON public.ipos(status, open_date, close_date);
CREATE INDEX IF NOT EXISTS idx_ipos_category_issue ON public.ipos(category, issue_type);
CREATE INDEX IF NOT EXISTS idx_ipo_valuations_pe_high ON public.ipo_valuations(pe_ratio_high);
CREATE INDEX IF NOT EXISTS idx_ipo_scores_overall_score ON public.ipo_scores(overall_score DESC);
CREATE INDEX IF NOT EXISTS idx_ipo_business_industry ON public.ipo_business_profiles(industry);

-- 4. NORMAL POSTGRESQL VIEW: v_ipo_screener_universe
-- Uses security_invoker = true and hardcoded publication_status = 'published'
-- Performance is driven by indexed source tables; materialization deferred pending EXPLAIN ANALYZE
CREATE OR REPLACE VIEW public.v_ipo_screener_universe 
WITH (security_invoker = true) AS
SELECT 
    i.id,
    i.slug,
    i.company_name,
    i.symbol,
    i.category,
    i.issue_type,
    i.status,
    i.price_band_low,
    i.price_band_high,
    i.lot_size,
    i.min_investment,
    i.issue_size_cr,
    i.fresh_issue_cr,
    i.ofs_cr,
    i.open_date,
    i.close_date,
    i.allotment_date,
    i.listing_date,
    v.pe_ratio_high,
    v.pb_ratio,
    v.ev_ebitda,
    v.industry_pe_median,
    f.financial_year AS latest_financial_year,
    f.revenue_cr AS latest_revenue_cr,
    f.revenue_growth_pct AS latest_revenue_growth_pct,
    f.pat_margin_pct AS latest_pat_margin_pct,
    f.roe_pct AS latest_roe_pct,
    f.roce_pct AS latest_roce_pct,
    f.total_debt_cr AS latest_total_debt_cr,
    f.net_worth_cr AS latest_net_worth_cr,
    s.overall_score,
    s.financial_health_score,
    s.valuation_score,
    s.subscription_demand_score,
    s.market_sentiment_score,
    s.is_insufficient_data,
    bp.industry,
    (SELECT gmp_value FROM public.ipo_gmp_entries WHERE ipo_id = i.id ORDER BY observed_at DESC LIMIT 1) AS latest_gmp_value,
    (SELECT estimated_listing_gain_pct FROM public.ipo_gmp_entries WHERE ipo_id = i.id ORDER BY observed_at DESC LIMIT 1) AS latest_gmp_gain_pct,
    (SELECT overall_x FROM public.ipo_subscription_snapshots WHERE ipo_id = i.id ORDER BY day_number DESC LIMIT 1) AS latest_subscription_x,
    (SELECT retail_x FROM public.ipo_subscription_snapshots WHERE ipo_id = i.id ORDER BY day_number DESC LIMIT 1) AS latest_retail_sub_x,
    (SELECT qib_x FROM public.ipo_subscription_snapshots WHERE ipo_id = i.id ORDER BY day_number DESC LIMIT 1) AS latest_qib_sub_x,
    (SELECT COUNT(*) FROM public.ipo_risks WHERE ipo_id = i.id AND severity = 'high') AS high_risk_count,
    GREATEST(i.updated_at, s.updated_at, v.updated_at) AS last_intelligence_update
FROM public.ipos i
LEFT JOIN public.ipo_valuations v ON v.ipo_id = i.id
LEFT JOIN LATERAL (
    SELECT * FROM public.ipo_financials 
    WHERE ipo_id = i.id 
    ORDER BY financial_year DESC 
    LIMIT 1
) f ON true
LEFT JOIN public.ipo_scores s ON s.ipo_id = i.id
LEFT JOIN public.ipo_business_profiles bp ON bp.ipo_id = i.id
WHERE i.publication_status = 'published';

-- 5. ROW LEVEL SECURITY POLICIES
ALTER TABLE public.saved_screens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investor_preferences ENABLE ROW LEVEL SECURITY;

-- A. saved_screens RLS Policies
DROP POLICY IF EXISTS "saved_screens_select_policy" ON public.saved_screens;
CREATE POLICY "saved_screens_select_policy" ON public.saved_screens
    FOR SELECT
    USING (user_id = auth.uid() OR is_public = true);

DROP POLICY IF EXISTS "saved_screens_insert_policy" ON public.saved_screens;
CREATE POLICY "saved_screens_insert_policy" ON public.saved_screens
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "saved_screens_update_policy" ON public.saved_screens;
CREATE POLICY "saved_screens_update_policy" ON public.saved_screens
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "saved_screens_delete_policy" ON public.saved_screens;
CREATE POLICY "saved_screens_delete_policy" ON public.saved_screens
    FOR DELETE
    USING (user_id = auth.uid());

-- B. investor_preferences RLS Policies
DROP POLICY IF EXISTS "investor_preferences_select_policy" ON public.investor_preferences;
CREATE POLICY "investor_preferences_select_policy" ON public.investor_preferences
    FOR SELECT
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "investor_preferences_insert_policy" ON public.investor_preferences;
CREATE POLICY "investor_preferences_insert_policy" ON public.investor_preferences
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "investor_preferences_update_policy" ON public.investor_preferences;
CREATE POLICY "investor_preferences_update_policy" ON public.investor_preferences
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
-- ==============================================================================
-- IPO SaaS Platform (IPO OS) â€” Isolated Development Seed Data
-- CAUTION: Development and test environments only.
-- ==============================================================================

-- Sample Mainboard IPO currently Open
INSERT INTO public.ipos (
    id, slug, company_name, symbol, category, issue_type, status, publication_status,
    price_band_low, price_band_high, face_value, lot_size, min_investment,
    issue_size_cr, fresh_issue_cr, ofs_cr, retail_quota_pct, exchange,
    announcement_date, open_date, close_date, allotment_date, refund_date, listing_date,
    about_company, published_at
) VALUES (
    'a1111111-1111-1111-1111-111111111111',
    'premier-energies-limited',
    'Premier Energies Limited',
    'PREMIERENE',
    'mainboard',
    'book_building',
    'open',
    'published',
    427.00,
    450.00,
    1.00,
    33,
    14850.00,
    2830.40,
    1291.40,
    1539.00,
    35.00,
    'NSE, BSE',
    '2026-08-20',
    CURRENT_DATE - INTERVAL '1 day',
    CURRENT_DATE + INTERVAL '1 day',
    CURRENT_DATE + INTERVAL '3 days',
    CURRENT_DATE + INTERVAL '4 days',
    CURRENT_DATE + INTERVAL '6 days',
    'Premier Energies Limited is a leading integrated solar cell and solar module manufacturing company based in India with over two decades of operating track record.',
    NOW()
) ON CONFLICT (slug) DO NOTHING;

-- Sample Mainboard IPO Upcoming
INSERT INTO public.ipos (
    id, slug, company_name, symbol, category, issue_type, status, publication_status,
    price_band_low, price_band_high, face_value, lot_size, min_investment,
    issue_size_cr, fresh_issue_cr, ofs_cr, retail_quota_pct, exchange,
    announcement_date, open_date, close_date, allotment_date, refund_date, listing_date,
    about_company, published_at
) VALUES (
    'b2222222-2222-2222-2222-222222222222',
    'bajaj-housing-finance-limited',
    'Bajaj Housing Finance Limited',
    'BAJAJHFL',
    'mainboard',
    'book_building',
    'upcoming',
    'published',
    66.00,
    70.00,
    10.00,
    214,
    14980.00,
    6560.00,
    3560.00,
    3000.00,
    35.00,
    'NSE, BSE',
    '2026-08-28',
    CURRENT_DATE + INTERVAL '5 days',
    CURRENT_DATE + INTERVAL '8 days',
    CURRENT_DATE + INTERVAL '10 days',
    CURRENT_DATE + INTERVAL '11 days',
    CURRENT_DATE + INTERVAL '14 days',
    'Bajaj Housing Finance Limited is a non-deposit taking Housing Finance Company (HFC) offering finance to individuals as well as corporate entities for purchase and renovation of homes.',
    NOW()
) ON CONFLICT (slug) DO NOTHING;

-- Sample SME NSE IPO Currently Listed
INSERT INTO public.ipos (
    id, slug, company_name, symbol, category, issue_type, status, publication_status,
    price_band_low, price_band_high, face_value, lot_size, min_investment,
    issue_size_cr, fresh_issue_cr, ofs_cr, retail_quota_pct, exchange,
    announcement_date, open_date, close_date, allotment_date, refund_date, listing_date,
    listing_price, about_company, published_at
) VALUES (
    'c3333333-3333-3333-3333-333333333333',
    'paramount-specialty-forgings-limited',
    'Paramount Speciality Forgings Limited',
    'PARAMOUNT',
    'sme_nse',
    'book_building',
    'listed',
    'published',
    57.00,
    59.00,
    10.00,
    2000,
    118000.00,
    32.34,
    32.34,
    0.00,
    35.00,
    'NSE SME (Emerge)',
    '2026-07-15',
    CURRENT_DATE - INTERVAL '30 days',
    CURRENT_DATE - INTERVAL '27 days',
    CURRENT_DATE - INTERVAL '25 days',
    CURRENT_DATE - INTERVAL '24 days',
    CURRENT_DATE - INTERVAL '20 days',
    68.00,
    'Paramount Speciality Forgings is a manufacturer of forged products offering closed die forgings and forged rings for petrochemical, oil & gas and heavy engineering sectors.',
    NOW()
) ON CONFLICT (slug) DO NOTHING;

-- Sample Draft IPO (Admin only visibility test)
INSERT INTO public.ipos (
    id, slug, company_name, symbol, category, issue_type, status, publication_status,
    price_band_low, price_band_high, face_value, lot_size, min_investment,
    issue_size_cr, fresh_issue_cr, ofs_cr, retail_quota_pct, exchange,
    announcement_date, open_date, close_date,
    about_company
) VALUES (
    'd4444444-4444-4444-4444-444444444444',
    'draft-fintech-technologies-limited',
    'Draft Fintech Technologies Limited',
    'DFINTECH',
    'mainboard',
    'book_building',
    'announced',
    'draft',
    120.00,
    125.00,
    2.00,
    100,
    12500.00,
    850.00,
    500.00,
    350.00,
    35.00,
    'NSE, BSE',
    CURRENT_DATE - INTERVAL '5 days',
    CURRENT_DATE + INTERVAL '20 days',
    CURRENT_DATE + INTERVAL '23 days',
    'Internal draft record for regulatory filing review. Not visible to public investors.'
) ON CONFLICT (slug) DO NOTHING;

-- ==============================================================================
-- Phase 3: Research Seed Fixtures for Premier Energies & Bajaj Housing Finance
-- ==============================================================================

-- 1. Business Profiles
INSERT INTO public.ipo_business_profiles (
    ipo_id, company_overview, industry, business_model, products_services,
    competitive_strengths, geographic_presence, key_customers, source
) VALUES (
    'a1111111-1111-1111-1111-111111111111',
    'Premier Energies is an integrated manufacturer of solar photovoltaic (PV) cells and solar modules with over 29 years of operations. The company operates five manufacturing units located in Hyderabad, Telangana.',
    'Renewable Energy / Solar Manufacturing',
    'B2B equipment manufacturing and EPC services for IPPs, rooftop solar developers, and government utilities.',
    ARRAY['Bifacial Solar Modules', 'Monocrystalline Solar Cells', 'Polycrystalline Modules', 'EPC Project Execution'],
    ARRAY['Top 2 solar cell producer in India', 'State-of-the-art TOPCon cell lines', 'Robust order book of â‚¹5,900+ Cr', 'Long-standing global customer relationships'],
    'Exports to North America and Europe, alongside extensive pan-India utility installations.',
    'Tata Power Solar, NTPC, Sterling & Wilson, Vikram Solar',
    'RHP Filing (SEBI)'
) ON CONFLICT (ipo_id) DO NOTHING;

-- 2. Multi-Year Financials (Premier Energies)
INSERT INTO public.ipo_financials (
    ipo_id, financial_year, period_type, statement_type, audit_status,
    revenue_cr, revenue_growth_pct, ebitda_cr, ebitda_margin_pct, pat_cr, pat_margin_pct,
    eps, roe_pct, roce_pct, total_debt_cr, net_worth_cr, operating_cash_flow_cr, source
) VALUES 
(
    'a1111111-1111-1111-1111-111111111111', 'FY22', 'full_year', 'consolidated', 'restated',
    1442.10, 18.5, 96.40, 6.68, 14.30, 0.99, 0.42, 3.20, 5.80, 480.20, 446.50, 112.40, 'RHP Statement II'
),
(
    'a1111111-1111-1111-1111-111111111111', 'FY23', 'full_year', 'consolidated', 'restated',
    1463.20, 1.46, 122.50, 8.37, 37.40, 2.56, 1.05, 7.80, 9.40, 420.10, 484.20, 154.60, 'RHP Statement II'
),
(
    'a1111111-1111-1111-1111-111111111111', 'FY24', 'full_year', 'consolidated', 'restated',
    3143.80, 114.85, 528.20, 16.80, 231.40, 7.36, 6.42, 28.50, 31.20, 310.40, 812.30, 428.10, 'RHP Statement II'
)
ON CONFLICT (ipo_id, financial_year, statement_type) DO NOTHING;

-- 3. Valuation (Premier Energies)
INSERT INTO public.ipo_valuations (
    ipo_id, pe_ratio_low, pe_ratio_high, pb_ratio, ev_ebitda,
    market_cap_cr, post_issue_shares_cr, eps_diluted, industry_pe_median,
    valuation_summary, source
) VALUES (
    'a1111111-1111-1111-1111-111111111111',
    66.5, 70.1, 5.54, 38.2,
    20280.00, 45.0667, 6.42, 85.4,
    'Priced at ~70x FY24 P/E, representing a moderate discount to listed peer median P/E of 85.4x in the solar equipment sector.',
    'RHP / Platform Calculations'
) ON CONFLICT (ipo_id) DO NOTHING;

-- 4. Peers (Premier Energies)
INSERT INTO public.ipo_peers (
    ipo_id, peer_company_name, peer_symbol, market_cap_cr, revenue_cr, pat_cr,
    eps, pe_ratio, pb_ratio, roe_pct, roce_pct, debt_to_equity, source
) VALUES 
(
    'a1111111-1111-1111-1111-111111111111',
    'Websol Energy System Ltd', 'WEBELSOLAR', 6240.00, 584.20, 42.10, 9.80, 112.4, 8.2, 14.5, 16.2, 0.45, 'NSE Exchange'
),
(
    'a1111111-1111-1111-1111-111111111111',
    'Tata Power Solar Systems', 'TATAPOWER', 134200.00, 56000.00, 3800.00, 11.90, 35.6, 3.8, 12.8, 14.1, 1.20, 'NSE Exchange'
)
ON CONFLICT DO NOTHING;

-- 5. Promoters (Premier Energies)
INSERT INTO public.ipo_promoters (
    ipo_id, promoter_name, holding_pre_pct, holding_post_pct, designation, bio, source
) VALUES 
(
    'a1111111-1111-1111-1111-111111111111',
    'Surender Pal Singh Saluja', 48.20, 38.50, 'Chairman & Whole-time Director',
    'Over 3 decades of entrepreneurial leadership in renewable power systems.', 'RHP Capital Structure'
),
(
    'a1111111-1111-1111-1111-111111111111',
    'Chiranjeev Singh Saluja', 24.10, 19.20, 'Managing Director',
    'Oversees manufacturing, capacity expansion, and institutional business.', 'RHP Capital Structure'
)
ON CONFLICT DO NOTHING;

-- 6. Strengths & Risks (Premier Energies)
INSERT INTO public.ipo_strengths (
    ipo_id, title, description, category, display_order, source
) VALUES 
(
    'a1111111-1111-1111-1111-111111111111',
    'Integrated Cell-to-Module Manufacturing',
    'One of the few Indian manufacturers with substantial backward integration into TOPCon solar cell production.',
    'Operational Moat', 1, 'RHP Review'
),
(
    'a1111111-1111-1111-1111-111111111111',
    'Massive Order Book Visibility',
    'Confirmed order book exceeding â‚¹5,900 Crores provides solid revenue visibility for the next 18â€“24 months.',
    'Commercial', 2, 'RHP Review'
)
ON CONFLICT DO NOTHING;

INSERT INTO public.ipo_risks (
    ipo_id, title, description, severity, category, display_order, source
) VALUES 
(
    'a1111111-1111-1111-1111-111111111111',
    'Raw Material & Wafer Import Dependency',
    'Heavy reliance on imports of silicon wafers from overseas suppliers exposes the company to supply chain bottlenecks.',
    'high', 'Supply Chain', 1, 'RHP Risk Factors'
),
(
    'a1111111-1111-1111-1111-111111111111',
    'Tariff Policy & ALMM Regulations',
    'Any changes in Approved List of Models and Manufacturers (ALMM) or custom duty waivers could impact margins.',
    'medium', 'Regulatory', 2, 'RHP Risk Factors'
)
ON CONFLICT DO NOTHING;

-- 7. GMP Entries (Premier Energies)
INSERT INTO public.ipo_gmp_entries (
    ipo_id, gmp_value, gmp_percentage, estimated_listing_price, estimated_listing_gain_pct,
    confidence_level, observed_at, source
) VALUES 
(
    'a1111111-1111-1111-1111-111111111111',
    410.00, 91.11, 860.00, 91.11, 'verified', NOW() - INTERVAL '4 hours', 'Market Intelligence (Unofficial)'
),
(
    'a1111111-1111-1111-1111-111111111111',
    385.00, 85.55, 835.00, 85.55, 'verified', NOW() - INTERVAL '1 day', 'Market Intelligence (Unofficial)'
),
(
    'a1111111-1111-1111-1111-111111111111',
    320.00, 71.11, 770.00, 71.11, 'verified', NOW() - INTERVAL '2 days', 'Market Intelligence (Unofficial)'
)
ON CONFLICT DO NOTHING;

-- 8. Subscription Snapshots (Premier Energies)
INSERT INTO public.ipo_subscription_snapshots (
    ipo_id, day_number, snapshot_date, qib_x, nii_x, retail_x, employee_x, overall_x, source
) VALUES 
(
    'a1111111-1111-1111-1111-111111111111',
    1, CURRENT_DATE - INTERVAL '1 day', 0.05, 5.60, 2.10, 3.40, 2.15, 'BSE / NSE Cumulative Feed'
),
(
    'a1111111-1111-1111-1111-111111111111',
    2, CURRENT_DATE, 4.20, 28.50, 6.80, 7.20, 11.40, 'BSE / NSE Cumulative Feed'
)
ON CONFLICT (ipo_id, day_number, snapshot_date) DO NOTHING;

-- 9. Regulatory Documents (Premier Energies)
INSERT INTO public.ipo_documents (
    ipo_id, title, document_type, file_url, is_public, source, published_at
) VALUES 
(
    'a1111111-1111-1111-1111-111111111111',
    'Red Herring Prospectus (RHP)', 'rhp',
    'https://www.sebi.gov.in/filings/public-issues/aug-2024/premier-energies-limited-rhp.pdf',
    TRUE, 'SEBI / Company Filing', NOW() - INTERVAL '10 days'
),
(
    'a1111111-1111-1111-1111-111111111111',
    'Investor Presentation & Roadshow Deck', 'presentation',
    'https://www.premierenergies.com/investor-presentation.pdf',
    TRUE, 'Company IR', NOW() - INTERVAL '5 days'
)
ON CONFLICT DO NOTHING;

-- 10. News (Premier Energies)
INSERT INTO public.ipo_news (
    ipo_id, headline, summary, source, source_url, sentiment, published_at
) VALUES 
(
    'a1111111-1111-1111-1111-111111111111',
    'Premier Energies IPO subscribed 11.4x on Day 2 led by robust NII demand',
    'Non-institutional and retail investors drove heavy bidding for the solar manufacturer issue with grey market sentiment surging over 90%.',
    'Financial Express', 'https://www.financialexpress.com/market/premier-energies-day-2',
    'positive', NOW() - INTERVAL '2 hours'
),
(
    'a1111111-1111-1111-1111-111111111111',
    'Premier Energies raises â‚¹846 Cr from Anchor Investors prior to issue opening',
    'Marquee global and domestic mutual funds including Nomura, Blackrock, and HDFC MF participated in the anchor book allocation.',
    'Economic Times', 'https://economictimes.indiatimes.com/market/premier-energies-anchor',
    'positive', NOW() - INTERVAL '2 days'
)
ON CONFLICT DO NOTHING;

-- ==============================================================================
-- 11. Phase 4: Sample Development Applicants & Applications
-- NOTE: For local development / testing only. Zero real credentials or PII.
-- ==============================================================================

DO $$
DECLARE
    v_user_id UUID;
BEGIN
    SELECT id INTO v_user_id FROM public.profiles LIMIT 1;
    IF v_user_id IS NOT NULL THEN
        INSERT INTO public.applicant_profiles (
            id, user_id, relationship, display_name, pan_masked, demat_dp_id_masked, demat_account_no_masked, upi_id_masked, default_category, notes, is_active
        ) VALUES 
        (
            'c1111111-1111-1111-1111-111111111111',
            v_user_id,
            'self',
            'Primary Demat (Self)',
            'ABCDE****F',
            'IN300***',
            '****1234',
            'ra***@okaxis',
            'retail',
            'Primary trading and IPO application account',
            TRUE
        ),
        (
            'c2222222-2222-2222-2222-222222222222',
            v_user_id,
            'father',
            'Father Account',
            'FGHIJ****K',
            '12081***',
            '****5678',
            'fa***@icici',
            'retail',
            'Family account used for secondary retail allotment quota',
            TRUE
        ),
        (
            'c3333333-3333-3333-3333-333333333333',
            v_user_id,
            'spouse',
            'Spouse Account',
            'LMNOP****Q',
            'IN302***',
            '****9012',
            'sp***@okhdfcbank',
            's_hni',
            'Used for high net worth and retail applications',
            TRUE
        )
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

