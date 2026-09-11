-- ==============================================================================
-- PHASE 8: ADMIN INTELLIGENCE, WORK QUEUE & HARDENED AUDIT TRAIL
-- Migration: 20260910000010_phase8_admin_intelligence.sql
-- ==============================================================================

-- 1. ENUMS
DO $$ BEGIN
    CREATE TYPE public.work_item_severity AS ENUM ('critical', 'high', 'medium', 'low');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.work_item_status AS ENUM ('open', 'investigating', 'resolved', 'dismissed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.work_item_category AS ENUM (
        'ipo_data_gap',
        'stale_market_data',
        'application_anomaly',
        'allotment_discrepancy',
        'finance_reconciliation',
        'notification_dead_letter',
        'system_health'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. HARDEN AUDIT LOGS TABLE & TRIGGER IMMUTABILITY
ALTER TABLE public.audit_logs 
ADD COLUMN IF NOT EXISTS actor_type VARCHAR(20) NOT NULL DEFAULT 'user';

-- Enforce strict immutability: block UPDATE and DELETE on audit_logs across ALL roles
CREATE OR REPLACE FUNCTION public.prevent_audit_logs_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Security Violation: audit_logs records are strictly immutable. UPDATE and DELETE operations are permanently prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_immutable
    BEFORE UPDATE OR DELETE ON public.audit_logs
    FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_logs_mutation();

-- Revoke client-side INSERT, UPDATE, DELETE on audit_logs
REVOKE ALL ON public.audit_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;

-- Secure Server-Side Audit Logging Function (SECURITY DEFINER)
-- Strictly avoids actor impersonation: derives human actor from auth.uid() or sets system actor
CREATE OR REPLACE FUNCTION public.record_audit_log(
    p_action TEXT,
    p_resource_type TEXT,
    p_resource_id TEXT,
    p_old_values JSONB DEFAULT NULL,
    p_new_values JSONB DEFAULT NULL,
    p_ip_address TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_log_id UUID;
    v_actor_id UUID;
    v_actor_type TEXT;
BEGIN
    -- Authorization: only service_role or database superuser can execute
    IF current_setting('request.jwt.claim.role', true) <> 'service_role' AND current_user <> 'postgres' THEN
        RAISE EXCEPTION 'Access Denied: record_audit_log can only be executed by trusted server-side services.';
    END IF;

    -- Anti-spoofing Actor Attribution Logic
    -- If an authenticated user token is present in the context, attribute to that user.
    -- Otherwise (background worker / cron / system process), explicitly attribute to 'system' with NULL actor_id.
    IF auth.uid() IS NOT NULL THEN
        v_actor_id := auth.uid();
        v_actor_type := 'user';
    ELSE
        v_actor_id := NULL;
        v_actor_type := 'system';
    END IF;

    -- Defensive payload size guard (max 64KB per values payload)
    IF pg_column_size(p_old_values) > 65536 OR pg_column_size(p_new_values) > 65536 THEN
        RAISE EXCEPTION 'Audit payload exceeds maximum allowed size of 64KB.';
    END IF;

    INSERT INTO public.audit_logs (
        actor_id,
        actor_type,
        action,
        resource_type,
        resource_id,
        old_values,
        new_values,
        ip_address,
        user_agent,
        created_at
    ) VALUES (
        v_actor_id,
        v_actor_type,
        p_action,
        p_resource_type,
        p_resource_id,
        p_old_values,
        p_new_values,
        p_ip_address,
        p_user_agent,
        NOW()
    )
    RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_audit_log FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_audit_log TO service_role;

-- 3. ADMIN WORK ITEMS TABLE & ACTIVE-ANOMALY DEDUPLICATION
CREATE TABLE IF NOT EXISTS public.admin_work_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fingerprint TEXT NOT NULL,
    severity public.work_item_severity NOT NULL DEFAULT 'medium',
    category public.work_item_category NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    status public.work_item_status NOT NULL DEFAULT 'open',
    assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    due_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Active-Anomaly Unique Index: at most ONE active item per fingerprint
-- Allows anomaly recurrence after resolution/dismissal!
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_work_items_active_fingerprint
ON public.admin_work_items (fingerprint)
WHERE status IN ('open', 'investigating');

CREATE INDEX IF NOT EXISTS idx_work_items_status ON public.admin_work_items(status);
CREATE INDEX IF NOT EXISTS idx_work_items_severity ON public.admin_work_items(severity);
CREATE INDEX IF NOT EXISTS idx_work_items_category ON public.admin_work_items(category);
CREATE INDEX IF NOT EXISTS idx_work_items_assigned ON public.admin_work_items(assigned_to);
CREATE INDEX IF NOT EXISTS idx_work_items_entity ON public.admin_work_items(entity_type, entity_id);

-- Enforce zero physical deletion of work items
CREATE OR REPLACE FUNCTION public.prevent_work_items_deletion()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Illegal Operation: Work items cannot be physically deleted. Transition status to resolved or dismissed.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_work_items_deletion ON public.admin_work_items;
CREATE TRIGGER trg_prevent_work_items_deletion
    BEFORE DELETE ON public.admin_work_items
    FOR EACH ROW EXECUTE FUNCTION public.prevent_work_items_deletion();

-- Database-Level State Machine Enforcement on admin_work_items
CREATE OR REPLACE FUNCTION public.enforce_work_item_lifecycle()
RETURNS TRIGGER AS $$
BEGIN
    -- Protect immutable core fields
    IF OLD.id <> NEW.id OR
       OLD.fingerprint <> NEW.fingerprint OR
       OLD.entity_type <> NEW.entity_type OR
       OLD.entity_id <> NEW.entity_id OR
       OLD.created_at <> NEW.created_at THEN
        RAISE EXCEPTION 'Illegal modification: Work item identity, fingerprint, entity, and created_at are immutable.';
    END IF;

    -- State Machine Validation
    IF OLD.status = 'open' AND NEW.status NOT IN ('open', 'investigating', 'resolved', 'dismissed') THEN
        RAISE EXCEPTION 'Illegal state transition from open to %', NEW.status;
    END IF;

    IF OLD.status = 'investigating' AND NEW.status NOT IN ('investigating', 'open', 'resolved', 'dismissed') THEN
        RAISE EXCEPTION 'Illegal state transition from investigating to %', NEW.status;
    END IF;

    -- Terminal states: resolved and dismissed can ONLY transition to 'open' (explicit reopening)
    IF OLD.status IN ('resolved', 'dismissed') THEN
        IF NEW.status NOT IN (OLD.status, 'open') THEN
            RAISE EXCEPTION 'Illegal state transition: Terminal state % can only be reopened to open, not %.', OLD.status, NEW.status;
        END IF;
        
        -- Require explicit resolution/reopening notes when reopening
        IF NEW.status = 'open' AND (NEW.resolution_notes IS NULL OR NEW.resolution_notes = OLD.resolution_notes) THEN
            RAISE EXCEPTION 'Reopening a resolved or dismissed work item requires updated resolution/reopening notes.';
        END IF;
    END IF;

    -- Timestamp management
    IF NEW.status IN ('resolved', 'dismissed') AND OLD.status NOT IN ('resolved', 'dismissed') THEN
        NEW.resolved_at := COALESCE(NEW.resolved_at, NOW());
        IF NEW.resolved_by IS NULL AND auth.uid() IS NOT NULL THEN
            NEW.resolved_by := auth.uid();
        END IF;
    ELSIF NEW.status = 'open' AND OLD.status IN ('resolved', 'dismissed') THEN
        NEW.resolved_at := NULL;
        NEW.resolved_by := NULL;
    END IF;

    -- Assignment timestamp management
    IF NEW.assigned_to IS NOT NULL AND OLD.assigned_to IS NULL THEN
        NEW.assigned_at := NOW();
    ELSIF NEW.assigned_to IS NULL THEN
        NEW.assigned_at := NULL;
    END IF;

    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_work_item_lifecycle ON public.admin_work_items;
CREATE TRIGGER trg_enforce_work_item_lifecycle
    BEFORE UPDATE ON public.admin_work_items
    FOR EACH ROW EXECUTE FUNCTION public.enforce_work_item_lifecycle();

-- 4. ADMIN WORK ITEM HISTORY TABLE & AUTOMATIC HISTORY TRACKER
CREATE TABLE IF NOT EXISTS public.admin_work_item_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_item_id UUID NOT NULL REFERENCES public.admin_work_items(id) ON DELETE RESTRICT,
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    actor_type TEXT NOT NULL DEFAULT 'user',
    previous_status public.work_item_status,
    new_status public.work_item_status NOT NULL,
    action TEXT NOT NULL, -- 'created', 'status_change', 'assignment_change', 'reopened'
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_work_item_hist_item ON public.admin_work_item_history(work_item_id);

-- Strictly prohibit UPDATE or DELETE on history records
CREATE OR REPLACE FUNCTION public.prevent_work_item_history_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Security Violation: admin_work_item_history records are strictly immutable. UPDATE and DELETE operations are permanently prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_work_item_history_immutable ON public.admin_work_item_history;
CREATE TRIGGER trg_work_item_history_immutable
    BEFORE UPDATE OR DELETE ON public.admin_work_item_history
    FOR EACH ROW EXECUTE FUNCTION public.prevent_work_item_history_mutation();

-- Automatic History Generation Trigger on admin_work_items
CREATE OR REPLACE FUNCTION public.track_work_item_history()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO public.admin_work_item_history (
            work_item_id, actor_id, actor_type, previous_status, new_status, action, notes
        ) VALUES (
            NEW.id, 
            auth.uid(), 
            CASE WHEN auth.uid() IS NOT NULL THEN 'user' ELSE 'system' END,
            NULL, 
            NEW.status, 
            'created', 
            COALESCE(NEW.description, 'Work item created')
        );
    ELSIF (TG_OP = 'UPDATE') THEN
        IF OLD.status <> NEW.status OR OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
            INSERT INTO public.admin_work_item_history (
                work_item_id, 
                actor_id, 
                actor_type,
                previous_status, 
                new_status, 
                action, 
                notes
            ) VALUES (
                NEW.id, 
                auth.uid(), 
                CASE WHEN auth.uid() IS NOT NULL THEN 'user' ELSE 'system' END,
                OLD.status, 
                NEW.status, 
                CASE 
                    WHEN OLD.status IN ('resolved', 'dismissed') AND NEW.status = 'open' THEN 'reopened'
                    WHEN OLD.status <> NEW.status THEN 'status_change'
                    ELSE 'assignment_change'
                END,
                NEW.resolution_notes
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_track_work_item_history ON public.admin_work_items;
CREATE TRIGGER trg_track_work_item_history
    AFTER INSERT OR UPDATE ON public.admin_work_items
    FOR EACH ROW EXECUTE FUNCTION public.track_work_item_history();

REVOKE ALL ON public.admin_work_item_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_work_item_history TO authenticated;

-- 5. CONTROLLED ADMINISTRATIVE INTELLIGENCE RPCs
-- Controlled global health metrics: accessible ONLY to admin, super_admin, or service_role
DROP FUNCTION IF EXISTS public.get_admin_system_health();
CREATE OR REPLACE FUNCTION public.get_admin_system_health()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT (public.is_admin_or_super() OR current_setting('request.jwt.claim.role', true) = 'service_role') THEN
        RAISE EXCEPTION 'Access Denied: Administrative role required to access global system health metrics.';
    END IF;

    RETURN jsonb_build_object(
        'pending_notifications', (SELECT COUNT(*) FROM public.notification_events WHERE status = 'pending'),
        'processing_notifications', (SELECT COUNT(*) FROM public.notification_events WHERE status = 'processing'),
        'dead_letter_notifications', (SELECT COUNT(*) FROM public.notification_events WHERE status = 'dead_letter'),
        'completed_24h_notifications', (SELECT COUNT(*) FROM public.notification_events WHERE status = 'processed' AND created_at >= (NOW() - INTERVAL '24 hours')),
        'submitted_applications', (SELECT COUNT(*) FROM public.ipo_applications WHERE status = 'submitted'),
        'mandate_pending_applications', (SELECT COUNT(*) FROM public.ipo_applications WHERE status = 'mandate_pending'),
        'allotment_pending_applications', (SELECT COUNT(*) FROM public.ipo_applications WHERE status = 'allotment_pending'),
        'critical_work_items', (SELECT COUNT(*) FROM public.admin_work_items WHERE status IN ('open', 'investigating') AND severity = 'critical'),
        'total_active_work_items', (SELECT COUNT(*) FROM public.admin_work_items WHERE status IN ('open', 'investigating'))
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_system_health FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_system_health TO authenticated, service_role;

-- Controlled IPO Data Quality Report RPC: accessible ONLY to admin, super_admin, editor, analyst, or service_role
DROP FUNCTION IF EXISTS public.get_ipo_data_quality_report();
CREATE OR REPLACE FUNCTION public.get_ipo_data_quality_report()
RETURNS TABLE (
    ipo_id UUID,
    symbol TEXT,
    company_name TEXT,
    status ipo_status,
    open_date DATE,
    close_date DATE,
    allotment_date DATE,
    listing_date DATE,
    has_basic_details BOOLEAN,
    has_financials BOOLEAN,
    has_valuation BOOLEAN,
    has_promoters BOOLEAN,
    has_risks BOOLEAN,
    has_subscription BOOLEAN,
    has_fresh_gmp BOOLEAN,
    has_documents BOOLEAN,
    has_news BOOLEAN,
    completeness_score INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT (
        public.get_current_user_role() IN ('super_admin', 'admin', 'editor', 'analyst')
        OR current_setting('request.jwt.claim.role', true) = 'service_role'
    ) THEN
        RAISE EXCEPTION 'Access Denied: Administrative, editor, or analyst role required to access IPO data quality reports.';
    END IF;

    RETURN QUERY
    SELECT 
        i.id AS ipo_id,
        i.symbol::TEXT,
        i.company_name::TEXT,
        i.status,
        i.open_date,
        i.close_date,
        i.allotment_date,
        i.listing_date,
        (i.price_band_low > 0 AND i.price_band_high >= i.price_band_low AND i.lot_size > 0 AND i.issue_size_cr > 0) AS has_basic_details,
        EXISTS (SELECT 1 FROM public.ipo_financials f WHERE f.ipo_id = i.id) AS has_financials,
        EXISTS (SELECT 1 FROM public.ipo_valuations v WHERE v.ipo_id = i.id) AS has_valuation,
        EXISTS (SELECT 1 FROM public.ipo_promoters p WHERE p.ipo_id = i.id) AS has_promoters,
        EXISTS (SELECT 1 FROM public.ipo_risks r WHERE r.ipo_id = i.id) AS has_risks,
        EXISTS (SELECT 1 FROM public.ipo_subscription_snapshots s WHERE s.ipo_id = i.id) AS has_subscription,
        EXISTS (
            SELECT 1 FROM public.ipo_gmp_entries g 
            WHERE g.ipo_id = i.id AND g.observed_at >= (NOW() - INTERVAL '48 hours')
        ) AS has_fresh_gmp,
        EXISTS (
            SELECT 1 FROM public.ipo_documents d 
            WHERE d.ipo_id = i.id AND d.document_type IN ('drhp', 'rhp', 'prospectus')
        ) AS has_documents,
        EXISTS (SELECT 1 FROM public.ipo_news n WHERE n.ipo_id = i.id) AS has_news,
        (
            (CASE WHEN i.price_band_low > 0 AND i.price_band_high >= i.price_band_low AND i.lot_size > 0 THEN 20 ELSE 0 END) +
            (CASE WHEN EXISTS (SELECT 1 FROM public.ipo_financials f WHERE f.ipo_id = i.id) THEN 15 ELSE 0 END) +
            (CASE WHEN EXISTS (SELECT 1 FROM public.ipo_valuations v WHERE v.ipo_id = i.id) THEN 15 ELSE 0 END) +
            (CASE WHEN EXISTS (SELECT 1 FROM public.ipo_promoters p WHERE p.ipo_id = i.id) THEN 10 ELSE 0 END) +
            (CASE WHEN EXISTS (SELECT 1 FROM public.ipo_risks r WHERE r.ipo_id = i.id) THEN 10 ELSE 0 END) +
            (CASE WHEN EXISTS (SELECT 1 FROM public.ipo_subscription_snapshots s WHERE s.ipo_id = i.id) THEN 10 ELSE 0 END) +
            (CASE WHEN EXISTS (SELECT 1 FROM public.ipo_gmp_entries g WHERE g.ipo_id = i.id AND g.observed_at >= (NOW() - INTERVAL '48 hours')) THEN 10 ELSE 0 END) +
            (CASE WHEN EXISTS (SELECT 1 FROM public.ipo_documents d WHERE d.ipo_id = i.id AND d.document_type IN ('drhp', 'rhp', 'prospectus')) THEN 10 ELSE 0 END)
        )::INTEGER AS completeness_score
    FROM public.ipos i;
END;
$$;

REVOKE ALL ON FUNCTION public.get_ipo_data_quality_report FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ipo_data_quality_report TO authenticated, service_role;

-- 6. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.admin_work_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_work_item_history ENABLE ROW LEVEL SECURITY;

-- WORK ITEMS RLS:
-- Staff (super_admin, admin, editor, analyst) can view work items
DROP POLICY IF EXISTS "Staff view admin work items" ON public.admin_work_items;
CREATE POLICY "Staff view admin work items"
    ON public.admin_work_items
    FOR SELECT
    USING (
        public.get_current_user_role() IN ('super_admin', 'admin', 'editor', 'analyst')
    );

-- Admins and Editors can update work items (state machine guarded by trigger)
DROP POLICY IF EXISTS "Staff update admin work items" ON public.admin_work_items;
CREATE POLICY "Staff update admin work items"
    ON public.admin_work_items
    FOR UPDATE
    USING (
        public.get_current_user_role() IN ('super_admin', 'admin', 'editor')
    );

-- Service role / admins can insert work items
DROP POLICY IF EXISTS "Admins insert admin work items" ON public.admin_work_items;
CREATE POLICY "Admins insert admin work items"
    ON public.admin_work_items
    FOR INSERT
    WITH CHECK (
        public.get_current_user_role() IN ('super_admin', 'admin')
        OR current_setting('request.jwt.claim.role', true) = 'service_role'
    );

-- WORK ITEM HISTORY RLS:
DROP POLICY IF EXISTS "Staff view admin work item history" ON public.admin_work_item_history;
CREATE POLICY "Staff view admin work item history"
    ON public.admin_work_item_history
    FOR SELECT
    USING (
        public.get_current_user_role() IN ('super_admin', 'admin', 'editor', 'analyst')
    );
