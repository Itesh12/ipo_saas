-- ==============================================================================
-- Migration: 20260914000018_phase9_stage3d_gmp.sql
-- Phase 9 Stage 3D: Grey Market Premium (GMP) Intelligence (Revision 2)
-- ==============================================================================

-- 1. ENUMS
DO $$ BEGIN
  CREATE TYPE public.gmp_trend_direction AS ENUM (
    'rising',
    'falling',
    'stable'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.gmp_anomaly_status AS ENUM (
    'valid',
    'outlier',
    'spike_quarantined',
    'stale_post_listing',
    'invalid'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.gmp_freshness_state AS ENUM (
    'fresh',
    'aging',
    'stale',
    'expired'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. DURABLE GMP OBSERVATIONS (Survives raw ingestion pruning)
-- Invariant: ipo_id is ON DELETE RESTRICT (published IPOs with intelligence cannot be hard-deleted)
-- Invariant: source_observation_id is ON DELETE SET NULL + permanent source_observation_hash
CREATE TABLE IF NOT EXISTS public.ipo_gmp_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ipo_id UUID NOT NULL REFERENCES public.ipos(id) ON DELETE RESTRICT,
  source_observation_id UUID NULL REFERENCES public.ipo_ingestion_observations(id) ON DELETE SET NULL,
  source_observation_uid UUID NOT NULL,
  source_observation_hash VARCHAR(64) NOT NULL,
  gmp_source VARCHAR(64) NOT NULL, -- e.g. 'chittorgarh_otc', 'ipowatch_otc', 'broker_desk_mum'
  source_family VARCHAR(32) NOT NULL DEFAULT 'aggregator', -- 'aggregator', 'broker_desk', 'partner_api', 'manual_audit'
  publisher_id VARCHAR(64) NOT NULL,
  upstream_source_id VARCHAR(64) NULL,
  independence_group VARCHAR(64) NOT NULL, -- Grouped to prevent syndicated false consensus
  quote_time TIMESTAMPTZ NOT NULL,
  reported_gmp_value NUMERIC(10,2) NULL,
  reported_kostak NUMERIC(10,2) NULL,
  reported_subject_to_sauda NUMERIC(10,2) NULL,
  sauda_condition_notes TEXT NULL,
  anomaly_status public.gmp_anomaly_status NOT NULL DEFAULT 'valid',
  anomaly_reason TEXT NULL,
  validation_status public.ipo_verification_status NOT NULL DEFAULT 'unverified',
  raw_payload_hash VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gmp_obs_ipo_time ON public.ipo_gmp_observations(ipo_id, quote_time DESC);
CREATE INDEX IF NOT EXISTS idx_gmp_obs_hash ON public.ipo_gmp_observations(source_observation_hash);
CREATE INDEX IF NOT EXISTS idx_gmp_obs_indep_group ON public.ipo_gmp_observations(independence_group);

-- 3. ENHANCE CANONICAL SNAPSHOTS TABLE (Phase 3/6/7/8 Backward Compatibility)
-- Invariant: Legacy rows retain unverified status and receive source_count = 1 without false upgrades
ALTER TABLE public.ipo_gmp_entries
  ADD COLUMN IF NOT EXISTS latest_observation_id UUID REFERENCES public.ipo_gmp_observations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS source_spread_pct NUMERIC(6,2) NULL,
  ADD COLUMN IF NOT EXISTS kostak_rate NUMERIC(10,2) NULL,
  ADD COLUMN IF NOT EXISTS subject_to_sauda_rate NUMERIC(10,2) NULL,
  ADD COLUMN IF NOT EXISTS trend_direction public.gmp_trend_direction NOT NULL DEFAULT 'stable',
  ADD COLUMN IF NOT EXISTS day_change_value NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS day_change_pct NUMERIC(8,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS freshness_state VARCHAR(20) NOT NULL DEFAULT 'fresh',
  ADD COLUMN IF NOT EXISTS policy_version VARCHAR(50) NOT NULL DEFAULT 'GMP_POLICY_V1_2026_09',
  ADD COLUMN IF NOT EXISTS is_post_listing_frozen BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_gmp_entries_trend ON public.ipo_gmp_entries(ipo_id, observed_at DESC);

-- 4. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.ipo_gmp_observations ENABLE ROW LEVEL SECURITY;

-- Public read for published IPOs
DROP POLICY IF EXISTS "Public read ipo_gmp_observations" ON public.ipo_gmp_observations;
CREATE POLICY "Public read ipo_gmp_observations"
  ON public.ipo_gmp_observations FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.ipos WHERE ipos.id = ipo_gmp_observations.ipo_id AND ipos.publication_status = 'published'));

-- Service role / admins have full access
DROP POLICY IF EXISTS "Admins manage ipo_gmp_observations" ON public.ipo_gmp_observations;
CREATE POLICY "Admins manage ipo_gmp_observations"
  ON public.ipo_gmp_observations FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
