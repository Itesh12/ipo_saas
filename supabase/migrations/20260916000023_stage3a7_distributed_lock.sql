-- ==============================================================================
-- Migration: 20260916000023_stage3a7_distributed_lock.sql
-- Phase 9 Stage 3A.7: Production Automation Distributed Concurrency Guard
-- 
-- Single cluster-wide execution lock ('ipo_sync_global') preventing overlapping
-- scheduled cron jobs (NSE hourly, SEBI 4-hourly, Master twice-daily) from
-- competing or creating race conditions during acquisition and canonical promotion.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.ipo_sync_global_lock (
  lock_key VARCHAR(64) PRIMARY KEY DEFAULT 'ipo_sync_global',
  locked_by TEXT NOT NULL,
  job_name TEXT,
  target_source TEXT,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  metadata JSONB
);

-- Index for expiration lookups
CREATE INDEX IF NOT EXISTS idx_sync_global_lock_expires ON public.ipo_sync_global_lock(expires_at);

-- RLS
ALTER TABLE public.ipo_sync_global_lock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages sync global lock"
  ON public.ipo_sync_global_lock FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins can view sync global lock"
  ON public.ipo_sync_global_lock FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin')
    )
  );

-- Function: Atomic lock acquisition with auto-expiring lease
CREATE OR REPLACE FUNCTION public.acquire_ipo_sync_lock(
  p_lock_key TEXT,
  p_locked_by TEXT,
  p_job_name TEXT,
  p_target_source TEXT,
  p_ttl_seconds INT DEFAULT 300
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_existing_expires TIMESTAMPTZ;
  v_new_expires TIMESTAMPTZ := v_now + (p_ttl_seconds || ' seconds')::INTERVAL;
BEGIN
  -- Check existing lock
  SELECT expires_at INTO v_existing_expires
  FROM public.ipo_sync_global_lock
  WHERE lock_key = p_lock_key
  FOR UPDATE;

  IF FOUND THEN
    -- If lock is still valid and not expired, cannot acquire
    IF v_existing_expires > v_now THEN
      RETURN FALSE;
    ELSE
      -- Lock expired, update and take ownership
      UPDATE public.ipo_sync_global_lock
      SET
        locked_by = p_locked_by,
        job_name = p_job_name,
        target_source = p_target_source,
        acquired_at = v_now,
        expires_at = v_new_expires,
        metadata = jsonb_build_object('acquired_at', v_now, 'ttl_seconds', p_ttl_seconds)
      WHERE lock_key = p_lock_key;
      RETURN TRUE;
    END IF;
  ELSE
    -- No lock exists, insert new
    INSERT INTO public.ipo_sync_global_lock (
      lock_key,
      locked_by,
      job_name,
      target_source,
      acquired_at,
      expires_at,
      metadata
    ) VALUES (
      p_lock_key,
      p_locked_by,
      p_job_name,
      p_target_source,
      v_now,
      v_new_expires,
      jsonb_build_object('acquired_at', v_now, 'ttl_seconds', p_ttl_seconds)
    );
    RETURN TRUE;
  END IF;
END;
$$;

-- Function: Atomic lock release
CREATE OR REPLACE FUNCTION public.release_ipo_sync_lock(
  p_lock_key TEXT,
  p_locked_by TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.ipo_sync_global_lock
  WHERE lock_key = p_lock_key
    AND locked_by = p_locked_by;

  RETURN FOUND;
END;
$$;
