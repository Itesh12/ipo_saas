-- ==============================================================================
-- CANDIDATE B: STAGE 4 REGISTRAR ALLOTMENT & CHALLENGE ENGINE
-- Migration 2 of 2: Schema Hardening, Dual Review, Outbox & Constraints
-- Migration: 20260919000031_candidate_b_allotment_engine.sql
-- ==============================================================================

-- 1. Upgrade registrar capabilities table with operational state
ALTER TABLE public.ipo_registrar_capabilities
  ADD COLUMN IF NOT EXISTS operational_state public.registrar_operational_state NOT NULL DEFAULT 'CONFIGURED';

-- 2. Upgrade allotment projections table with dispatch state & consistency check
ALTER TABLE public.ipo_application_allotment_projections
  ADD COLUMN IF NOT EXISTS financial_dispatch_status public.financial_dispatch_status NOT NULL DEFAULT 'BLOCKED',
  ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS outbox_event_id UUID;

ALTER TABLE public.ipo_application_allotment_projections
  DROP CONSTRAINT IF EXISTS chk_dispatched_consistency;

ALTER TABLE public.ipo_application_allotment_projections
  ADD CONSTRAINT chk_dispatched_consistency CHECK (
    (financial_dispatch_status IN ('EMITTED', 'ACKNOWLEDGED') AND dispatched_at IS NOT NULL)
    OR (financial_dispatch_status NOT IN ('EMITTED', 'ACKNOWLEDGED'))
  );

-- 3. True Dual-Control Allotment Challenges Table
CREATE TABLE IF NOT EXISTS public.ipo_allotment_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.ipo_applications(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  challenge_type public.challenge_type NOT NULL,
  status public.challenge_status NOT NULL DEFAULT 'submitted',
  
  investor_statement TEXT NOT NULL,
  claimed_shares_allotted INTEGER NOT NULL CHECK (claimed_shares_allotted >= 0),
  claimed_amount NUMERIC(14,2) NOT NULL CHECK (claimed_amount >= 0),
  
  -- Secure Evidence Metadata (Private bucket, 0 public URLs)
  storage_object_id VARCHAR(255),
  evidence_sha256 VARCHAR(64),
  mime_type VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
  file_size_bytes INTEGER CHECK (file_size_bytes IS NULL OR file_size_bytes > 0),
  
  -- Dual-Control Review 1
  primary_reviewer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  primary_reviewed_at TIMESTAMPTZ,
  primary_notes TEXT,
  
  -- Dual-Control Review 2
  secondary_reviewer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  secondary_reviewed_at TIMESTAMPTZ,
  secondary_notes TEXT,
  
  resolution_reason VARCHAR(100),
  idempotency_key VARCHAR(128) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Hard Dual Review Invariant: Reviewer 1 and Reviewer 2 must be different administrators
  CONSTRAINT chk_dual_review_distinct_reviewers CHECK (
    secondary_reviewer_id IS NULL OR primary_reviewer_id != secondary_reviewer_id
  )
);

CREATE INDEX IF NOT EXISTS idx_challenges_app ON public.ipo_allotment_challenges(application_id);
CREATE INDEX IF NOT EXISTS idx_challenges_user ON public.ipo_allotment_challenges(user_id);
CREATE INDEX IF NOT EXISTS idx_challenges_status ON public.ipo_allotment_challenges(status);

-- 4. Stage 4 Durable Outbox Table
CREATE TABLE IF NOT EXISTS public.ipo_stage4_outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL UNIQUE,
  event_type VARCHAR(60) NOT NULL DEFAULT 'allotment_verified',
  application_id UUID NOT NULL REFERENCES public.ipo_applications(id) ON DELETE RESTRICT,
  projection_id UUID NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL UNIQUE,
  
  payload JSONB NOT NULL,
  payload_hash VARCHAR(64) NOT NULL,
  
  status public.outbox_delivery_status NOT NULL DEFAULT 'PENDING',
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 5,
  last_error TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  emitted_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbox_status_pending ON public.ipo_stage4_outbox_events(status, created_at ASC)
  WHERE status IN ('PENDING', 'EMITTED');

-- 5. Row Level Security Policies
ALTER TABLE public.ipo_allotment_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ipo_stage4_outbox_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users read own challenges" ON public.ipo_allotment_challenges;
  CREATE POLICY "Users read own challenges"
    ON public.ipo_allotment_challenges FOR SELECT
    USING (user_id = auth.uid());
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users submit own challenges" ON public.ipo_allotment_challenges;
  CREATE POLICY "Users submit own challenges"
    ON public.ipo_allotment_challenges FOR INSERT
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins manage all challenges" ON public.ipo_allotment_challenges;
  CREATE POLICY "Admins manage all challenges"
    ON public.ipo_allotment_challenges FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
      )
    );
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins view stage 4 outbox" ON public.ipo_stage4_outbox_events;
  CREATE POLICY "Admins view stage 4 outbox"
    ON public.ipo_stage4_outbox_events FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
      )
    );
EXCEPTION WHEN undefined_object THEN NULL; END $$;
