-- ==============================================================================
-- PHASE 7B: NOTIFICATION PROCESSING, EVALUATORS & CONCURRENCY ENGINE
-- Migration: 20260910000008_phase7b_processing.sql
-- ==============================================================================

-- 0. OPERATIONAL METADATA COLUMN ON NOTIFICATION_EVENTS
-- Retains replay history and operational telemetry without mutating immutable payload
ALTER TABLE public.notification_events 
ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 1. PERSISTENT SCREEN MATCH TRACKING TABLE
-- Stores screen-to-IPO matches deterministically to avoid duplicate notifications
CREATE TABLE IF NOT EXISTS public.notification_screen_matches (
    screen_id UUID NOT NULL REFERENCES public.saved_screens(id) ON DELETE CASCADE,
    ipo_id UUID NOT NULL REFERENCES public.ipos(id) ON DELETE CASCADE,
    matched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (screen_id, ipo_id)
);

CREATE INDEX IF NOT EXISTS idx_screen_matches_screen 
ON public.notification_screen_matches (screen_id);

CREATE INDEX IF NOT EXISTS idx_screen_matches_ipo 
ON public.notification_screen_matches (ipo_id);

ALTER TABLE public.notification_screen_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view screen matches for own screens" ON public.notification_screen_matches;
CREATE POLICY "Users can view screen matches for own screens"
ON public.notification_screen_matches FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.saved_screens s
        WHERE s.id = notification_screen_matches.screen_id
          AND s.user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "notification_screen_matches service-only modification" ON public.notification_screen_matches;
CREATE POLICY "notification_screen_matches service-only modification"
ON public.notification_screen_matches FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- 2. DATABASE-LEVEL NOTIFICATION DEDUPLICATION UNIQUE CONSTRAINTS
-- Prevents duplicate in-app notification rows for the same event and user
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_user_event 
ON public.notifications (user_id, event_id) 
WHERE event_id IS NOT NULL;

-- Prevents duplicate delivery channel attempts for a single notification
CREATE UNIQUE INDEX IF NOT EXISTS uq_deliveries_notif_channel 
ON public.notification_deliveries (notification_id, channel);

-- 3. HARDENED CONCURRENT EVENT CLAIMING RPC
-- Atomically leases a batch of pending/expired events using FOR UPDATE SKIP LOCKED
CREATE OR REPLACE FUNCTION public.claim_notification_events(
    p_batch_size INTEGER DEFAULT 10,
    p_lock_id UUID DEFAULT gen_random_uuid(),
    p_lease_seconds INTEGER DEFAULT 60
)
RETURNS TABLE (
    id UUID,
    event_type VARCHAR,
    event_class VARCHAR,
    idempotency_key VARCHAR,
    aggregate_type VARCHAR,
    aggregate_id VARCHAR,
    user_id UUID,
    payload JSONB,
    schema_version VARCHAR,
    attempt_count INTEGER,
    max_attempts INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Strict authorization check: Only service_role or admin callers permitted
    IF auth.role() <> 'service_role' AND public.get_current_user_role() NOT IN ('super_admin', 'admin') THEN
        RAISE EXCEPTION 'Access denied: Admin or service-role privileges required';
    END IF;

    -- Argument validation
    IF p_batch_size IS NULL OR p_batch_size < 1 OR p_batch_size > 100 THEN
        RAISE EXCEPTION 'Invalid batch_size: must be between 1 and 100';
    END IF;
    IF p_lease_seconds IS NULL OR p_lease_seconds < 10 OR p_lease_seconds > 600 THEN
        RAISE EXCEPTION 'Invalid lease_seconds: must be between 10 and 600';
    END IF;

    RETURN QUERY
    WITH candidate_events AS (
        SELECT ne.id
        FROM public.notification_events ne
        WHERE (ne.status = 'pending' AND ne.available_at <= NOW())
           OR (ne.status = 'processing' AND ne.locked_at < NOW() - (p_lease_seconds || ' seconds')::interval)
        ORDER BY ne.created_at ASC
        LIMIT p_batch_size
        FOR UPDATE SKIP LOCKED
    )
    UPDATE public.notification_events target
    SET status = 'processing',
        concurrency_lock_id = p_lock_id,
        locked_at = NOW(),
        available_at = NOW() + (p_lease_seconds || ' seconds')::interval,
        attempt_count = target.attempt_count + 1
    FROM candidate_events
    WHERE target.id = candidate_events.id
    RETURNING 
        target.id,
        target.event_type,
        target.event_class,
        target.idempotency_key,
        target.aggregate_type,
        target.aggregate_id,
        target.user_id,
        target.payload,
        target.schema_version,
        target.attempt_count,
        target.max_attempts;
END;
$$;

-- 4. HARDENED AUDITED DEAD-LETTER REPLAY RPC
-- Resets dead-letter events while preserving complete failure history in JSON metadata
CREATE OR REPLACE FUNCTION public.replay_dead_letter_event(
    p_event_id UUID,
    p_reason TEXT DEFAULT 'Operator manual replay',
    p_operator_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_target public.notification_events%ROWTYPE;
BEGIN
    -- Strict authorization check: Only service_role or admin callers permitted
    IF auth.role() <> 'service_role' AND public.get_current_user_role() NOT IN ('super_admin', 'admin') THEN
        RAISE EXCEPTION 'Access denied: Admin or service-role privileges required to replay dead-letter events';
    END IF;

    IF p_event_id IS NULL THEN
        RAISE EXCEPTION 'Invalid event_id: cannot be null';
    END IF;

    SELECT * INTO v_target FROM public.notification_events WHERE id = p_event_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Event % not found', p_event_id;
    END IF;
    IF v_target.status <> 'dead_letter' THEN
        RAISE EXCEPTION 'Event % is not in dead_letter status (current: %)', p_event_id, v_target.status;
    END IF;

    -- Audit trail preservation: Record replay in metadata without losing historical attempt counts
    UPDATE public.notification_events
    SET status = 'pending',
        attempt_count = 0,
        available_at = NOW(),
        locked_at = NULL,
        concurrency_lock_id = NULL,
        last_error = NULL,
        metadata = jsonb_set(
            COALESCE(metadata, '{}'::jsonb),
            '{replay_history}',
            COALESCE(metadata->'replay_history', '[]'::jsonb) || jsonb_build_object(
                'replayed_at', NOW(),
                'replayed_by', COALESCE(p_operator_id, auth.uid()),
                'reason', p_reason,
                'prior_attempts', v_target.attempt_count,
                'prior_error', v_target.last_error
            )
        )
    WHERE id = p_event_id;

    RETURN TRUE;
END;
$$;

-- 5. SECURE PRIVILEGES: Revoke from public/anon/authenticated; Grant only to service_role
REVOKE EXECUTE ON FUNCTION public.claim_notification_events(INTEGER, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.replay_dead_letter_event(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_notification_events(INTEGER, UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.replay_dead_letter_event(UUID, TEXT, UUID) TO service_role;
