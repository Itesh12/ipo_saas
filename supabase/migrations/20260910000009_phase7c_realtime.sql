-- ==============================================================================
-- PHASE 7C: REALTIME NOTIFICATION TRANSPORT & DATABASE LIFECYCLE ENFORCEMENT
-- Migration: 20260910000009_phase7c_realtime.sql
-- ==============================================================================

-- 1. DATABASE-LEVEL MONOTONIC STATUS LIFECYCLE ENFORCEMENT
-- Ensures that notifications can only transition:
-- unread -> read -> archived
-- unread -> archived
-- Reversals (read -> unread, archived -> unread, archived -> read) are strictly rejected.
CREATE OR REPLACE FUNCTION public.enforce_notifications_immutability()
RETURNS TRIGGER AS $$
BEGIN
    -- Protect immutable core fields
    IF OLD.id <> NEW.id OR
       OLD.user_id <> NEW.user_id OR
       OLD.event_id IS DISTINCT FROM NEW.event_id OR
       OLD.category <> NEW.category OR
       OLD.priority <> NEW.priority OR
       OLD.title <> NEW.title OR
       OLD.message <> NEW.message OR
       OLD.action_url IS DISTINCT FROM NEW.action_url OR
       OLD.action_label IS DISTINCT FROM NEW.action_label OR
       OLD.is_mandatory <> NEW.is_mandatory OR
       OLD.created_at <> NEW.created_at OR
       OLD.expires_at IS DISTINCT FROM NEW.expires_at THEN
        RAISE EXCEPTION 'Illegal modification: Notification content, priority, and audit identity are immutable. Only status, read_at, and archived_at can be updated.';
    END IF;

    -- Enforce Monotonic Status Transitions
    IF OLD.status = 'archived' AND NEW.status <> 'archived' THEN
        RAISE EXCEPTION 'Illegal status transition: Archived notifications cannot be transitioned back to %.', NEW.status;
    END IF;

    IF OLD.status = 'read' AND NEW.status = 'unread' THEN
        RAISE EXCEPTION 'Illegal status transition: Read notifications cannot be reverted to unread.';
    END IF;

    -- Preserve read_at if transitioning to archived from read
    IF OLD.read_at IS NOT NULL AND NEW.read_at IS NULL THEN
        NEW.read_at := OLD.read_at;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. REPLICA IDENTITY FULL FOR REALTIME ROW-LEVEL SECURITY DETERMINISM
-- Ensures that PostgreSQL includes all columns in WAL for UPDATE before/after images,
-- enabling Supabase Realtime to reliably evaluate RLS policies (user_id = auth.uid())
-- and non-PK filters on UPDATE events.
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- 3. SUPABASE REALTIME PUBLICATION CONFIGURATION
-- Idempotently adds public.notifications to supabase_realtime publication.
-- Does NOT expose notification_events, deliveries, preferences, or worker state.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
          AND schemaname = 'public' 
          AND tablename = 'notifications'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;
END $$;
