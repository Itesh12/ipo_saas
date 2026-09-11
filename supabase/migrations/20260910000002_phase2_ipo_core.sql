-- ==============================================================================
-- IPO SaaS Platform (IPO OS) — Phase 2: IPO Core Database Migration
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
