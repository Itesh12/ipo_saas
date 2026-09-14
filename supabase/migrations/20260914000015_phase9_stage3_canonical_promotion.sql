-- ==============================================================================
-- Migration: 20260914000015_phase9_stage3_canonical_promotion.sql
-- Phase 9 Stage 3A.3: Canonical IPO Promotion & Current-Universe Activation
-- ==============================================================================

-- 1. Add permanent field-level provenance and listing confirmation flag to public.ipos
ALTER TABLE public.ipos
  ADD COLUMN IF NOT EXISTS provenance JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_listing_confirmed BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Performance Index for Active Current Universe Queries
CREATE INDEX IF NOT EXISTS idx_ipos_active_universe
  ON public.ipos(publication_status, status, open_date, close_date);

-- 3. Ensure review_status constraint on ipo_ingestion_inbox supports all canonical states
ALTER TABLE public.ipo_ingestion_inbox
  DROP CONSTRAINT IF EXISTS chk_inbox_review_status;

-- Add updated check constraint allowing candidate, pending_review, ready_for_review,
-- conflict_detected, conflicted, promoted_to_draft, promoted_to_published, rejected, archived
ALTER TABLE public.ipo_ingestion_inbox
  ADD CONSTRAINT chk_inbox_review_status CHECK (
    review_status IN (
      'candidate',
      'pending',
      'pending_review',
      'ready_for_review',
      'conflict_detected',
      'conflicted',
      'identity_resolved',
      'promoted_to_draft',
      'promoted_to_published',
      'rejected',
      'archived'
    )
  );
