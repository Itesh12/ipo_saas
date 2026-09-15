-- ==============================================================================
-- Migration: 20260914000019_phase9_stage3e_news_alerts.sql
-- Phase 9 Stage 3E: News, Announcements & Event-Driven Alert Orchestration (Revision 2)
-- ==============================================================================

-- 1. ENUMS
DO $$ BEGIN
  CREATE TYPE public.news_category AS ENUM (
    'regulatory_announcement',
    'price_band_revision',
    'issue_extension',
    'governance_litigation',
    'market_commentary',
    'general_news'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.news_authoritativeness AS ENUM (
    'official_regulatory',
    'third_party_media'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.news_verification_status AS ENUM (
    'verified',
    'unverified',
    'quarantined_unmatched'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.regulatory_event_type AS ENUM (
    'price_band_changed',
    'issue_open_date_changed',
    'issue_close_date_changed',
    'issue_withdrawn',
    'issue_extended',
    'listing_date_changed',
    'rhp_filed',
    'corrigendum_filed',
    'anchor_allocation_published',
    'basis_of_allotment_published',
    'litigation_disclosed',
    'material_adverse_event'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. DURABLE NEWS & ANNOUNCEMENTS OBSERVATIONS TABLE
CREATE TABLE IF NOT EXISTS public.ipo_news_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ipo_id UUID REFERENCES public.ipos(id) ON DELETE RESTRICT,
  source_observation_id UUID REFERENCES public.ipo_ingestion_observations(id) ON DELETE SET NULL,
  source_observation_uid TEXT NOT NULL,
  source_observation_hash TEXT NOT NULL,
  news_source TEXT NOT NULL,
  source_family TEXT NOT NULL,
  publisher_id TEXT NOT NULL,
  upstream_source_id TEXT,
  independence_group TEXT NOT NULL,
  headline TEXT NOT NULL,
  excerpt TEXT,
  raw_regulatory_content TEXT,
  source_url TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL,
  content_hash TEXT NOT NULL,
  story_cluster_id UUID NOT NULL DEFAULT gen_random_uuid(),
  authoritativeness public.news_authoritativeness NOT NULL DEFAULT 'third_party_media',
  category public.news_category NOT NULL DEFAULT 'general_news',
  verification_status public.news_verification_status NOT NULL DEFAULT 'unverified',
  is_price_sensitive BOOLEAN NOT NULL DEFAULT FALSE,
  matched_entity_id UUID REFERENCES public.ipos(id) ON DELETE SET NULL,
  resolution_method TEXT,
  resolution_confidence NUMERIC(3, 2) DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. ENHANCE CANONICAL ipo_news TABLE
DO $$ BEGIN
  ALTER TABLE public.ipo_news ADD COLUMN IF NOT EXISTS category public.news_category NOT NULL DEFAULT 'general_news';
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE public.ipo_news ADD COLUMN IF NOT EXISTS authoritativeness public.news_authoritativeness NOT NULL DEFAULT 'third_party_media';
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE public.ipo_news ADD COLUMN IF NOT EXISTS verification_status public.news_verification_status NOT NULL DEFAULT 'unverified';
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE public.ipo_news ADD COLUMN IF NOT EXISTS content_hash TEXT;
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE public.ipo_news ADD COLUMN IF NOT EXISTS story_cluster_id UUID;
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE public.ipo_news ADD COLUMN IF NOT EXISTS canonical_story_id UUID;
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE public.ipo_news ADD COLUMN IF NOT EXISTS publisher_id TEXT NOT NULL DEFAULT 'unknown';
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE public.ipo_news ADD COLUMN IF NOT EXISTS independence_group TEXT NOT NULL DEFAULT 'GRP_DEFAULT';
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE public.ipo_news ADD COLUMN IF NOT EXISTS is_price_sensitive BOOLEAN NOT NULL DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE public.ipo_news ADD COLUMN IF NOT EXISTS structured_event_type public.regulatory_event_type;
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE public.ipo_news ADD COLUMN IF NOT EXISTS relevance_score NUMERIC(4, 2) DEFAULT 1.00;
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE public.ipo_news ADD COLUMN IF NOT EXISTS source_observation_id UUID REFERENCES public.ipo_news_observations(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN null; END $$;

-- 4. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_ipo_news_obs_ipo_id ON public.ipo_news_observations(ipo_id);
CREATE INDEX IF NOT EXISTS idx_ipo_news_obs_cluster ON public.ipo_news_observations(story_cluster_id);
CREATE INDEX IF NOT EXISTS idx_ipo_news_obs_hash ON public.ipo_news_observations(content_hash);
CREATE INDEX IF NOT EXISTS idx_ipo_news_obs_pub_date ON public.ipo_news_observations(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_ipo_news_category ON public.ipo_news(category);
CREATE INDEX IF NOT EXISTS idx_ipo_news_authoritativeness ON public.ipo_news(authoritativeness);
CREATE INDEX IF NOT EXISTS idx_ipo_news_cluster ON public.ipo_news(story_cluster_id);
CREATE INDEX IF NOT EXISTS idx_ipo_news_hash ON public.ipo_news(content_hash);

-- 5. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.ipo_news_observations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view verified news observations" ON public.ipo_news_observations;
CREATE POLICY "Public can view verified news observations" ON public.ipo_news_observations
  FOR SELECT TO authenticated, anon
  USING (verification_status = 'verified');

DROP POLICY IF EXISTS "Admins have full access on news observations" ON public.ipo_news_observations;
CREATE POLICY "Admins have full access on news observations" ON public.ipo_news_observations
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins have full access on ipo_news" ON public.ipo_news;
CREATE POLICY "Admins have full access on ipo_news" ON public.ipo_news
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );
