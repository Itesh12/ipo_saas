-- ==============================================================================
-- CANDIDATE E: REALIZED P&L, EXIT & TRADING LIFECYCLE ENGINE
-- Migration: 20260928000034_candidate_e_realized_pnl_engine.sql
-- Invariants: E1, E2, E3, E8, E9, E10, E11, E12, E15, E17, E18, E19, E20, E21, E22
-- ==============================================================================

-- 1. TAX LOTS TABLE (portfolio_tax_lots)
-- Tracks immutable acquisition lots created by authoritative settlements / purchases
CREATE TABLE IF NOT EXISTS public.portfolio_tax_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  applicant_id UUID REFERENCES public.applicant_profiles(id) ON DELETE RESTRICT,
  security_id UUID NOT NULL REFERENCES public.securities(id) ON DELETE RESTRICT,
  source_transaction_id UUID NOT NULL REFERENCES public.investment_transactions(id) ON DELETE RESTRICT,
  acquisition_date TIMESTAMPTZ NOT NULL,
  original_quantity NUMERIC(18,4) NOT NULL CHECK (original_quantity > 0),
  remaining_quantity NUMERIC(18,4) NOT NULL,
  cost_per_share NUMERIC(20,8) NOT NULL CHECK (cost_per_share >= 0),
  total_lot_cost NUMERIC(20,8) NOT NULL CHECK (total_lot_cost >= 0),
  is_exhausted BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- E1: Exactly-one tax lot per authoritative acquisition transaction
  CONSTRAINT uq_tax_lot_source UNIQUE (source_transaction_id, security_id),

  -- E2: DB-level quantity and cost conservation invariants
  CONSTRAINT chk_tax_lot_quantities CHECK (
    remaining_quantity >= 0 AND remaining_quantity <= original_quantity
  ),
  CONSTRAINT chk_tax_lot_exhausted_consistency CHECK (
    (remaining_quantity = 0 AND is_exhausted = true) OR
    (remaining_quantity > 0 AND is_exhausted = false)
  )
);

CREATE INDEX IF NOT EXISTS idx_tax_lots_lookup 
  ON public.portfolio_tax_lots (user_id, security_id, applicant_id, is_exhausted);
CREATE INDEX IF NOT EXISTS idx_tax_lots_fifo 
  ON public.portfolio_tax_lots (user_id, security_id, acquisition_date ASC, created_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS idx_tax_lots_source 
  ON public.portfolio_tax_lots (source_transaction_id);

-- 2. EXIT TRANSACTIONS TABLE (portfolio_exit_transactions)
-- Primary authoritative ledger of equity exits / sales
CREATE TABLE IF NOT EXISTS public.portfolio_exit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  applicant_id UUID REFERENCES public.applicant_profiles(id) ON DELETE RESTRICT,
  security_id UUID NOT NULL REFERENCES public.securities(id) ON DELETE RESTRICT,
  portfolio_position_id UUID NOT NULL REFERENCES public.portfolio_positions(id) ON DELETE RESTRICT,
  
  idempotency_key VARCHAR(150) NOT NULL UNIQUE,
  exit_status VARCHAR(30) NOT NULL DEFAULT 'EXECUTED',
  cost_basis_method VARCHAR(20) NOT NULL DEFAULT 'FIFO',
  execution_source VARCHAR(30) NOT NULL DEFAULT 'MANUAL',
  source_record_id VARCHAR(100),
  source_timestamp TIMESTAMPTZ,
  
  quantity_sold NUMERIC(18,4) NOT NULL CHECK (quantity_sold > 0),
  execution_price NUMERIC(20,8) NOT NULL CHECK (execution_price > 0),
  gross_proceeds NUMERIC(20,8) NOT NULL CHECK (gross_proceeds > 0),
  total_charges NUMERIC(20,8) NOT NULL DEFAULT 0 CHECK (total_charges >= 0),
  net_proceeds NUMERIC(20,8) NOT NULL CHECK (net_proceeds >= 0),
  cost_basis_consumed NUMERIC(20,8) NOT NULL CHECK (cost_basis_consumed >= 0),
  realized_pnl NUMERIC(20,8) NOT NULL,
  realized_pnl_pct NUMERIC(12,4),
  
  gain_type VARCHAR(10) NOT NULL CHECK (gain_type IN ('GAIN', 'LOSS', 'BREAKEVEN')),
  tax_classification VARCHAR(10) NOT NULL CHECK (tax_classification IN ('STCG', 'LTCG', 'MIXED')),
  tax_rule_version VARCHAR(30) NOT NULL DEFAULT 'IN_EQUITY_2024_V1',
  
  investment_transaction_id UUID REFERENCES public.investment_transactions(id) ON DELETE RESTRICT,
  journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  
  -- E19: Reversal uniqueness & idempotency
  reverses_exit_id UUID UNIQUE REFERENCES public.portfolio_exit_transactions(id) ON DELETE RESTRICT,
  reversal_idempotency_key VARCHAR(150) UNIQUE,
  
  execution_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settlement_date TIMESTAMPTZ,
  settlement_status VARCHAR(20) NOT NULL DEFAULT 'SETTLEMENT_PENDING',
  
  payload_hash VARCHAR(64) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- E15 & E17: Conservation constraints
  CONSTRAINT chk_exit_proceeds_conservation CHECK (
    net_proceeds = gross_proceeds - total_charges
  ),
  CONSTRAINT chk_exit_realized_pnl_conservation CHECK (
    realized_pnl = net_proceeds - cost_basis_consumed
  )
);

CREATE INDEX IF NOT EXISTS idx_exit_tx_user ON public.portfolio_exit_transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_exit_tx_security ON public.portfolio_exit_transactions (security_id);
CREATE INDEX IF NOT EXISTS idx_exit_tx_position ON public.portfolio_exit_transactions (portfolio_position_id);
CREATE INDEX IF NOT EXISTS idx_exit_tx_idemp ON public.portfolio_exit_transactions (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_exit_tx_status ON public.portfolio_exit_transactions (exit_status);
CREATE INDEX IF NOT EXISTS idx_exit_tx_reverses ON public.portfolio_exit_transactions (reverses_exit_id);

-- 3. EXIT ALLOCATIONS TABLE (portfolio_exit_allocations)
-- Granular breakdown of lot consumption per exit transaction (E7)
CREATE TABLE IF NOT EXISTS public.portfolio_exit_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exit_transaction_id UUID NOT NULL REFERENCES public.portfolio_exit_transactions(id) ON DELETE RESTRICT,
  tax_lot_id UUID NOT NULL REFERENCES public.portfolio_tax_lots(id) ON DELETE RESTRICT,
  allocated_quantity NUMERIC(18,4) NOT NULL CHECK (allocated_quantity > 0),
  cost_per_share NUMERIC(20,8) NOT NULL CHECK (cost_per_share >= 0),
  allocated_cost_basis NUMERIC(20,8) NOT NULL CHECK (allocated_cost_basis >= 0),
  holding_period_days INTEGER NOT NULL CHECK (holding_period_days >= 0),
  tax_classification VARCHAR(10) NOT NULL CHECK (tax_classification IN ('STCG', 'LTCG')),
  tax_rule_version VARCHAR(30) NOT NULL DEFAULT 'IN_EQUITY_2024_V1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_allocations_exit ON public.portfolio_exit_allocations (exit_transaction_id);
CREATE INDEX IF NOT EXISTS idx_allocations_lot ON public.portfolio_exit_allocations (tax_lot_id);

-- 4. EXIT CHARGES TABLE (portfolio_exit_charges)
-- Normalized fee lines (E12)
CREATE TABLE IF NOT EXISTS public.portfolio_exit_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exit_transaction_id UUID NOT NULL REFERENCES public.portfolio_exit_transactions(id) ON DELETE RESTRICT,
  charge_type VARCHAR(30) NOT NULL,
  amount NUMERIC(20,8) NOT NULL CHECK (amount >= 0),
  account_id UUID REFERENCES public.financial_accounts(id) ON DELETE RESTRICT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_charges_exit ON public.portfolio_exit_charges (exit_transaction_id);

-- 5. EXIT EVENTS TABLE (portfolio_exit_events)
-- Immutable audit log for exit lifecycle (E10)
CREATE TABLE IF NOT EXISTS public.portfolio_exit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exit_transaction_id UUID NOT NULL REFERENCES public.portfolio_exit_transactions(id) ON DELETE RESTRICT,
  event_type VARCHAR(50) NOT NULL,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  previous_status VARCHAR(30),
  new_status VARCHAR(30) NOT NULL,
  payload_hash VARCHAR(64),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exit_events_exit ON public.portfolio_exit_events (exit_transaction_id);
CREATE INDEX IF NOT EXISTS idx_exit_events_type ON public.portfolio_exit_events (event_type);

-- ==============================================================================
-- 6. ROW LEVEL SECURITY POLICIES
-- ==============================================================================
ALTER TABLE public.portfolio_tax_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_exit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_exit_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_exit_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_exit_events ENABLE ROW LEVEL SECURITY;

-- portfolio_tax_lots
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users view own tax lots" ON public.portfolio_tax_lots;
  CREATE POLICY "Users view own tax lots" ON public.portfolio_tax_lots
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins full access to tax lots" ON public.portfolio_tax_lots;
  CREATE POLICY "Admins full access to tax lots" ON public.portfolio_tax_lots
    FOR ALL USING (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
    );
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role full access to tax lots" ON public.portfolio_tax_lots;
  CREATE POLICY "Service role full access to tax lots" ON public.portfolio_tax_lots
    FOR ALL USING (true);
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- portfolio_exit_transactions
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users view own exit transactions" ON public.portfolio_exit_transactions;
  CREATE POLICY "Users view own exit transactions" ON public.portfolio_exit_transactions
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins full access to exit transactions" ON public.portfolio_exit_transactions;
  CREATE POLICY "Admins full access to exit transactions" ON public.portfolio_exit_transactions
    FOR ALL USING (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
    );
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role full access to exit transactions" ON public.portfolio_exit_transactions;
  CREATE POLICY "Service role full access to exit transactions" ON public.portfolio_exit_transactions
    FOR ALL USING (true);
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- portfolio_exit_allocations
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users view own allocations" ON public.portfolio_exit_allocations;
  CREATE POLICY "Users view own allocations" ON public.portfolio_exit_allocations
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.portfolio_exit_transactions pet
        WHERE pet.id = exit_transaction_id AND pet.user_id = auth.uid()
      )
    );
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role full access to allocations" ON public.portfolio_exit_allocations;
  CREATE POLICY "Service role full access to allocations" ON public.portfolio_exit_allocations
    FOR ALL USING (true);
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- portfolio_exit_charges
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users view own charges" ON public.portfolio_exit_charges;
  CREATE POLICY "Users view own charges" ON public.portfolio_exit_charges
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.portfolio_exit_transactions pet
        WHERE pet.id = exit_transaction_id AND pet.user_id = auth.uid()
      )
    );
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role full access to charges" ON public.portfolio_exit_charges;
  CREATE POLICY "Service role full access to charges" ON public.portfolio_exit_charges
    FOR ALL USING (true);
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- portfolio_exit_events
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users view own exit events" ON public.portfolio_exit_events;
  CREATE POLICY "Users view own exit events" ON public.portfolio_exit_events
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.portfolio_exit_transactions pet
        WHERE pet.id = exit_transaction_id AND pet.user_id = auth.uid()
      )
    );
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role full access to exit events" ON public.portfolio_exit_events;
  CREATE POLICY "Service role full access to exit events" ON public.portfolio_exit_events
    FOR ALL USING (true);
EXCEPTION WHEN undefined_object THEN NULL; END $$;
