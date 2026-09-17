-- ==============================================================================
-- CANDIDATE C: STAGE 5 FINANCIAL SETTLEMENT & DEMAT ACCOUNTING WORKFLOW ENGINE
-- Migration: 20260920000032_candidate_c_settlement_engine.sql
-- ==============================================================================

-- 1. Settlement Status Enum
DO $$ BEGIN
  CREATE TYPE public.settlement_status AS ENUM (
    'RECEIVED',
    'VALIDATING',
    'SECURITY_RESOLVED',
    'SETTLEMENT_READY',
    'SETTLED',
    'SETTLED_WITH_REFUND',
    'REFUND_SETTLED',
    'BLOCKED',
    'NEEDS_REVIEW'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Dedicated Settlement Ledger (ipo_application_settlements)
-- Guarantees permanent, durable financial audit trail with zero cascading deletion
CREATE TABLE IF NOT EXISTS public.ipo_application_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.ipo_applications(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  applicant_id UUID REFERENCES public.applicant_profiles(id) ON DELETE RESTRICT,
  
  event_id UUID NOT NULL,
  allotment_id UUID NOT NULL,
  idempotency_key VARCHAR(150) NOT NULL UNIQUE,
  
  settlement_status public.settlement_status NOT NULL DEFAULT 'RECEIVED',
  
  shares_applied NUMERIC(18,4) NOT NULL CHECK (shares_applied >= 0),
  shares_allotted NUMERIC(18,4) NOT NULL CHECK (shares_allotted >= 0),
  allotment_price NUMERIC(20,8) NOT NULL CHECK (allotment_price >= 0),
  allotted_value NUMERIC(20,8) NOT NULL CHECK (allotted_value >= 0),
  refund_value NUMERIC(20,8) NOT NULL DEFAULT 0 CHECK (refund_value >= 0),
  applicable_blocked_amount NUMERIC(20,8) NOT NULL CHECK (applicable_blocked_amount >= 0),
  
  security_id UUID REFERENCES public.securities(id) ON DELETE RESTRICT,
  journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  portfolio_position_id UUID REFERENCES public.portfolio_positions(id) ON DELETE RESTRICT,
  investment_transaction_id UUID REFERENCES public.investment_transactions(id) ON DELETE RESTRICT,
  
  failure_code VARCHAR(50),
  failure_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Database Constraints
  CONSTRAINT chk_settlement_shares_allotted_le_applied CHECK (
    shares_allotted <= shares_applied
  ),
  CONSTRAINT chk_settlement_amounts_conservation CHECK (
    settlement_status NOT IN ('SETTLED', 'SETTLED_WITH_REFUND', 'REFUND_SETTLED') OR
    (allotted_value + refund_value = applicable_blocked_amount)
  ),
  -- Composite business identity uniqueness: prevent duplicate financial settlement for same allotment
  CONSTRAINT uq_settlement_app_allotment UNIQUE (application_id, allotment_id)
);

CREATE INDEX IF NOT EXISTS idx_settlements_app ON public.ipo_application_settlements(application_id);
CREATE INDEX IF NOT EXISTS idx_settlements_user ON public.ipo_application_settlements(user_id);
CREATE INDEX IF NOT EXISTS idx_settlements_idemp ON public.ipo_application_settlements(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_settlements_status ON public.ipo_application_settlements(settlement_status);

-- 3. Row Level Security Policies
ALTER TABLE public.ipo_application_settlements ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users view own settlements" ON public.ipo_application_settlements;
  CREATE POLICY "Users view own settlements"
    ON public.ipo_application_settlements FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins full access to settlements" ON public.ipo_application_settlements;
  CREATE POLICY "Admins full access to settlements"
    ON public.ipo_application_settlements FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
      )
    );
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role full access to settlements" ON public.ipo_application_settlements;
  CREATE POLICY "Service role full access to settlements"
    ON public.ipo_application_settlements FOR ALL
    USING (true);
EXCEPTION WHEN undefined_object THEN NULL; END $$;
