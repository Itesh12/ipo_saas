-- ==============================================================================
-- PHASE 10 / STAGE 5A: FINANCIAL EVENT PROCESSING & IDEMPOTENCY LEDGER
-- Migration: 20260916000025_stage5_financial_event_ledger.sql
-- ==============================================================================

-- 1. Status Enum
DO $$ BEGIN
  CREATE TYPE public.domain_event_processing_status AS ENUM (
    'RECEIVED',
    'PROCESSING',
    'PROCESSED',
    'FAILED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Processed Domain Events Ledger
-- Guarantees at-most-once financial execution via dual-key semantics:
-- - event_id: unique event delivery instance identity
-- - idempotency_key: unique business operation identity (e.g. ALLOTMENT:app_id:allot_id)
-- - processing_lease_expires_at: enables recovery from crashed workers
CREATE TABLE IF NOT EXISTS public.processed_domain_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL UNIQUE,
  idempotency_key VARCHAR(128) NOT NULL UNIQUE,
  event_type VARCHAR(50) NOT NULL,
  aggregate_type VARCHAR(50) NOT NULL,
  aggregate_id UUID NOT NULL,
  processing_status public.domain_event_processing_status NOT NULL DEFAULT 'RECEIVED',
  processing_owner_id VARCHAR(100),
  processing_lease_expires_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  error_code VARCHAR(50),
  error_message TEXT,
  result_summary JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_processed_events_idemp ON public.processed_domain_events(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_processed_events_agg ON public.processed_domain_events(aggregate_type, aggregate_id);
CREATE INDEX IF NOT EXISTS idx_processed_events_status ON public.processed_domain_events(processing_status);
CREATE INDEX IF NOT EXISTS idx_processed_events_lease ON public.processed_domain_events(processing_lease_expires_at);

-- 3. Row Level Security
ALTER TABLE public.processed_domain_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access to processed_domain_events"
  ON public.processed_domain_events FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Service role full access to processed_domain_events"
  ON public.processed_domain_events FOR ALL
  USING (true);
