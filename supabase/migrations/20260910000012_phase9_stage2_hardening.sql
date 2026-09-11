-- ==============================================================================
-- PHASE 9: EXTERNAL INTEGRATION FOUNDATION — STAGE 2 HARDENING & OBSERVABILITY
-- Migration: 20260910000012_phase9_stage2_hardening.sql
-- ==============================================================================

-- 1. EXTERNAL PROVIDERS: CAPABILITIES COLUMN AS OPERATIONAL SOURCE OF TRUTH
ALTER TABLE public.external_providers
ADD COLUMN IF NOT EXISTS capabilities JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Update seeded providers with explicit capability operational states
-- INVARIANT: submit_application, create_mandate, modify_application, cancel_application are 'planned'
-- CDSL / NSDL verify_demat is 'disabled' (deferred to Stage 3)
UPDATE public.external_providers
SET capabilities = '{"verify_demat": "disabled", "read_allotment": "planned", "reconciliation": "planned", "submit_application": "planned"}'::jsonb
WHERE id = 'cdsl';

UPDATE public.external_providers
SET capabilities = '{"verify_demat": "disabled", "read_allotment": "planned", "reconciliation": "planned", "submit_application": "planned"}'::jsonb
WHERE id = 'nsdl';

UPDATE public.external_providers
SET capabilities = '{"read_issue": "planned", "read_application": "planned", "submit_application": "planned", "modify_application": "planned", "cancel_application": "planned"}'::jsonb
WHERE id IN ('bse_ipo', 'nse_ipo');

UPDATE public.external_providers
SET capabilities = '{"read_allotment": "planned", "read_refund": "planned", "reconciliation": "planned"}'::jsonb
WHERE id IN ('link_intime', 'kfintech');

UPDATE public.external_providers
SET capabilities = '{"read_mandate": "planned", "create_mandate": "planned", "webhook_events": "planned"}'::jsonb
WHERE id = 'npci_upi';

-- 2. HARDEN EXTERNAL_ACCOUNTS: SIZE CHECKS & IDENTITY IMMUTABILITY
DO $$ BEGIN
    ALTER TABLE public.external_accounts
    ADD CONSTRAINT chk_ext_acc_ref_size
    CHECK (octet_length(account_reference_masked) <= 64);
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Identity Immutability Trigger: prevent mutation of user_id, provider_id, or account_reference_masked
CREATE OR REPLACE FUNCTION public.check_external_account_identity_immutable()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.user_id <> NEW.user_id THEN
        RAISE EXCEPTION 'Security Violation: user_id of external_account is permanently immutable.';
    END IF;
    IF OLD.provider_id <> NEW.provider_id THEN
        RAISE EXCEPTION 'Security Violation: provider_id of external_account is permanently immutable.';
    END IF;
    IF OLD.account_reference_masked <> NEW.account_reference_masked THEN
        RAISE EXCEPTION 'Security Violation: account_reference_masked is permanently immutable.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_external_account_identity_immutable ON public.external_accounts;
CREATE TRIGGER trg_external_account_identity_immutable
    BEFORE UPDATE ON public.external_accounts
    FOR EACH ROW
    EXECUTE FUNCTION public.check_external_account_identity_immutable();

-- 3. HARDEN EXTERNAL_EVENTS: SIZE CONSTRAINTS, FALLBACK IDEMPOTENCY, STRICT STATE MACHINE
DO $$ BEGIN
    ALTER TABLE public.external_events
    ADD CONSTRAINT chk_ext_event_payload_size
    CHECK (octet_length(payload::text) <= 262144); -- 256 KB limit based on UTF-8 JSONB text representation
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE public.external_events
    ADD CONSTRAINT chk_ext_event_metadata_size
    CHECK (octet_length(metadata::text) <= 65536); -- 64 KB limit
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Fallback Idempotency Partial Unique Index when provider_event_id IS NULL
CREATE UNIQUE INDEX IF NOT EXISTS idx_external_events_fallback_idempotency
ON public.external_events (provider_id, environment, payload_hash)
WHERE provider_event_id IS NULL;

-- Strict State Machine Trigger:
-- Permitted transitions:
--   received -> processing
--   processing -> processed, failed, ignored
--   failed -> processing (explicit retry)
--   failed -> ignored
-- Terminal immutable states:
--   processed -> NO TRANSITIONS ALLOWED
--   ignored   -> NO TRANSITIONS ALLOWED
CREATE OR REPLACE FUNCTION public.check_external_event_lifecycle()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = 'processed' THEN
        RAISE EXCEPTION 'State Machine Violation: external_event with status "processed" is terminal and cannot be transitioned to "%".', NEW.status;
    END IF;

    IF OLD.status = 'ignored' THEN
        RAISE EXCEPTION 'State Machine Violation: external_event with status "ignored" is terminal and cannot be transitioned to "%".', NEW.status;
    END IF;

    IF OLD.status = 'received' AND NEW.status NOT IN ('processing', 'received') THEN
        RAISE EXCEPTION 'State Machine Violation: external_event in "received" status must transition to "processing" before terminal resolution, not "%".', NEW.status;
    END IF;

    IF OLD.status = 'processing' AND NEW.status NOT IN ('processing', 'processed', 'failed', 'ignored') THEN
        RAISE EXCEPTION 'State Machine Violation: invalid transition from "processing" to "%".', NEW.status;
    END IF;

    IF OLD.status = 'failed' AND NEW.status NOT IN ('failed', 'processing', 'ignored') THEN
        RAISE EXCEPTION 'State Machine Violation: external_event in "failed" status can only transition to "processing" (retry) or "ignored", not "%".', NEW.status;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_external_events_lifecycle ON public.external_events;
CREATE TRIGGER trg_external_events_lifecycle
    BEFORE UPDATE OF status ON public.external_events
    FOR EACH ROW
    EXECUTE FUNCTION public.check_external_event_lifecycle();

-- 4. HARDEN PRUNING: APPEND-ONLY PRUNING RUN HISTORY & CONSTRAINED PRUNING FUNCTION
CREATE TABLE IF NOT EXISTS public.external_pruning_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    retention_days INT NOT NULL,
    records_pruned INT NOT NULL,
    duration_ms INT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'completed',
    caller_role TEXT,
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_external_pruning_runs_executed_at
ON public.external_pruning_runs (executed_at DESC);

-- Append-only trigger: BLOCK all UPDATE and DELETE on external_pruning_runs
CREATE OR REPLACE FUNCTION public.prevent_pruning_runs_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Security Violation: external_pruning_runs is an append-only audit log. UPDATE and DELETE are permanently prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_external_pruning_runs_immutable ON public.external_pruning_runs;
CREATE TRIGGER trg_external_pruning_runs_immutable
    BEFORE UPDATE OR DELETE ON public.external_pruning_runs
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_pruning_runs_mutation();

-- RLS on external_pruning_runs:
ALTER TABLE public.external_pruning_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.external_pruning_runs FROM PUBLIC, anon;

DROP POLICY IF EXISTS "external_pruning_runs_admin_select" ON public.external_pruning_runs;
CREATE POLICY "external_pruning_runs_admin_select" ON public.external_pruning_runs
    FOR SELECT TO authenticated
    USING (public.is_admin_or_super());

DROP POLICY IF EXISTS "external_pruning_runs_service_insert" ON public.external_pruning_runs;
CREATE POLICY "external_pruning_runs_service_insert" ON public.external_pruning_runs
    FOR INSERT TO authenticated
    WITH CHECK (
        current_setting('request.jwt.claim.role', true) = 'service_role'
        OR public.is_admin_or_super()
    );

-- Constrained 90-Day Raw Payload Pruning Function
-- Fixes policy at 90 days (enforced between 30 and 365, defaults to 90)
-- Accurately tracks execution duration and writes immutable run history on success
CREATE OR REPLACE FUNCTION public.prune_expired_raw_payloads(
    p_retention_days INT DEFAULT 90
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_start TIMESTAMPTZ := clock_timestamp();
    v_end TIMESTAMPTZ;
    v_pruned INT;
    v_duration INT;
    v_run_id UUID;
    v_role TEXT := current_setting('request.jwt.claim.role', true);
BEGIN
    -- Authorization: only admin or service_role
    IF NOT (public.is_admin_or_super() OR v_role = 'service_role') THEN
        RAISE EXCEPTION 'Access Denied: Administrative role required to prune raw external payloads.';
    END IF;

    -- Strict Retention Policy Guard: 90 days is fixed policy for Stage 2
    IF p_retention_days IS NOT NULL AND p_retention_days <> 90 THEN
        RAISE EXCEPTION 'Policy Violation: Raw payload retention is fixed at 90 days in Phase 9 Stage 2. Received: %', p_retention_days;
    END IF;

    -- Update payload to tombstones for raw payloads older than retention policy
    -- Preserves provider_id, event_id, event_type, payload_hash, metadata, timestamps
    WITH updated AS (
        UPDATE public.external_events
        SET payload = jsonb_build_object(
            '_pruned', true,
            '_pruned_at', NOW(),
            '_retention_days', p_retention_days
        )
        WHERE received_at < (NOW() - (p_retention_days || ' days')::INTERVAL)
          AND NOT (payload ? '_pruned')
        RETURNING id
    )
    SELECT COUNT(*) INTO v_pruned FROM updated;

    v_end := clock_timestamp();
    v_duration := EXTRACT(MILLISECONDS FROM (v_end - v_start))::INT;

    -- Record append-only successful run history
    INSERT INTO public.external_pruning_runs (
        retention_days,
        records_pruned,
        duration_ms,
        status,
        caller_role,
        executed_at
    ) VALUES (
        p_retention_days,
        v_pruned,
        v_duration,
        'completed',
        COALESCE(v_role, 'admin'),
        NOW()
    ) RETURNING id INTO v_run_id;

    RETURN jsonb_build_object(
        'success', true,
        'runId', v_run_id,
        'retentionDays', p_retention_days,
        'recordsPruned', v_pruned,
        'durationMs', v_duration,
        'status', 'completed'
    );
END;
$$;

-- Grant execution to authenticated and service_role
REVOKE ALL ON FUNCTION public.prune_expired_raw_payloads FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prune_expired_raw_payloads TO authenticated, service_role;
