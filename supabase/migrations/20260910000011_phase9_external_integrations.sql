-- ==============================================================================
-- PHASE 9: EXTERNAL INTEGRATION FOUNDATION (STAGE 1 REVISION 2)
-- Migration: 20260910000011_phase9_external_integrations.sql
-- Depository (CDSL/NSDL), IPO Infrastructure Contracts & Durable Event Inbox
-- ==============================================================================

-- 1. ENUMS
DO $$ BEGIN
    CREATE TYPE public.external_provider_type AS ENUM (
        'depository',
        'ipo_infrastructure',
        'registrar',
        'sponsor_bank',
        'scsb',
        'upi'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.external_account_status AS ENUM (
        'pending_verification',
        'verified',
        'rejected',
        'revoked'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.external_event_status AS ENUM (
        'received',
        'processing',
        'processed',
        'failed',
        'ignored'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. EXTERNAL PROVIDERS REGISTRY
CREATE TABLE IF NOT EXISTS public.external_providers (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    provider_type public.external_provider_type NOT NULL,
    environment VARCHAR(20) NOT NULL DEFAULT 'development', -- 'development', 'staging', 'production', 'sandbox'
    enabled BOOLEAN NOT NULL DEFAULT false,
    configuration JSONB NOT NULL DEFAULT '{}'::jsonb, -- strictly non-secret operational metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. EXTERNAL ACCOUNTS TABLE (DEMAT & DEPOSITORY REFERENCES)
CREATE TABLE IF NOT EXISTS public.external_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    provider_id VARCHAR(50) NOT NULL REFERENCES public.external_providers(id) ON DELETE RESTRICT,
    provider_type public.external_provider_type NOT NULL,
    depository_type VARCHAR(10), -- 'cdsl', 'nsdl', or null
    account_reference_masked VARCHAR(50) NOT NULL,
    account_reference_encrypted TEXT,
    status public.external_account_status NOT NULL DEFAULT 'pending_verification',
    verified_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_external_accounts_user_provider_ref UNIQUE (user_id, provider_id, account_reference_masked)
);

-- Guardrail 1: Enforce that external accounts cannot be marked 'verified' in Stage 1
CREATE OR REPLACE FUNCTION public.check_external_account_stage1_status()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'verified' AND current_setting('request.jwt.claim.role', true) != 'service_role' THEN
        RAISE EXCEPTION 'Stage 1 Restriction: External account verification is deferred to Stage 3. Accounts remain informational (pending_verification).';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_external_account_stage1_guard ON public.external_accounts;
CREATE TRIGGER trg_external_account_stage1_guard
    BEFORE INSERT OR UPDATE ON public.external_accounts
    FOR EACH ROW
    EXECUTE FUNCTION public.check_external_account_stage1_status();

-- 4. DURABLE EXTERNAL EVENT INBOX
CREATE TABLE IF NOT EXISTS public.external_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id VARCHAR(50) NOT NULL REFERENCES public.external_providers(id) ON DELETE RESTRICT,
    provider_type public.external_provider_type NOT NULL,
    provider_event_id VARCHAR(255),
    event_type VARCHAR(100) NOT NULL,
    environment VARCHAR(20) NOT NULL DEFAULT 'development',
    payload_hash VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL,
    normalized_event_type VARCHAR(100),
    status public.external_event_status NOT NULL DEFAULT 'received',
    attempt_count INT NOT NULL DEFAULT 0,
    error_message TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_external_events_idempotency
ON public.external_events (provider_id, environment, provider_event_id)
WHERE provider_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_external_events_payload_hash
ON public.external_events (payload_hash);

CREATE INDEX IF NOT EXISTS idx_external_events_received_at
ON public.external_events (received_at);

-- 5. EXTERNAL CONSENTS TABLE
CREATE TABLE IF NOT EXISTS public.external_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    provider_id VARCHAR(50) NOT NULL REFERENCES public.external_providers(id) ON DELETE RESTRICT,
    consent_version VARCHAR(20) NOT NULL DEFAULT '1.0',
    requested_scopes TEXT[] NOT NULL DEFAULT '{}',
    granted_scopes TEXT[] NOT NULL DEFAULT '{}',
    ip_address TEXT,
    user_agent TEXT,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
);

-- 6. RECONCILIATION RUNS & DISCREPANCIES TABLES
CREATE TABLE IF NOT EXISTS public.external_reconciliation_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id VARCHAR(50) NOT NULL REFERENCES public.external_providers(id) ON DELETE RESTRICT,
    domain VARCHAR(50) NOT NULL, -- 'demat_accounts', 'allotments'
    status VARCHAR(20) NOT NULL DEFAULT 'started',
    total_records INT NOT NULL DEFAULT 0,
    matched_records INT NOT NULL DEFAULT 0,
    discrepancy_count INT NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.external_reconciliation_discrepancies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES public.external_reconciliation_runs(id) ON DELETE CASCADE,
    domain VARCHAR(50) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    discrepancy_type VARCHAR(50) NOT NULL,
    internal_state JSONB NOT NULL,
    external_state JSONB NOT NULL,
    work_item_id UUID REFERENCES public.admin_work_items(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. 90-DAY PAYLOAD PRUNING FUNCTION
CREATE OR REPLACE FUNCTION public.prune_expired_external_events()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_pruned INT;
BEGIN
    -- Only admin, super_admin, or service_role can prune event payloads
    IF NOT (public.is_admin_or_super() OR current_setting('request.jwt.claim.role', true) = 'service_role') THEN
        RAISE EXCEPTION 'Access Denied: Administrative role required to prune external events.';
    END IF;

    -- Update payload to stripped indicator for events older than 90 days
    -- Preserves provider, event_id, event_type, payload_hash, metadata, timestamps
    WITH updated AS (
        UPDATE public.external_events
        SET payload = '{"_pruned": true, "_pruned_at": NOW()}'::jsonb
        WHERE received_at < (NOW() - INTERVAL '90 days')
          AND NOT (payload ? '_pruned')
        RETURNING id
    )
    SELECT COUNT(*) INTO v_pruned FROM updated;

    RETURN v_pruned;
END;
$$;

-- 8. SEED STANDARD PROVIDERS (DISABLED & PLANNED ARCHITECTURE ONLY)
INSERT INTO public.external_providers (id, name, provider_type, environment, enabled, configuration)
VALUES
    ('cdsl', 'Central Depository Services (India) Limited', 'depository', 'development', false, '{"market": "IN", "standard": "CDSL_BOID_16", "status": "planned"}'::jsonb),
    ('nsdl', 'National Securities Depository Limited', 'depository', 'development', false, '{"market": "IN", "standard": "NSDL_DP_CLIENT_16", "status": "planned"}'::jsonb),
    ('bse_ipo', 'BSE IPO Syndicate Bidding Gateway', 'ipo_infrastructure', 'development', false, '{"market": "IN", "exchange": "BSE", "status": "planned"}'::jsonb),
    ('nse_ipo', 'NSE IPO Emerge / Syndicate Gateway', 'ipo_infrastructure', 'development', false, '{"market": "IN", "exchange": "NSE", "status": "planned"}'::jsonb),
    ('link_intime', 'Link Intime India Private Limited', 'registrar', 'development', false, '{"market": "IN", "category": "RTA", "status": "planned"}'::jsonb),
    ('kfintech', 'KFin Technologies Limited', 'registrar', 'development', false, '{"market": "IN", "category": "RTA", "status": "planned"}'::jsonb),
    ('npci_upi', 'NPCI UPI IPO Mandate Infrastructure', 'upi', 'development', false, '{"market": "IN", "version": "UPI_2.0_MANDATE", "status": "planned"}'::jsonb)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    provider_type = EXCLUDED.provider_type,
    updated_at = NOW();

-- 9. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.external_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_reconciliation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_reconciliation_discrepancies ENABLE ROW LEVEL SECURITY;

-- external_providers: all authenticated users can read; only admins/service_role can modify
DROP POLICY IF EXISTS "external_providers_read_all" ON public.external_providers;
CREATE POLICY "external_providers_read_all" ON public.external_providers
    FOR SELECT TO authenticated, anon
    USING (true);

DROP POLICY IF EXISTS "external_providers_admin_mutate" ON public.external_providers;
CREATE POLICY "external_providers_admin_mutate" ON public.external_providers
    FOR ALL TO authenticated
    USING (public.is_admin_or_super())
    WITH CHECK (public.is_admin_or_super());

-- external_accounts: users can only see and manage their own accounts
DROP POLICY IF EXISTS "external_accounts_user_select" ON public.external_accounts;
CREATE POLICY "external_accounts_user_select" ON public.external_accounts
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id OR public.is_admin_or_super());

DROP POLICY IF EXISTS "external_accounts_user_insert" ON public.external_accounts;
CREATE POLICY "external_accounts_user_insert" ON public.external_accounts
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "external_accounts_user_update" ON public.external_accounts;
CREATE POLICY "external_accounts_user_update" ON public.external_accounts
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id OR public.is_admin_or_super())
    WITH CHECK (auth.uid() = user_id OR public.is_admin_or_super());

DROP POLICY IF EXISTS "external_accounts_user_delete" ON public.external_accounts;
CREATE POLICY "external_accounts_user_delete" ON public.external_accounts
    FOR DELETE TO authenticated
    USING (auth.uid() = user_id OR public.is_admin_or_super());

-- external_events: STRICTLY RESTRICTED. Normal users CANNOT read raw event payloads.
-- Only admin or service_role can view or insert events.
DROP POLICY IF EXISTS "external_events_admin_select" ON public.external_events;
CREATE POLICY "external_events_admin_select" ON public.external_events
    FOR SELECT TO authenticated
    USING (public.is_admin_or_super());

DROP POLICY IF EXISTS "external_events_admin_service_mutate" ON public.external_events;
CREATE POLICY "external_events_admin_service_mutate" ON public.external_events
    FOR ALL TO authenticated
    USING (public.is_admin_or_super())
    WITH CHECK (public.is_admin_or_super());

-- external_consents: users can read and manage their own consents
DROP POLICY IF EXISTS "external_consents_user_select" ON public.external_consents;
CREATE POLICY "external_consents_user_select" ON public.external_consents
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id OR public.is_admin_or_super());

DROP POLICY IF EXISTS "external_consents_user_manage" ON public.external_consents;
CREATE POLICY "external_consents_user_manage" ON public.external_consents
    FOR ALL TO authenticated
    USING (auth.uid() = user_id OR public.is_admin_or_super())
    WITH CHECK (auth.uid() = user_id OR public.is_admin_or_super());

-- reconciliation: admin and service_role only
DROP POLICY IF EXISTS "reconciliation_admin_runs" ON public.external_reconciliation_runs;
CREATE POLICY "reconciliation_admin_runs" ON public.external_reconciliation_runs
    FOR ALL TO authenticated
    USING (public.is_admin_or_super())
    WITH CHECK (public.is_admin_or_super());

DROP POLICY IF EXISTS "reconciliation_admin_discrepancies" ON public.external_reconciliation_discrepancies;
CREATE POLICY "reconciliation_admin_discrepancies" ON public.external_reconciliation_discrepancies
    FOR ALL TO authenticated
    USING (public.is_admin_or_super())
    WITH CHECK (public.is_admin_or_super());
