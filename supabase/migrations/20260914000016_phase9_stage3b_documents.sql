-- ==============================================================================
-- Migration: 20260914000016_phase9_stage3b_documents.sql
-- Phase 9 Stage 3B: Document Intelligence — Schema Enhancements
-- 
-- Features:
-- 1. Extend ipo_doc_type enum with precise regulatory filing types:
--    'addendum', 'corrigendum', 'anchor_allocation', 'basis_of_allotment', 'abridged_prospectus'
-- 2. Enhance public.ipo_documents with:
--    - source_observation_id (FK to public.ipo_ingestion_observations)
--    - version_number (immutable history tracking)
--    - sha256_hash (full-content SHA-256 fingerprint)
--    - probe_hash (lightweight preflight hash)
--    - mime_type
--    - validation_status (defaults to 'unverified' per user invariant)
--    - metadata (BRLMs, Registrar, Fresh vs OFS, Issue Objects)
--    - first_observed_at, last_verified_at
--    - Unique constraint on (ipo_id, file_url, version_number)
-- 3. Create public.ipo_unassociated_documents for filings that cannot be
--    matched to canonical IPOs with high confidence (>=0.95).
-- 4. Indexes and RLS policies.
-- ==============================================================================

-- 1. Extend ipo_doc_type enum safely
ALTER TYPE public.ipo_doc_type ADD VALUE IF NOT EXISTS 'addendum';
ALTER TYPE public.ipo_doc_type ADD VALUE IF NOT EXISTS 'corrigendum';
ALTER TYPE public.ipo_doc_type ADD VALUE IF NOT EXISTS 'anchor_allocation';
ALTER TYPE public.ipo_doc_type ADD VALUE IF NOT EXISTS 'basis_of_allotment';
ALTER TYPE public.ipo_doc_type ADD VALUE IF NOT EXISTS 'abridged_prospectus';

-- 2. Enhance public.ipo_documents columns
ALTER TABLE public.ipo_documents 
  ADD COLUMN IF NOT EXISTS source_observation_id UUID REFERENCES public.ipo_ingestion_observations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS sha256_hash VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS probe_hash VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS mime_type VARCHAR(64) NOT NULL DEFAULT 'application/pdf',
  ADD COLUMN IF NOT EXISTS validation_status public.ipo_verification_status NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS first_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Add versioned unique constraint if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_ipo_doc_version'
  ) THEN
    ALTER TABLE public.ipo_documents 
      ADD CONSTRAINT uq_ipo_doc_version UNIQUE (ipo_id, file_url, version_number);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ipo_docs_source_obs ON public.ipo_documents(source_observation_id);
CREATE INDEX IF NOT EXISTS idx_ipo_docs_sha256 ON public.ipo_documents(sha256_hash) WHERE sha256_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ipo_docs_validation ON public.ipo_documents(validation_status);

-- 3. Create public.ipo_unassociated_documents table
CREATE TABLE IF NOT EXISTS public.ipo_unassociated_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_observation_id UUID REFERENCES public.ipo_ingestion_observations(id) ON DELETE SET NULL,
  filing_title TEXT NOT NULL,
  document_type public.ipo_doc_type NOT NULL DEFAULT 'other',
  file_url TEXT NOT NULL,
  extracted_company_name TEXT,
  reconciliation_score NUMERIC(5,2),
  reconciliation_reason TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'pending_review', -- 'pending_review', 'assigned', 'discarded'
  candidate_ipo_ids UUID[] DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ipo_unassoc_status ON public.ipo_unassociated_documents(status);
CREATE INDEX IF NOT EXISTS idx_ipo_unassoc_score ON public.ipo_unassociated_documents(reconciliation_score);
CREATE INDEX IF NOT EXISTS idx_ipo_unassoc_source_obs ON public.ipo_unassociated_documents(source_observation_id);

-- 4. Row Level Security Policies
ALTER TABLE public.ipo_unassociated_documents ENABLE ROW LEVEL SECURITY;

-- Admins can view and manage unassociated documents
DROP POLICY IF EXISTS "Admins have full access to ipo_unassociated_documents" ON public.ipo_unassociated_documents;
CREATE POLICY "Admins have full access to ipo_unassociated_documents"
  ON public.ipo_unassociated_documents
  FOR ALL
  TO authenticated
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
