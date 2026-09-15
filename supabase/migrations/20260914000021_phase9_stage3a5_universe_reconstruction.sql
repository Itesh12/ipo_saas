-- ==============================================================================
-- Migration: 20260914000021_phase9_stage3a5_universe_reconstruction.sql
-- Description: Phase 9 Stage 3A.5 Complete IPO Universe Reconstruction
-- Adds data_quality, instrument_type, field_truth_table, issue_identity to ipos,
-- adds 'postponed' to ipo_status enum, and establishes ipo_rejection_audit table.
-- ==============================================================================

-- 1. Add 'postponed' to ipo_status enum if not present
DO $$ BEGIN
    ALTER TYPE ipo_status ADD VALUE IF NOT EXISTS 'postponed';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Add instrument_type and data_quality to public.ipos
ALTER TABLE public.ipos 
    ADD COLUMN IF NOT EXISTS data_quality VARCHAR(32) NOT NULL DEFAULT 'partial',
    ADD COLUMN IF NOT EXISTS instrument_type VARCHAR(32) NOT NULL DEFAULT 'IPO',
    ADD COLUMN IF NOT EXISTS field_truth_table JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS issue_identity VARCHAR(128),
    ADD COLUMN IF NOT EXISTS offering_year INT;

-- 3. Add check constraints for data_quality and instrument_type
ALTER TABLE public.ipos DROP CONSTRAINT IF EXISTS ipos_data_quality_check;
ALTER TABLE public.ipos ADD CONSTRAINT ipos_data_quality_check 
    CHECK (data_quality IN ('discovered', 'partial', 'verified', 'complete', 'conflicted'));

ALTER TABLE public.ipos DROP CONSTRAINT IF EXISTS ipos_instrument_type_check;
ALTER TABLE public.ipos ADD CONSTRAINT ipos_instrument_type_check 
    CHECK (instrument_type IN ('IPO', 'SME_IPO', 'FPO', 'RIGHTS', 'OFFER_FOR_SALE', 'DEBT', 'REIT', 'INVIT', 'BUYBACK', 'OTHER'));

-- 4. Enhance ipo_ingestion_inbox with issue identity and rejection audit columns
ALTER TABLE public.ipo_ingestion_inbox
    ADD COLUMN IF NOT EXISTS instrument_type VARCHAR(32) DEFAULT 'IPO',
    ADD COLUMN IF NOT EXISTS issue_identity VARCHAR(128),
    ADD COLUMN IF NOT EXISTS rejection_reason_code VARCHAR(64),
    ADD COLUMN IF NOT EXISTS rejection_detail TEXT;

-- 5. Create ipo_rejection_audit table for explicit accounting
CREATE TABLE IF NOT EXISTS public.ipo_rejection_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inbox_id UUID REFERENCES public.ipo_ingestion_inbox(id) ON DELETE SET NULL,
    source VARCHAR(64) NOT NULL,
    external_id VARCHAR(128) NOT NULL,
    document_title TEXT,
    rejected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reason_code VARCHAR(64) NOT NULL,
    reason_detail TEXT NOT NULL,
    blocking_field VARCHAR(64),
    source_evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
    retryable BOOLEAN NOT NULL DEFAULT false
);

-- 6. Indexes for universe performance & reconciliation
CREATE INDEX IF NOT EXISTS idx_ipos_instrument_type ON public.ipos(instrument_type);
CREATE INDEX IF NOT EXISTS idx_ipos_data_quality ON public.ipos(data_quality);
CREATE INDEX IF NOT EXISTS idx_ipos_issue_identity ON public.ipos(issue_identity);
CREATE INDEX IF NOT EXISTS idx_rejection_audit_source ON public.ipo_rejection_audit(source);
CREATE INDEX IF NOT EXISTS idx_rejection_audit_reason ON public.ipo_rejection_audit(reason_code);
CREATE INDEX IF NOT EXISTS idx_rejection_audit_rejected_at ON public.ipo_rejection_audit(rejected_at);
