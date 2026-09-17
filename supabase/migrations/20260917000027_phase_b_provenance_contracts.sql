-- ==============================================================================
-- Migration: 20260917000027_phase_b_provenance_contracts.sql
-- Phase B: Standardized Provenance Contracts on Fundamental Research Tables
--
-- Mandatory Rule: NEVER assign synthetic default provenance to legacy records.
-- All lineage fields default to NULL for existing rows, ensuring that provenance
-- is only attached when a verified observation promotes into canonical storage.
-- ==============================================================================

DO $$ 
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'ipo_business_profiles',
    'ipo_financials',
    'ipo_valuations',
    'ipo_peers',
    'ipo_promoters',
    'ipo_strengths',
    'ipo_risks'
  ] LOOP
    EXECUTE format('
      ALTER TABLE public.%I
        ADD COLUMN IF NOT EXISTS source_observation_id UUID REFERENCES public.ipo_ingestion_observations(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS source_type VARCHAR(64) NULL,
        ADD COLUMN IF NOT EXISTS verification_state VARCHAR(32) NOT NULL DEFAULT ''unverified'',
        ADD COLUMN IF NOT EXISTS confidence_level VARCHAR(32) NULL,
        ADD COLUMN IF NOT EXISTS is_unofficial BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS parser_version VARCHAR(32) NULL,
        ADD COLUMN IF NOT EXISTS observed_at TIMESTAMPTZ NULL;
    ', tbl);
  END LOOP;
END $$;
