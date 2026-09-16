-- ==============================================================================
-- Migration: 20260915000022_stage3a6_market_segments_and_backfill.sql
-- Description: Phase 9 Stage 3A.6 Market Segments & Historical Backfill Page Auditing
-- Adds market_segment to ipos, inbox, observations, and creates page-level audit table.
-- ==============================================================================

-- 1. Add market_segment to public.ipos
ALTER TABLE public.ipos 
    ADD COLUMN IF NOT EXISTS market_segment VARCHAR(32) NOT NULL DEFAULT 'MAINBOARD';

ALTER TABLE public.ipos DROP CONSTRAINT IF EXISTS ipos_market_segment_check;
ALTER TABLE public.ipos ADD CONSTRAINT ipos_market_segment_check 
    CHECK (market_segment IN ('MAINBOARD', 'NSE_SME', 'BSE_SME'));

-- 2. Add market_segment to public.ipo_ingestion_inbox
ALTER TABLE public.ipo_ingestion_inbox 
    ADD COLUMN IF NOT EXISTS market_segment VARCHAR(32) NOT NULL DEFAULT 'MAINBOARD';

-- 3. Add market_segment to public.ipo_ingestion_observations
ALTER TABLE public.ipo_ingestion_observations 
    ADD COLUMN IF NOT EXISTS market_segment VARCHAR(32) NOT NULL DEFAULT 'MAINBOARD';

-- 4. Create ipo_source_page_sync_audit table for page traversal accounting
CREATE TABLE IF NOT EXISTS public.ipo_source_page_sync_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source VARCHAR(64) NOT NULL,
    segment VARCHAR(32) NOT NULL DEFAULT 'MAINBOARD',
    date_range VARCHAR(64),
    page_number INT NOT NULL DEFAULT 1,
    status VARCHAR(32) NOT NULL DEFAULT 'success',
    records_discovered INT NOT NULL DEFAULT 0,
    records_persisted INT NOT NULL DEFAULT 0,
    sanitized_error TEXT,
    duration_ms INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Indexes for multi-segment filtering and page audits
CREATE INDEX IF NOT EXISTS idx_ipos_market_segment ON public.ipos(market_segment);
CREATE INDEX IF NOT EXISTS idx_ipos_offering_year ON public.ipos(offering_year);
CREATE INDEX IF NOT EXISTS idx_ipos_segment_year ON public.ipos(market_segment, offering_year, status);
CREATE INDEX IF NOT EXISTS idx_inbox_market_segment ON public.ipo_ingestion_inbox(market_segment);
CREATE INDEX IF NOT EXISTS idx_page_sync_audit_source ON public.ipo_source_page_sync_audit(source, segment, page_number);
CREATE INDEX IF NOT EXISTS idx_page_sync_audit_created ON public.ipo_source_page_sync_audit(created_at);
