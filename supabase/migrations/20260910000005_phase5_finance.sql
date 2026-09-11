-- ==============================================================================
-- PHASE 5: FINANCE, DOUBLE-ENTRY GENERAL LEDGER & PORTFOLIO ENGINE
-- Migration: 20260910000005_phase5_finance.sql
-- ==============================================================================

-- 1. ENUMS FOR ACCOUNTING & FINANCE
DO $$ BEGIN
    CREATE TYPE account_classification AS ENUM (
        'asset',
        'liability',
        'equity',
        'revenue',
        'expense'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE journal_status AS ENUM (
        'draft',
        'posted',
        'reversed'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE journal_type AS ENUM (
        'opening_balance',
        'capital_deposit',
        'capital_withdrawal',
        'ipo_funds_blocked',
        'ipo_funds_unblocked',
        'ipo_allotment_debit',
        'security_sale',
        'reversal',
        'manual_adjustment'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE investment_transaction_type AS ENUM (
        'ipo_allotment',
        'secondary_purchase',
        'secondary_sale',
        'bonus_shares',
        'split_adjustment',
        'external_holding'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE funding_owner_type AS ENUM (
        'user_personal',
        'applicant_direct',
        'family_pool',
        'external_tracked'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE ownership_category AS ENUM (
        'user_personal',
        'applicant_direct',
        'family_pool',
        'external_tracked'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE finance_backfill_state AS ENUM (
        'verified',
        'partially_verified',
        'unverified',
        'not_migrated'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 2. CHART OF ACCOUNTS (financial_accounts)
CREATE TABLE IF NOT EXISTS public.financial_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    account_code VARCHAR(20) NOT NULL,
    account_name TEXT NOT NULL,
    classification account_classification NOT NULL,
    ownership_category ownership_category NOT NULL DEFAULT 'user_personal',
    beneficial_applicant_id UUID REFERENCES public.applicant_profiles(id) ON DELETE SET NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    is_system_account BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_user_account_code UNIQUE (user_id, account_code)
);

CREATE INDEX IF NOT EXISTS idx_financial_accounts_user ON public.financial_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_financial_accounts_class ON public.financial_accounts(user_id, classification);
CREATE INDEX IF NOT EXISTS idx_financial_accounts_applicant ON public.financial_accounts(beneficial_applicant_id);

-- 3. GENERAL LEDGER: JOURNAL ENTRIES (journal_entries)
CREATE TABLE IF NOT EXISTS public.journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    journal_number VARCHAR(60) NOT NULL UNIQUE,
    idempotency_key VARCHAR(150) NOT NULL UNIQUE,
    status journal_status NOT NULL DEFAULT 'draft',
    journal_type journal_type NOT NULL,
    reference_type VARCHAR(50) NOT NULL,
    reference_id UUID,
    transaction_date TIMESTAMPTZ NOT NULL,
    narration TEXT NOT NULL,
    reverses_journal_id UUID REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
    reversed_by_journal_id UUID REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
    reversal_reason TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_user ON public.journal_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_status ON public.journal_entries(status);
CREATE INDEX IF NOT EXISTS idx_journal_entries_reference ON public.journal_entries(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON public.journal_entries(user_id, transaction_date DESC);

-- 4. GENERAL LEDGER: JOURNAL LINES (journal_lines)
CREATE TABLE IF NOT EXISTS public.journal_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES public.financial_accounts(id) ON DELETE RESTRICT,
    applicant_id UUID REFERENCES public.applicant_profiles(id) ON DELETE SET NULL,
    debit NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
    credit NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    line_narration TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_debit_xor_credit CHECK (
        (debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)
    )
);

CREATE INDEX IF NOT EXISTS idx_journal_lines_journal ON public.journal_lines(journal_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON public.journal_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_applicant ON public.journal_lines(applicant_id);

-- 5. SECURITIES MASTER TABLE (securities)
CREATE TABLE IF NOT EXISTS public.securities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ipo_id UUID REFERENCES public.ipos(id) ON DELETE SET NULL,
    isin VARCHAR(12) UNIQUE,
    symbol VARCHAR(30) NOT NULL,
    exchange VARCHAR(20) NOT NULL DEFAULT 'NSE',
    company_name TEXT NOT NULL,
    face_value NUMERIC(10,2),
    lot_size INTEGER NOT NULL DEFAULT 1 CHECK (lot_size > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_exchange_symbol UNIQUE (exchange, symbol)
);

CREATE INDEX IF NOT EXISTS idx_securities_isin ON public.securities(isin);
CREATE INDEX IF NOT EXISTS idx_securities_symbol ON public.securities(exchange, symbol);
CREATE INDEX IF NOT EXISTS idx_securities_ipo ON public.securities(ipo_id);

-- 6. INVESTMENT TRANSACTIONS (investment_transactions)
CREATE TABLE IF NOT EXISTS public.investment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    applicant_id UUID REFERENCES public.applicant_profiles(id) ON DELETE SET NULL,
    security_id UUID NOT NULL REFERENCES public.securities(id) ON DELETE RESTRICT,
    application_id UUID REFERENCES public.ipo_applications(id) ON DELETE SET NULL,
    journal_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,
    idempotency_key VARCHAR(150) NOT NULL UNIQUE,
    transaction_type investment_transaction_type NOT NULL,
    funding_owner_type funding_owner_type NOT NULL DEFAULT 'user_personal',
    transaction_date TIMESTAMPTZ NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    price_per_share NUMERIC(14,2) NOT NULL CHECK (price_per_share > 0),
    gross_amount NUMERIC(14,2) NOT NULL CHECK (gross_amount > 0),
    fees NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (fees >= 0),
    net_amount NUMERIC(14,2) NOT NULL CHECK (net_amount > 0),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_investment_tx_user ON public.investment_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_investment_tx_security ON public.investment_transactions(security_id);
CREATE INDEX IF NOT EXISTS idx_investment_tx_applicant ON public.investment_transactions(applicant_id);
CREATE INDEX IF NOT EXISTS idx_investment_tx_app ON public.investment_transactions(application_id);

-- 7. PORTFOLIO POSITIONS (portfolio_positions)
CREATE TABLE IF NOT EXISTS public.portfolio_positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    applicant_id UUID REFERENCES public.applicant_profiles(id) ON DELETE SET NULL,
    security_id UUID NOT NULL REFERENCES public.securities(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    average_cost_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (average_cost_price >= 0),
    total_invested_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_invested_cost >= 0),
    realized_pnl NUMERIC(14,2) NOT NULL DEFAULT 0,
    is_external_tracked BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_user_applicant_security UNIQUE NULLS NOT DISTINCT (user_id, applicant_id, security_id)
);

CREATE INDEX IF NOT EXISTS idx_positions_user ON public.portfolio_positions(user_id);
CREATE INDEX IF NOT EXISTS idx_positions_applicant ON public.portfolio_positions(applicant_id);
CREATE INDEX IF NOT EXISTS idx_positions_security ON public.portfolio_positions(security_id);

-- 8. SECURITY PRICES SNAPSHOTS (security_prices)
CREATE TABLE IF NOT EXISTS public.security_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    security_id UUID NOT NULL REFERENCES public.securities(id) ON DELETE CASCADE,
    price NUMERIC(14,2) NOT NULL CHECK (price >= 0),
    day_open NUMERIC(14,2),
    day_high NUMERIC(14,2),
    day_low NUMERIC(14,2),
    previous_close NUMERIC(14,2),
    source VARCHAR(50) NOT NULL DEFAULT 'exchange_feed',
    is_verified BOOLEAN NOT NULL DEFAULT true,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_prices_sec_time ON public.security_prices(security_id, captured_at DESC);

-- 9. FINANCE PROCESSED EVENTS (Idempotent Event Log)
CREATE TABLE IF NOT EXISTS public.finance_processed_events (
    event_id UUID PRIMARY KEY,
    event_type VARCHAR(60) NOT NULL,
    reference_id UUID,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finance_events_type ON public.finance_processed_events(event_type);

-- ==============================================================================
-- 10. POSTGRESQL DOUBLE-ENTRY CONSTRAINT TRIGGERS
-- ==============================================================================

-- A. Journal Header Balance Verification Trigger
CREATE OR REPLACE FUNCTION verify_journal_header_balance()
RETURNS TRIGGER AS $$
DECLARE
    v_debit_sum NUMERIC(14,2);
    v_credit_sum NUMERIC(14,2);
    v_line_count INTEGER;
BEGIN
    IF NEW.status = 'posted' THEN
        SELECT 
            COALESCE(SUM(debit), 0),
            COALESCE(SUM(credit), 0),
            COUNT(*)
        INTO v_debit_sum, v_credit_sum, v_line_count
        FROM public.journal_lines
        WHERE journal_id = NEW.id;

        IF v_line_count < 2 THEN
            RAISE EXCEPTION 'Posted journal % must contain at least 2 lines (found % lines).',
                NEW.id, v_line_count;
        END IF;

        IF v_debit_sum <> v_credit_sum THEN
            RAISE EXCEPTION 'Unbalanced journal %: Total Debits (₹%) does not equal Total Credits (₹%).',
                NEW.id, v_debit_sum, v_credit_sum;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- B. Journal Lines Mutation Trigger (INSERT, UPDATE, DELETE)
CREATE OR REPLACE FUNCTION verify_journal_lines_mutation()
RETURNS TRIGGER AS $$
DECLARE
    v_target_journal_id UUID;
    v_old_journal_id UUID;
    v_status journal_status;
    v_debit_sum NUMERIC(14,2);
    v_credit_sum NUMERIC(14,2);
    v_line_count INTEGER;
BEGIN
    v_target_journal_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.journal_id ELSE NEW.journal_id END;

    -- If journal_id changed on UPDATE, also re-verify OLD journal
    IF TG_OP = 'UPDATE' AND OLD.journal_id <> NEW.journal_id THEN
        v_old_journal_id := OLD.journal_id;
        SELECT status INTO v_status FROM public.journal_entries WHERE id = v_old_journal_id;
        IF v_status = 'posted' THEN
            SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0), COUNT(*)
            INTO v_debit_sum, v_credit_sum, v_line_count
            FROM public.journal_lines WHERE journal_id = v_old_journal_id;

            IF v_line_count < 2 OR v_debit_sum <> v_credit_sum THEN
                RAISE EXCEPTION 'Line update unbalanced the origin journal %.', v_old_journal_id;
            END IF;
        END IF;
    END IF;

    -- Validate target journal if posted
    SELECT status INTO v_status FROM public.journal_entries WHERE id = v_target_journal_id;
    IF v_status = 'posted' THEN
        SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0), COUNT(*)
        INTO v_debit_sum, v_credit_sum, v_line_count
        FROM public.journal_lines WHERE journal_id = v_target_journal_id;

        IF v_line_count < 2 THEN
            RAISE EXCEPTION 'Posted journal % must have at least 2 lines (found %).',
                v_target_journal_id, v_line_count;
        END IF;

        IF v_debit_sum <> v_credit_sum THEN
            RAISE EXCEPTION 'Unbalanced journal %: Debits (₹%) != Credits (₹%).',
                v_target_journal_id, v_debit_sum, v_credit_sum;
        END IF;
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

-- C. Immutability Trigger for Posted Journal Entries
CREATE OR REPLACE FUNCTION protect_posted_journal_entries()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        -- Allow setting reversed_by_journal_id or status to 'reversed'
        IF OLD.status = 'posted' AND NEW.status NOT IN ('posted', 'reversed') THEN
            RAISE EXCEPTION 'Posted journal % is immutable. Use an offsetting reversal journal.', OLD.id;
        END IF;
        IF OLD.status = 'posted' AND (OLD.journal_number <> NEW.journal_number OR OLD.user_id <> NEW.user_id) THEN
            RAISE EXCEPTION 'Cannot mutate core identifiers of posted journal %.', OLD.id;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.status IN ('posted', 'reversed') THEN
            RAISE EXCEPTION 'Posted or reversed journal % cannot be deleted.', OLD.id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- D. Immutability Trigger for Posted Journal Lines
CREATE OR REPLACE FUNCTION protect_posted_journal_lines()
RETURNS TRIGGER AS $$
DECLARE
    v_status journal_status;
BEGIN
    SELECT status INTO v_status FROM public.journal_entries 
    WHERE id = (CASE WHEN TG_OP = 'DELETE' THEN OLD.journal_id ELSE NEW.journal_id END);

    IF v_status IN ('posted', 'reversed') THEN
        RAISE EXCEPTION 'Journal lines belonging to a posted journal are immutable. Post a reversal journal.';
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if present
DROP TRIGGER IF EXISTS trg_journal_header_balance ON public.journal_entries;
DROP TRIGGER IF EXISTS trg_journal_lines_balance ON public.journal_lines;
DROP TRIGGER IF EXISTS trg_protect_posted_journal_entries ON public.journal_entries;
DROP TRIGGER IF EXISTS trg_protect_posted_journal_lines ON public.journal_lines;

-- Attach DEFERRABLE INITIALLY DEFERRED Constraint Triggers
CREATE CONSTRAINT TRIGGER trg_journal_header_balance
AFTER INSERT OR UPDATE OF status ON public.journal_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION verify_journal_header_balance();

CREATE CONSTRAINT TRIGGER trg_journal_lines_balance
AFTER INSERT OR UPDATE OR DELETE ON public.journal_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION verify_journal_lines_mutation();

-- Attach Immutability Triggers (Immediate)
CREATE TRIGGER trg_protect_posted_journal_entries
BEFORE UPDATE OR DELETE ON public.journal_entries
FOR EACH ROW
EXECUTE FUNCTION protect_posted_journal_entries();

CREATE TRIGGER trg_protect_posted_journal_lines
BEFORE UPDATE OR DELETE ON public.journal_lines
FOR EACH ROW
EXECUTE FUNCTION protect_posted_journal_lines();

-- ==============================================================================
-- 11. ATOMIC STORED POSTING FUNCTION
-- ==============================================================================

CREATE OR REPLACE FUNCTION post_journal_entry_atomic(
    p_user_id UUID,
    p_journal_number VARCHAR(60),
    p_idempotency_key VARCHAR(150),
    p_journal_type journal_type,
    p_reference_type VARCHAR(50),
    p_reference_id UUID,
    p_transaction_date TIMESTAMPTZ,
    p_narration TEXT,
    p_lines JSONB,
    p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
    v_journal_id UUID;
    v_line JSONB;
    v_account_id UUID;
    v_applicant_id UUID;
    v_debit NUMERIC(14,2);
    v_credit NUMERIC(14,2);
    v_line_narration TEXT;
BEGIN
    -- 1. Insert header as draft first
    INSERT INTO public.journal_entries (
        user_id,
        journal_number,
        idempotency_key,
        status,
        journal_type,
        reference_type,
        reference_id,
        transaction_date,
        narration,
        metadata
    ) VALUES (
        p_user_id,
        p_journal_number,
        p_idempotency_key,
        'draft',
        p_journal_type,
        p_reference_type,
        p_reference_id,
        p_transaction_date,
        p_narration,
        p_metadata
    ) RETURNING id INTO v_journal_id;

    -- 2. Insert all constituent lines
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
        v_account_id := (v_line->>'account_id')::UUID;
        v_applicant_id := NULL;
        IF v_line ? 'applicant_id' AND v_line->>'applicant_id' IS NOT NULL AND v_line->>'applicant_id' <> '' THEN
            v_applicant_id := (v_line->>'applicant_id')::UUID;
        END IF;
        v_debit := COALESCE((v_line->>'debit')::NUMERIC(14,2), 0);
        v_credit := COALESCE((v_line->>'credit')::NUMERIC(14,2), 0);
        v_line_narration := v_line->>'line_narration';

        INSERT INTO public.journal_lines (
            journal_id,
            account_id,
            applicant_id,
            debit,
            credit,
            line_narration
        ) VALUES (
            v_journal_id,
            v_account_id,
            v_applicant_id,
            v_debit,
            v_credit,
            v_line_narration
        );
    END LOOP;

    -- 3. Transition status to 'posted' (fires deferred constraint trigger at commit)
    UPDATE public.journal_entries
    SET status = 'posted'
    WHERE id = v_journal_id;

    RETURN v_journal_id;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 12. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.securities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_processed_events ENABLE ROW LEVEL SECURITY;

-- Securities & Security Prices: readable by all authenticated users
CREATE POLICY "securities_readable_by_all" ON public.securities
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "securities_staff_manage" ON public.securities
    FOR ALL USING (is_editor_or_above());

CREATE POLICY "security_prices_readable_by_all" ON public.security_prices
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "security_prices_staff_manage" ON public.security_prices
    FOR ALL USING (is_editor_or_above());

-- Financial Accounts: User isolated
CREATE POLICY "user_manage_own_accounts" ON public.financial_accounts
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "staff_read_accounts" ON public.financial_accounts
    FOR SELECT USING (is_admin_or_super());

-- Journal Entries: User isolated read, staff read
CREATE POLICY "user_read_own_journals" ON public.journal_entries
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_insert_own_journals" ON public.journal_entries
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "staff_read_journals" ON public.journal_entries
    FOR SELECT USING (is_admin_or_super());

-- Journal Lines: joined to journal_entries owner
CREATE POLICY "user_read_own_journal_lines" ON public.journal_lines
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.journal_entries je
            WHERE je.id = journal_lines.journal_id AND je.user_id = auth.uid()
        )
    );

CREATE POLICY "user_insert_own_journal_lines" ON public.journal_lines
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.journal_entries je
            WHERE je.id = journal_lines.journal_id AND je.user_id = auth.uid()
        )
    );

CREATE POLICY "staff_read_journal_lines" ON public.journal_lines
    FOR SELECT USING (is_admin_or_super());

-- Investment Transactions: User isolated
CREATE POLICY "user_read_own_investment_tx" ON public.investment_transactions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_insert_own_investment_tx" ON public.investment_transactions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "staff_read_investment_tx" ON public.investment_transactions
    FOR SELECT USING (is_admin_or_super());

-- Portfolio Positions: User isolated
CREATE POLICY "user_manage_own_positions" ON public.portfolio_positions
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "staff_read_positions" ON public.portfolio_positions
    FOR SELECT USING (is_admin_or_super());

-- Finance Processed Events: internal/admin
CREATE POLICY "staff_manage_finance_events" ON public.finance_processed_events
    FOR ALL USING (is_admin_or_super());
