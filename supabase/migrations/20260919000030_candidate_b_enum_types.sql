-- ==============================================================================
-- CANDIDATE B: STAGE 4 REGISTRAR ALLOTMENT & CHALLENGE ENGINE
-- Migration 1 of 2: Enum Types (Committed before usage in table definitions)
-- Migration: 20260919000030_candidate_b_enum_types.sql
-- ==============================================================================

DO $$ BEGIN
  CREATE TYPE public.financial_dispatch_status AS ENUM (
    'BLOCKED',
    'ELIGIBLE',
    'EMITTED',
    'ACKNOWLEDGED',
    'NOT_APPLICABLE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.registrar_operational_state AS ENUM (
    'DISCOVERED',
    'CONFIGURED',
    'VERIFIED',
    'OPERATIONAL',
    'DEGRADED',
    'UNAVAILABLE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.challenge_type AS ENUM (
    'bank_debited_not_allotted',
    'cas_shares_credited',
    'registrar_pan_not_found',
    'incorrect_shares_allotted',
    'refund_not_received'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.challenge_status AS ENUM (
    'submitted',
    'under_review',
    'primary_approved',
    'secondary_approved',
    'resolved_allotted',
    'resolved_rejected',
    'withdrawn'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.outbox_delivery_status AS ENUM (
    'PENDING',
    'EMITTED',
    'ACKNOWLEDGED',
    'FAILED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
