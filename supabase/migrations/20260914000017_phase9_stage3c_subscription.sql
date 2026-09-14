-- ==============================================================================
-- Migration: 20260914000017_phase9_stage3c_subscription.sql
-- Phase 9 Stage 3C: Subscription Demand & Allotment Intelligence (Revision 2.2)
-- ==============================================================================

-- 1. ENUMS
DO $$ BEGIN
  CREATE TYPE public.subscription_feed_scope AS ENUM (
    'exchange_specific',
    'consolidated'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.subscription_anomaly_status AS ENUM (
    'valid',
    'valid_with_adjustment',
    'anomalous',
    'source_corrected',
    'invalid'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.registrar_query_state AS ENUM (
    'not_discovered',
    'announced',
    'portal_reachable',
    'query_endpoint_detected',
    'query_active',
    'temporarily_unavailable',
    'blocked',
    'unknown'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.ipo_allotment_lifecycle_state AS ENUM (
    'bidding_closed',
    'awaiting_basis',
    'basis_finalized',
    'allotment_out',
    'refunds_initiated',
    'demat_credited',
    'listed'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. Add designated_exchange to public.ipos if not present
ALTER TABLE public.ipos
  ADD COLUMN IF NOT EXISTS designated_exchange VARCHAR(10) NULL;

-- 3. DURABLE SUBSCRIPTION OBSERVATIONS (Survives raw ingestion pruning)
-- Invariant: ipo_id is ON DELETE RESTRICT (published IPOs with intelligence cannot be hard-deleted)
-- Invariant: source_observation_id is ON DELETE SET NULL + permanent source_observation_hash
CREATE TABLE IF NOT EXISTS public.ipo_subscription_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ipo_id UUID NOT NULL REFERENCES public.ipos(id) ON DELETE RESTRICT,
  source_observation_id UUID NULL REFERENCES public.ipo_ingestion_observations(id) ON DELETE SET NULL,
  source_observation_uid UUID NOT NULL,
  source_observation_hash VARCHAR(64) NOT NULL,
  exchange VARCHAR(10) NOT NULL, -- 'NSE', 'BSE', 'CUMULATIVE'
  feed_scope public.subscription_feed_scope NOT NULL DEFAULT 'consolidated',
  source_composition TEXT[] NOT NULL DEFAULT ARRAY['CUMULATIVE']::TEXT[],
  day_number INTEGER NOT NULL,
  snapshot_time TIMESTAMPTZ NOT NULL,
  reported_overall_x NUMERIC(10,2) NOT NULL,
  computed_overall_x NUMERIC(10,2) NULL,
  calculation_basis VARCHAR(50) NOT NULL,
  tolerance_pct NUMERIC(5,2) NOT NULL DEFAULT 5.00,
  anomaly_status public.subscription_anomaly_status NOT NULL DEFAULT 'valid',
  anomaly_reason TEXT NULL,
  source_qib_definition VARCHAR(50) NOT NULL DEFAULT 'net_of_anchor',
  definition_verified BOOLEAN NOT NULL DEFAULT true,
  anchor_adjustment_applied BOOLEAN NOT NULL DEFAULT false,
  qib_x NUMERIC(10,2) NULL,
  b_hni_x NUMERIC(10,2) NULL,
  s_hni_x NUMERIC(10,2) NULL,
  retail_x NUMERIC(10,2) NULL,
  employee_x NUMERIC(10,2) NULL,
  shareholder_x NUMERIC(10,2) NULL,
  category_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  validation_status public.ipo_verification_status NOT NULL DEFAULT 'unverified',
  raw_payload_hash VARCHAR(64) NOT NULL,
  is_corrected BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_obs_ipo_time ON public.ipo_subscription_observations(ipo_id, day_number, snapshot_time ASC);
CREATE INDEX IF NOT EXISTS idx_sub_obs_hash ON public.ipo_subscription_observations(source_observation_hash);

-- 4. ENHANCE CANONICAL SNAPSHOTS TABLE (Phase 3/6/8 Compatibility)
ALTER TABLE public.ipo_subscription_snapshots
  ADD COLUMN IF NOT EXISTS latest_observation_id UUID REFERENCES public.ipo_subscription_observations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_observation_id UUID REFERENCES public.ipo_ingestion_observations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_observation_hash VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS authoritative_exchange VARCHAR(10) NULL,
  ADD COLUMN IF NOT EXISTS feed_scope public.subscription_feed_scope NOT NULL DEFAULT 'consolidated',
  ADD COLUMN IF NOT EXISTS source_composition TEXT[] NOT NULL DEFAULT ARRAY['CUMULATIVE']::TEXT[],
  ADD COLUMN IF NOT EXISTS b_hni_x NUMERIC(10,2) NULL,
  ADD COLUMN IF NOT EXISTS s_hni_x NUMERIC(10,2) NULL,
  ADD COLUMN IF NOT EXISTS shareholder_x NUMERIC(10,2) NULL,
  ADD COLUMN IF NOT EXISTS category_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_final_for_day BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS session_close_source TEXT NULL,
  ADD COLUMN IF NOT EXISTS validation_status public.ipo_verification_status NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 5. ALLOTMENT LIFECYCLE EVENTS
CREATE TABLE IF NOT EXISTS public.ipo_allotment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ipo_id UUID NOT NULL REFERENCES public.ipos(id) ON DELETE RESTRICT,
  lifecycle_state public.ipo_allotment_lifecycle_state NOT NULL,
  source_observation_id UUID REFERENCES public.ipo_ingestion_observations(id) ON DELETE SET NULL,
  event_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_allotment_events_ipo ON public.ipo_allotment_events(ipo_id, event_time ASC);

-- 6. OFFICIAL BASIS OF ALLOTMENT FACTS (Source: Stage 3B verified document)
CREATE TABLE IF NOT EXISTS public.ipo_allotment_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ipo_id UUID NOT NULL REFERENCES public.ipos(id) ON DELETE RESTRICT UNIQUE,
  basis_document_id UUID NOT NULL REFERENCES public.ipo_documents(id) ON DELETE RESTRICT,
  official_total_valid_applications BIGINT NOT NULL,
  official_total_rejected_applications BIGINT NOT NULL,
  official_retail_valid_applications BIGINT NOT NULL,
  official_retail_successful_applicants BIGINT NOT NULL,
  official_retail_lottery_ratio NUMERIC(8,4) NOT NULL,
  official_shni_valid_applications BIGINT NULL,
  official_shni_successful_applicants BIGINT NULL,
  official_shni_lottery_ratio NUMERIC(8,4) NULL,
  official_bhni_proportionate_factor NUMERIC(10,4) NULL,
  proposed_allotment_date DATE NULL,
  proposed_listing_date DATE NULL,
  verified_by_observation_id UUID REFERENCES public.ipo_ingestion_observations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. OBSERVABLE REGISTRAR PORTAL STATUS (Read-only query endpoint status)
CREATE TABLE IF NOT EXISTS public.ipo_registrar_portal_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ipo_id UUID NOT NULL REFERENCES public.ipos(id) ON DELETE RESTRICT UNIQUE,
  registrar_name VARCHAR(100) NOT NULL,
  portal_url TEXT NOT NULL,
  query_state public.registrar_query_state NOT NULL DEFAULT 'not_discovered',
  last_probed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  probe_http_status INTEGER NULL,
  company_detected_in_dropdown BOOLEAN NOT NULL DEFAULT false,
  error_details TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. DERIVED ALLOTMENT ESTIMATES (Pre-Basis Intelligence with Disclaimer)
CREATE TABLE IF NOT EXISTS public.ipo_allotment_estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ipo_id UUID NOT NULL REFERENCES public.ipos(id) ON DELETE RESTRICT UNIQUE,
  final_subscription_snapshot_id UUID REFERENCES public.ipo_subscription_snapshots(id) ON DELETE SET NULL,
  estimated_retail_subscription_x NUMERIC(10,2) NOT NULL,
  estimated_retail_lottery_ratio NUMERIC(8,2) NOT NULL,
  estimated_retail_allotment_probability_pct NUMERIC(5,2) NOT NULL,
  estimation_disclaimer TEXT NOT NULL DEFAULT 'Simplified mathematical indicator based on final bidding multiples. Official allotment odds are governed by the Registrar Basis of Allotment.',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.ipo_subscription_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ipo_allotment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ipo_allotment_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ipo_registrar_portal_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ipo_allotment_estimates ENABLE ROW LEVEL SECURITY;

-- Public can view data for published IPOs
DROP POLICY IF EXISTS "Public read ipo_subscription_observations" ON public.ipo_subscription_observations;
CREATE POLICY "Public read ipo_subscription_observations"
  ON public.ipo_subscription_observations FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.ipos WHERE ipos.id = ipo_subscription_observations.ipo_id AND ipos.publication_status = 'published'));

DROP POLICY IF EXISTS "Public read ipo_allotment_events" ON public.ipo_allotment_events;
CREATE POLICY "Public read ipo_allotment_events"
  ON public.ipo_allotment_events FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.ipos WHERE ipos.id = ipo_allotment_events.ipo_id AND ipos.publication_status = 'published'));

DROP POLICY IF EXISTS "Public read ipo_allotment_facts" ON public.ipo_allotment_facts;
CREATE POLICY "Public read ipo_allotment_facts"
  ON public.ipo_allotment_facts FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.ipos WHERE ipos.id = ipo_allotment_facts.ipo_id AND ipos.publication_status = 'published'));

DROP POLICY IF EXISTS "Public read ipo_registrar_portal_status" ON public.ipo_registrar_portal_status;
CREATE POLICY "Public read ipo_registrar_portal_status"
  ON public.ipo_registrar_portal_status FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.ipos WHERE ipos.id = ipo_registrar_portal_status.ipo_id AND ipos.publication_status = 'published'));

DROP POLICY IF EXISTS "Public read ipo_allotment_estimates" ON public.ipo_allotment_estimates;
CREATE POLICY "Public read ipo_allotment_estimates"
  ON public.ipo_allotment_estimates FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.ipos WHERE ipos.id = ipo_allotment_estimates.ipo_id AND ipos.publication_status = 'published'));

-- Service role / admins have full access
DROP POLICY IF EXISTS "Admins manage ipo_subscription_observations" ON public.ipo_subscription_observations;
CREATE POLICY "Admins manage ipo_subscription_observations"
  ON public.ipo_subscription_observations FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

DROP POLICY IF EXISTS "Admins manage ipo_allotment_events" ON public.ipo_allotment_events;
CREATE POLICY "Admins manage ipo_allotment_events"
  ON public.ipo_allotment_events FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

DROP POLICY IF EXISTS "Admins manage ipo_allotment_facts" ON public.ipo_allotment_facts;
CREATE POLICY "Admins manage ipo_allotment_facts"
  ON public.ipo_allotment_facts FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

DROP POLICY IF EXISTS "Admins manage ipo_registrar_portal_status" ON public.ipo_registrar_portal_status;
CREATE POLICY "Admins manage ipo_registrar_portal_status"
  ON public.ipo_registrar_portal_status FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

DROP POLICY IF EXISTS "Admins manage ipo_allotment_estimates" ON public.ipo_allotment_estimates;
CREATE POLICY "Admins manage ipo_allotment_estimates"
  ON public.ipo_allotment_estimates FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
