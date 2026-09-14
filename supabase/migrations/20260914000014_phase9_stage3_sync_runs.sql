-- ==============================================================================
-- Migration: 20260914000014_phase9_stage3_sync_runs.sql
-- Phase 9 Stage 3A.2: Production Source Synchronization Runs & Observability
-- 
-- Tracks every execution of the live source acquisition engine (SEBI, NSE, BSE)
-- with HTTP telemetry, payload hash, record metrics, and fail-closed audit trail.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.ipo_source_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source VARCHAR(32) NOT NULL,                    -- 'sebi', 'nse', 'bse', 'upstox'
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status VARCHAR(32) NOT NULL DEFAULT 'running',  -- 'running', 'success', 'degraded', 'failed'
  http_status INTEGER,
  records_discovered INTEGER NOT NULL DEFAULT 0,
  records_ingested INTEGER NOT NULL DEFAULT 0,
  records_unchanged INTEGER NOT NULL DEFAULT 0,
  records_conflicted INTEGER NOT NULL DEFAULT 0,
  records_failed INTEGER NOT NULL DEFAULT 0,
  response_hash VARCHAR(64),                      -- SHA-256 of raw response body
  parser_version VARCHAR(32) NOT NULL DEFAULT 'v1.0',
  error_code VARCHAR(64),
  sanitized_error TEXT,
  metadata JSONB,
  raw_payload_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days')
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_source ON public.ipo_source_sync_runs(source, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_runs_status ON public.ipo_source_sync_runs(status);

-- Enable RLS
ALTER TABLE public.ipo_source_sync_runs ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated Admins can view sync runs
CREATE POLICY "Admins can view sync runs"
  ON public.ipo_source_sync_runs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin')
    )
  );

-- Policy: Service role has full access
CREATE POLICY "Service role manages sync runs"
  ON public.ipo_source_sync_runs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
