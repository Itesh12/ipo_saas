-- ==============================================================================
-- CANDIDATE D: STAGE 6 LISTING, MARKET PRICING & PORTFOLIO VALUATION ENGINE
-- Migration: 20260925000033_candidate_d_listing_valuation_engine.sql
-- ==============================================================================

-- 1. Exchange Listing Status Enum
DO $$ BEGIN
  CREATE TYPE public.exchange_listing_status AS ENUM (
    'NOT_LISTED',
    'UPCOMING',
    'LISTED',
    'TRADING',
    'SUSPENDED',
    'DELISTED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Add exchange_listing_status and listing reference to securities if not present
DO $$ BEGIN
  ALTER TABLE public.securities 
    ADD COLUMN IF NOT EXISTS listing_status public.exchange_listing_status NOT NULL DEFAULT 'NOT_LISTED',
    ADD COLUMN IF NOT EXISTS listing_date DATE,
    ADD COLUMN IF NOT EXISTS listing_price NUMERIC(20,8);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 3. Add provider_timestamp to security_prices for monotonic updates
DO $$ BEGIN
  ALTER TABLE public.security_prices 
    ADD COLUMN IF NOT EXISTS provider_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW();
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 4. Immutable Listing Events Ledger (ipo_listing_events)
-- Append-only audit history of listing announcements, first-trade observations, and circulars
CREATE TABLE IF NOT EXISTS public.ipo_listing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ipo_id UUID NOT NULL REFERENCES public.ipos(id) ON DELETE RESTRICT,
  security_id UUID NOT NULL REFERENCES public.securities(id) ON DELETE RESTRICT,
  exchange VARCHAR(20) NOT NULL DEFAULT 'NSE',
  event_type VARCHAR(50) NOT NULL, -- e.g. LISTING_SCHEDULED, LISTING_CONFIRMED, FIRST_TRADE_OBSERVED
  
  listing_date DATE NOT NULL,
  listing_price NUMERIC(20,8) CHECK (listing_price >= 0),
  issue_price NUMERIC(20,8) CHECK (issue_price >= 0),
  listing_gain NUMERIC(20,8),
  listing_gain_pct NUMERIC(10,4),
  
  source VARCHAR(50) NOT NULL, -- e.g. EXCHANGE_DIRECT, REGISTRAR_NOTICE, OFFICIAL_CIRCULAR
  source_record_id VARCHAR(150),
  payload_hash VARCHAR(64) NOT NULL,
  idempotency_key VARCHAR(150) NOT NULL UNIQUE,
  
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT uq_listing_event_source UNIQUE (source, source_record_id)
);

CREATE INDEX IF NOT EXISTS idx_listing_events_ipo ON public.ipo_listing_events(ipo_id, event_type);
CREATE INDEX IF NOT EXISTS idx_listing_events_security ON public.ipo_listing_events(security_id);
CREATE INDEX IF NOT EXISTS idx_listing_events_effective ON public.ipo_listing_events(effective_at DESC);

-- 5. Market Price Observations (market_price_observations)
-- Immutable raw and normalized provider quotes with SHA-256 provenance
CREATE TABLE IF NOT EXISTS public.market_price_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  security_id UUID NOT NULL REFERENCES public.securities(id) ON DELETE RESTRICT,
  price NUMERIC(20,8) NOT NULL CHECK (price > 0),
  day_open NUMERIC(20,8),
  day_high NUMERIC(20,8),
  day_low NUMERIC(20,8),
  previous_close NUMERIC(20,8),
  change_amount NUMERIC(20,8),
  change_pct NUMERIC(10,4),
  
  provider VARCHAR(50) NOT NULL,
  raw_hash VARCHAR(64) NOT NULL,
  is_verified BOOLEAN NOT NULL DEFAULT true,
  
  provider_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_price_obs_sec_time 
  ON public.market_price_observations(security_id, provider_timestamp DESC);

-- 6. Row Level Security (RLS)
ALTER TABLE public.ipo_listing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_price_observations ENABLE ROW LEVEL SECURITY;

-- Read policy: Authenticated users can read listing events and price observations
DO $$ BEGIN
  CREATE POLICY listing_events_read_authenticated ON public.ipo_listing_events
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY market_price_obs_read_authenticated ON public.market_price_observations
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Write policy: Service role only
DO $$ BEGIN
  CREATE POLICY listing_events_service_role ON public.ipo_listing_events
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY market_price_obs_service_role ON public.market_price_observations
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
