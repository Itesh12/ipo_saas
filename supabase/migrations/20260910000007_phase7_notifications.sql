-- ==============================================================================
-- PHASE 7: NOTIFICATIONS & EVENT-DRIVEN DELIVERY (FOUNDATION)
-- Migration: 20260910000007_phase7_notifications.sql
-- ==============================================================================

-- 1. NOTIFICATION ENUMS
DO $$ BEGIN
  CREATE TYPE notification_category AS ENUM (
    'ipo_milestone',
    'application_lifecycle',
    'allotment_refund',
    'research_gmp',
    'portfolio_capital'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE notification_priority AS ENUM (
    'urgent',
    'high',
    'normal',
    'low'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE notification_status AS ENUM (
    'unread',
    'read',
    'archived',
    'expired'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE notification_event_status AS ENUM (
    'pending',
    'processing',
    'processed',
    'failed',
    'dead_letter'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE notification_delivery_channel AS ENUM (
    'in_app',
    'email',
    'push',
    'sms',
    'whatsapp'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE notification_delivery_status AS ENUM (
    'pending',
    'simulated',
    'mock_delivered',
    'delivered',
    'failed'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. NOTIFICATION EVENTS TABLE (Durable Event Inbox with Post-Commit Ingestion)
CREATE TABLE IF NOT EXISTS public.notification_events (
    -- Immutable core event data
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(80) NOT NULL,
    event_class VARCHAR(30) NOT NULL CHECK (event_class IN ('transaction_driven', 'condition_driven')),
    idempotency_key VARCHAR(150) NOT NULL UNIQUE,
    aggregate_type VARCHAR(40) NOT NULL,
    aggregate_id VARCHAR(80) NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    schema_version VARCHAR(10) NOT NULL DEFAULT 'v1.0',
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Mutable processing state
    status notification_event_status NOT NULL DEFAULT 'pending',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    concurrency_lock_id UUID,
    locked_at TIMESTAMPTZ,
    available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_notification_events_dispatch 
ON public.notification_events (status, available_at) 
WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_notification_events_agg 
ON public.notification_events (aggregate_type, aggregate_id);

-- Trigger: Enforce Immutability on Core Event Fields
CREATE OR REPLACE FUNCTION public.enforce_notification_events_immutability()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.id <> NEW.id OR
       OLD.event_type <> NEW.event_type OR
       OLD.event_class <> NEW.event_class OR
       OLD.idempotency_key <> NEW.idempotency_key OR
       OLD.aggregate_type <> NEW.aggregate_type OR
       OLD.aggregate_id <> NEW.aggregate_id OR
       OLD.user_id IS DISTINCT FROM NEW.user_id OR
       OLD.payload <> NEW.payload OR
       OLD.schema_version <> NEW.schema_version OR
       OLD.occurred_at <> NEW.occurred_at OR
       OLD.created_at <> NEW.created_at THEN
        RAISE EXCEPTION 'Illegal modification: Core event header and payload are immutable.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notification_events_immutability ON public.notification_events;
CREATE TRIGGER trg_notification_events_immutability
BEFORE UPDATE ON public.notification_events
FOR EACH ROW EXECUTE FUNCTION public.enforce_notification_events_immutability();

-- 3. NOTIFICATIONS TABLE (User In-App Inbox)
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    event_id UUID REFERENCES public.notification_events(id) ON DELETE RESTRICT,
    category notification_category NOT NULL,
    priority notification_priority NOT NULL DEFAULT 'normal',
    status notification_status NOT NULL DEFAULT 'unread',
    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    action_url VARCHAR(255),
    action_label VARCHAR(60),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_mandatory BOOLEAN NOT NULL DEFAULT false,
    read_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_inbox 
ON public.notifications (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_category 
ON public.notifications (user_id, category);

-- Trigger: Block Physical Deletion of Notifications (Audit Preservation)
CREATE OR REPLACE FUNCTION public.prevent_notification_physical_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Physical deletion of notification records is prohibited. Use status transition to archived or expired.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_notification_delete ON public.notifications;
CREATE TRIGGER trg_prevent_notification_delete
BEFORE DELETE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.prevent_notification_physical_delete();

-- Trigger: Enforce Immutability of Notification Content, Ownership, and Metadata
CREATE OR REPLACE FUNCTION public.enforce_notifications_immutability()
RETURNS TRIGGER AS $$
BEGIN
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
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_notifications_immutability ON public.notifications;
CREATE TRIGGER trg_enforce_notifications_immutability
BEFORE UPDATE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.enforce_notifications_immutability();

-- 4. USER NOTIFICATION PREFERENCES TABLE
CREATE TABLE IF NOT EXISTS public.notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    category notification_category NOT NULL,
    channel_in_app BOOLEAN NOT NULL DEFAULT true, -- Informational & Immutable
    channel_email BOOLEAN NOT NULL DEFAULT true,
    channel_push BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_category UNIQUE (user_id, category)
);

CREATE INDEX IF NOT EXISTS idx_notification_preferences_user 
ON public.notification_preferences (user_id);

-- Trigger: Enforce Mandatory In-App Channel Invariant
CREATE OR REPLACE FUNCTION public.enforce_mandatory_in_app()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.channel_in_app IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Illegal modification: channel_in_app cannot be set to false. In-app notifications are mandatory.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_mandatory_in_app ON public.notification_preferences;
CREATE TRIGGER trg_enforce_mandatory_in_app
BEFORE INSERT OR UPDATE ON public.notification_preferences
FOR EACH ROW EXECUTE FUNCTION public.enforce_mandatory_in_app();

-- 5. USER NOTIFICATION SETTINGS TABLE (Timezone & Quiet Hours)
CREATE TABLE IF NOT EXISTS public.user_notification_settings (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE RESTRICT,
    timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',
    quiet_hours_enabled BOOLEAN NOT NULL DEFAULT false,
    quiet_hours_start TIME NOT NULL DEFAULT '22:00:00',
    quiet_hours_end TIME NOT NULL DEFAULT '07:00:00',
    min_priority_during_quiet notification_priority NOT NULL DEFAULT 'urgent',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. NOTIFICATION DELIVERIES TABLE (Non-Destructive Delivery History)
CREATE TABLE IF NOT EXISTS public.notification_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE RESTRICT,
    channel notification_delivery_channel NOT NULL,
    status notification_delivery_status NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 1,
    provider_name VARCHAR(50) NOT NULL,
    provider_reference VARCHAR(100),
    error_details TEXT,
    dispatched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_lookup 
ON public.notification_deliveries (notification_id, channel);

-- 7. ROW-LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

-- Notifications: User Isolation (SELECT and UPDATE only)
DROP POLICY IF EXISTS "Users view own notifications" ON public.notifications;
CREATE POLICY "Users view own notifications"
ON public.notifications FOR SELECT
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users update own notifications"
ON public.notifications FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Notification Preferences: User Isolation
DROP POLICY IF EXISTS "Users view own preferences" ON public.notification_preferences;
CREATE POLICY "Users view own preferences"
ON public.notification_preferences FOR SELECT
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own preferences" ON public.notification_preferences;
CREATE POLICY "Users update own preferences"
ON public.notification_preferences FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- User Notification Settings: User Isolation
DROP POLICY IF EXISTS "Users view own settings" ON public.user_notification_settings;
CREATE POLICY "Users view own settings"
ON public.user_notification_settings FOR SELECT
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own settings" ON public.user_notification_settings;
CREATE POLICY "Users update own settings"
ON public.user_notification_settings FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Notification Deliveries: Recipient View Only
DROP POLICY IF EXISTS "Users view own deliveries" ON public.notification_deliveries;
CREATE POLICY "Users view own deliveries"
ON public.notification_deliveries FOR SELECT
USING (
    notification_id IN (
        SELECT id FROM public.notifications WHERE user_id = auth.uid()
    )
);

-- Notification Events: Admin and Service Role Only
DROP POLICY IF EXISTS "Admins view notification events" ON public.notification_events;
CREATE POLICY "Admins view notification events"
ON public.notification_events FOR SELECT
USING (public.is_admin_or_super());
