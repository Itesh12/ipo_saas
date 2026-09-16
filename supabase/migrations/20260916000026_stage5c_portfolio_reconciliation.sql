-- ==============================================================================
-- PHASE 10 / STAGE 5C: NON-MUTATING PORTFOLIO RECONCILIATION ENGINE
-- Migration: 20260916000026_stage5c_portfolio_reconciliation.sql
-- ==============================================================================

-- 1. Severity & Discrepancy Enums
DO $$ BEGIN
  CREATE TYPE public.portfolio_discrepancy_severity AS ENUM (
    'INFO',
    'WARNING',
    'CRITICAL'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.portfolio_discrepancy_type AS ENUM (
    'MATCHED',
    'QUANTITY_MISMATCH',
    'MISSING_SECURITY',
    'FINANCIAL_TRANSACTION_MISMATCH',
    'COST_BASIS_MISMATCH'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Current Condition Table (portfolio_reconciliation_state)
-- Explicitly read-only with respect to financial truth: records detected state without mutating ledger.
CREATE TABLE IF NOT EXISTS public.portfolio_reconciliation_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  applicant_id UUID REFERENCES public.applicant_profiles(id) ON DELETE SET NULL,
  security_id UUID NOT NULL REFERENCES public.securities(id) ON DELETE CASCADE,
  reconciliation_status public.portfolio_discrepancy_type NOT NULL DEFAULT 'MATCHED',
  severity public.portfolio_discrepancy_severity NOT NULL DEFAULT 'INFO',
  expected_quantity NUMERIC(18,4) NOT NULL DEFAULT 0,
  actual_quantity NUMERIC(18,4) NOT NULL DEFAULT 0,
  quantity_delta NUMERIC(18,4) NOT NULL DEFAULT 0,
  expected_cost_basis NUMERIC(20,8) NOT NULL DEFAULT 0,
  actual_cost_basis NUMERIC(20,8) NOT NULL DEFAULT 0,
  cost_delta NUMERIC(20,8) NOT NULL DEFAULT 0,
  details JSONB DEFAULT '{}'::jsonb,
  last_reconciled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  operator_notes TEXT,
  is_acknowledged BOOLEAN NOT NULL DEFAULT false,

  CONSTRAINT uq_recon_state_user_sec UNIQUE NULLS NOT DISTINCT (user_id, applicant_id, security_id)
);

CREATE INDEX IF NOT EXISTS idx_recon_state_user ON public.portfolio_reconciliation_state(user_id);
CREATE INDEX IF NOT EXISTS idx_recon_state_sec ON public.portfolio_reconciliation_state(security_id);
CREATE INDEX IF NOT EXISTS idx_recon_state_sev ON public.portfolio_reconciliation_state(severity);
CREATE INDEX IF NOT EXISTS idx_recon_state_status ON public.portfolio_reconciliation_state(reconciliation_status);

-- 3. Immutable History Table (portfolio_reconciliation_audits)
CREATE TABLE IF NOT EXISTS public.portfolio_reconciliation_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_state_id UUID REFERENCES public.portfolio_reconciliation_state(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  applicant_id UUID REFERENCES public.applicant_profiles(id) ON DELETE SET NULL,
  security_id UUID NOT NULL REFERENCES public.securities(id) ON DELETE CASCADE,
  discrepancy_type public.portfolio_discrepancy_type NOT NULL,
  severity public.portfolio_discrepancy_severity NOT NULL,
  expected_quantity NUMERIC(18,4) NOT NULL,
  actual_quantity NUMERIC(18,4) NOT NULL,
  quantity_delta NUMERIC(18,4) NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  audited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recon_audits_user ON public.portfolio_reconciliation_audits(user_id);
CREATE INDEX IF NOT EXISTS idx_recon_audits_time ON public.portfolio_reconciliation_audits(audited_at DESC);
CREATE INDEX IF NOT EXISTS idx_recon_audits_sev ON public.portfolio_reconciliation_audits(severity);

-- 4. Row Level Security
ALTER TABLE public.portfolio_reconciliation_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_reconciliation_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own reconciliation state"
  ON public.portfolio_reconciliation_state FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins full access to reconciliation state"
  ON public.portfolio_reconciliation_state FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Service role full access to reconciliation state"
  ON public.portfolio_reconciliation_state FOR ALL
  USING (true);

CREATE POLICY "Users can view their own reconciliation audits"
  ON public.portfolio_reconciliation_audits FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to reconciliation audits"
  ON public.portfolio_reconciliation_audits FOR ALL
  USING (true);
