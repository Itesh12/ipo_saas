-- ==============================================================================
-- Migration: 20260911000013_phase9_stage3_inbox.sql
-- Phase 9 Stage 3A: Broker-Independent Real IPO Master Data Ingestion Architecture
-- 
-- Features:
-- 1. Canonical Ingestion Inbox Table (Review Entity)
-- 2. Immutable Time-Series Observations Table (Historical Observations)
-- 3. Circular-safe Latest Observation Foreign Key (ON DELETE RESTRICT)
-- 4. PostgreSQL-Enforced Observation Immutability Trigger (Dual-Key Protected)
-- 5. PostgreSQL-Enforced Inbox Hard-Delete Prohibition Trigger
-- 6. Latest Observation Consistency Trigger (No Cross-Inbox Pointers)
-- 7. Global Source-Identity Invariance Check (1:1 Source-Identity to Inbox binding)
-- 8. Concurrency-Safe Observation Ingestion Function (pg_advisory_xact_lock)
-- 9. Hardened 90-Day Raw Payload Pruning Function (service_role restricted)
-- 10. Strict Row-Level Security Policies for Admins
-- ==============================================================================

-- 1. Canonical Ingestion Inbox Table (Review Entity)
CREATE TABLE IF NOT EXISTS public.ipo_ingestion_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name VARCHAR(255) NOT NULL,
  symbol VARCHAR(32),
  isin VARCHAR(12),
  review_status VARCHAR(32) NOT NULL DEFAULT 'pending', -- 'pending', 'promoted_to_draft', 'promoted_to_published', 'rejected', 'archived'
  has_conflict BOOLEAN NOT NULL DEFAULT FALSE,
  conflict_details JSONB,
  latest_observation_id UUID NULL,
  promoted_ipo_id UUID REFERENCES public.ipos(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_inbox_review_status ON public.ipo_ingestion_inbox(review_status);
CREATE INDEX IF NOT EXISTS idx_inbox_isin ON public.ipo_ingestion_inbox(isin) WHERE isin IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inbox_symbol ON public.ipo_ingestion_inbox(symbol) WHERE symbol IS NOT NULL;

-- 2. Immutable Time-Series Observations Table
CREATE TABLE IF NOT EXISTS public.ipo_ingestion_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inbox_id UUID NOT NULL REFERENCES public.ipo_ingestion_inbox(id) ON DELETE RESTRICT,
  source VARCHAR(64) NOT NULL,                 -- 'sebi', 'nse', 'bse', 'upstox'
  external_id VARCHAR(128) NOT NULL,          -- Source-specific record/filing ID
  document_type VARCHAR(64) NOT NULL,          -- 'IPO_MASTER', 'DRHP', 'RHP', 'PROSPECTUS', 'ADDENDUM'
  observation_version INTEGER NOT NULL DEFAULT 1,
  payload_hash VARCHAR(64) NOT NULL,           -- SHA-256 for observation deduplication
  raw_payload JSONB,                           -- NULL after 90 days (tombstoned by pruning)
  normalized_payload JSONB NOT NULL,           -- Canonical structured payload (PERMANENT)
  provenance JSONB NOT NULL,                   -- Field-level source attribution (PERMANENT)
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_payload_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days'),
  CONSTRAINT uq_observation_version UNIQUE (source, external_id, document_type, observation_version)
);

CREATE INDEX IF NOT EXISTS idx_obs_inbox_id ON public.ipo_ingestion_observations(inbox_id);
CREATE INDEX IF NOT EXISTS idx_obs_retention ON public.ipo_ingestion_observations(raw_payload_expires_at) WHERE raw_payload IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_obs_lookup ON public.ipo_ingestion_observations(source, external_id, document_type);

-- 2B. Dedicated Database-Level Global Source Identity Binding Table (Hardening Req 1)
-- Enforces that for each (source, external_id, document_type) there is EXACTLY ONE canonical inbox.
CREATE TABLE IF NOT EXISTS public.ipo_source_identity_bindings (
  source VARCHAR(64) NOT NULL,
  external_id VARCHAR(128) NOT NULL,
  document_type VARCHAR(64) NOT NULL,
  inbox_id UUID NOT NULL REFERENCES public.ipo_ingestion_inbox(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_ipo_source_identity_bindings PRIMARY KEY (source, external_id, document_type)
);

CREATE INDEX IF NOT EXISTS idx_source_identity_inbox ON public.ipo_source_identity_bindings(inbox_id);

-- 3. Circular-safe Latest Observation Foreign Key
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_inbox_latest_observation'
      AND table_name = 'ipo_ingestion_inbox'
  ) THEN
    ALTER TABLE public.ipo_ingestion_inbox
      ADD CONSTRAINT fk_inbox_latest_observation
      FOREIGN KEY (latest_observation_id)
      REFERENCES public.ipo_ingestion_observations(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- ==============================================================================
-- 4. Database Integrity Enforcement: Triggers
-- ==============================================================================

-- A. Observation Immutability & Hardened Pruning Trigger (Dual-Key Protected)
CREATE OR REPLACE FUNCTION public.trg_enforce_observation_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT := current_setting('request.jwt.claim.role', true);
  v_pruning_authorized BOOLEAN := (current_setting('app.pruning_authorized', true) = 'true');
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Historical IPO observations are immutable and cannot be deleted';
  ELSIF TG_OP = 'UPDATE' THEN
    -- Strictly permit ONLY the service_role pruning routine with transaction-local token
    -- to tombstone expired raw_payload to NULL
    IF v_role = 'service_role'
       AND v_pruning_authorized
       AND (OLD.raw_payload IS NOT NULL AND NEW.raw_payload IS NULL)
       AND OLD.raw_payload_expires_at <= NOW()
       AND NEW.raw_payload_expires_at = OLD.raw_payload_expires_at
       AND OLD.id = NEW.id
       AND OLD.inbox_id = NEW.inbox_id
       AND OLD.source = NEW.source
       AND OLD.external_id = NEW.external_id
       AND OLD.document_type = NEW.document_type
       AND OLD.observation_version = NEW.observation_version
       AND OLD.payload_hash = NEW.payload_hash
       AND OLD.normalized_payload = NEW.normalized_payload
       AND OLD.provenance = NEW.provenance
       AND OLD.observed_at = NEW.observed_at THEN
      RETURN NEW;
    ELSE
      RAISE EXCEPTION 'Historical IPO observations are immutable and cannot be modified';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_observations_immutability ON public.ipo_ingestion_observations;
CREATE TRIGGER trg_observations_immutability
  BEFORE UPDATE OR DELETE ON public.ipo_ingestion_observations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_enforce_observation_immutability();

-- B. Inbox Hard-Delete Prohibition Trigger
CREATE OR REPLACE FUNCTION public.trg_enforce_inbox_no_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Hard deletion of canonical IPO inbox entities is prohibited. Use review_status transitions (rejected/archived) instead.';
END;
$$;

DROP TRIGGER IF EXISTS trg_inbox_no_delete ON public.ipo_ingestion_inbox;
CREATE TRIGGER trg_inbox_no_delete
  BEFORE DELETE ON public.ipo_ingestion_inbox
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_enforce_inbox_no_delete();

-- C. Latest Observation Consistency Trigger (No Cross-Inbox References)
CREATE OR REPLACE FUNCTION public.trg_validate_inbox_latest_observation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_obs_inbox_id UUID;
BEGIN
  IF NEW.latest_observation_id IS NOT NULL THEN
    SELECT inbox_id INTO v_obs_inbox_id
    FROM public.ipo_ingestion_observations
    WHERE id = NEW.latest_observation_id;
    
    IF v_obs_inbox_id IS NULL OR v_obs_inbox_id != NEW.id THEN
      RAISE EXCEPTION 'Invalid latest_observation_id: observation % belongs to inbox %, not %',
        NEW.latest_observation_id, v_obs_inbox_id, NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inbox_latest_observation_consistency ON public.ipo_ingestion_inbox;
CREATE TRIGGER trg_inbox_latest_observation_consistency
  BEFORE INSERT OR UPDATE OF latest_observation_id ON public.ipo_ingestion_inbox
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_validate_inbox_latest_observation();

-- ==============================================================================
-- 5. Atomic Observation Ingestion Function (Advisory Locked + Identity Validated)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.record_ipo_observation(
  p_inbox_id UUID,
  p_source VARCHAR(64),
  p_external_id VARCHAR(128),
  p_document_type VARCHAR(64),
  p_payload_hash VARCHAR(64),
  p_raw_payload JSONB,
  p_normalized_payload JSONB,
  p_provenance JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lock_key BIGINT;
  v_verified_inbox_id UUID;
  v_existing_inbox_id UUID;
  v_existing_obs_id UUID;
  v_next_version INTEGER;
  v_new_obs_id UUID;
BEGIN
  -- 1. Validate that the canonical inbox entity exists and acquire row lock
  SELECT id INTO v_verified_inbox_id
  FROM public.ipo_ingestion_inbox
  WHERE id = p_inbox_id
  FOR UPDATE;

  IF v_verified_inbox_id IS NULL THEN
    RAISE EXCEPTION 'Inbox record % does not exist', p_inbox_id;
  END IF;

  -- 2. Global Source-Identity Invariance Check (Hardening Requirement 1):
  -- Atomically register/verify binding in dedicated database table with PRIMARY KEY (source, external_id, document_type)
  INSERT INTO public.ipo_source_identity_bindings (source, external_id, document_type, inbox_id)
  VALUES (p_source, p_external_id, p_document_type, p_inbox_id)
  ON CONFLICT (source, external_id, document_type) DO NOTHING;

  SELECT inbox_id INTO v_existing_inbox_id
  FROM public.ipo_source_identity_bindings
  WHERE source = p_source
    AND external_id = p_external_id
    AND document_type = p_document_type;

  IF v_existing_inbox_id IS NOT NULL AND v_existing_inbox_id != p_inbox_id THEN
    RAISE EXCEPTION 'Identity collision: source identity (source: %, external_id: %, doc: %) is already bound to inbox %, cannot attach to %',
      p_source, p_external_id, p_document_type, v_existing_inbox_id, p_inbox_id;
  END IF;

  -- 3. Local Inbox Identity Consistency Check:
  -- Prevent binding a different external_id from the same source to this inbox entity
  IF EXISTS (
    SELECT 1 FROM public.ipo_source_identity_bindings
    WHERE inbox_id = p_inbox_id
      AND source = p_source
      AND external_id != p_external_id
  ) THEN
    RAISE EXCEPTION 'Identity mismatch: inbox % is already bound to external_id % for source %, cannot bind %',
      p_inbox_id,
      (SELECT external_id FROM public.ipo_source_identity_bindings WHERE inbox_id = p_inbox_id AND source = p_source LIMIT 1),
      p_source,
      p_external_id;
  END IF;

  -- 4. Deterministic Advisory Transaction Lock on the version key (source:external_id:document_type)
  v_lock_key := hashtext(p_source || ':' || p_external_id || ':' || p_document_type);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- 5. Deduplication check: Discard if identical payload hash already exists
  SELECT id INTO v_existing_obs_id
  FROM public.ipo_ingestion_observations
  WHERE source = p_source
    AND external_id = p_external_id
    AND document_type = p_document_type
    AND payload_hash = p_payload_hash
  ORDER BY observation_version DESC
  LIMIT 1;

  IF v_existing_obs_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'duplicate_ignored',
      'observation_id', v_existing_obs_id,
      'is_duplicate', true
    );
  END IF;

  -- 6. Atomically compute the next sequential version under lock protection
  SELECT COALESCE(MAX(observation_version), 0) + 1 INTO v_next_version
  FROM public.ipo_ingestion_observations
  WHERE source = p_source
    AND external_id = p_external_id
    AND document_type = p_document_type;

  -- 7. Insert the immutable observation
  INSERT INTO public.ipo_ingestion_observations (
    inbox_id,
    source,
    external_id,
    document_type,
    observation_version,
    payload_hash,
    raw_payload,
    normalized_payload,
    provenance
  ) VALUES (
    p_inbox_id,
    p_source,
    p_external_id,
    p_document_type,
    v_next_version,
    p_payload_hash,
    p_raw_payload,
    p_normalized_payload,
    p_provenance
  )
  RETURNING id INTO v_new_obs_id;

  -- 8. Atomically update the canonical inbox entity pointer
  UPDATE public.ipo_ingestion_inbox
  SET latest_observation_id = v_new_obs_id,
      updated_at = NOW()
  WHERE id = p_inbox_id;

  RETURN jsonb_build_object(
    'status', 'observation_recorded',
    'observation_id', v_new_obs_id,
    'version', v_next_version,
    'is_duplicate', false
  );
END;
$$;

-- Restrict execution strictly to service_role (internal infrastructure only)
REVOKE ALL ON FUNCTION public.record_ipo_observation FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_ipo_observation FROM authenticated;
REVOKE ALL ON FUNCTION public.record_ipo_observation FROM anon;
GRANT EXECUTE ON FUNCTION public.record_ipo_observation TO service_role;

-- ==============================================================================
-- 6. Hardened Raw Payload Pruning Function (Supabase Role-Verified)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.prune_expired_observation_raw_payloads()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT := current_setting('request.jwt.claim.role', true);
  v_pruned_count INTEGER;
BEGIN
  -- Strict Supabase service_role check
  IF v_role != 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized: Only service_role may execute observation payload pruning';
  END IF;

  -- Set transaction-local authorized pruning token (resets automatically at transaction end)
  PERFORM set_config('app.pruning_authorized', 'true', true);

  UPDATE public.ipo_ingestion_observations
  SET raw_payload = NULL
  WHERE raw_payload IS NOT NULL
    AND raw_payload_expires_at <= NOW();
    
  GET DIAGNOSTICS v_pruned_count = ROW_COUNT;

  -- Fail-closed cleanup (Hardening Requirement 2): explicitly clear authorization token immediately after pruning
  PERFORM set_config('app.pruning_authorized', 'false', true);

  RETURN v_pruned_count;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_expired_observation_raw_payloads() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prune_expired_observation_raw_payloads() FROM authenticated;
REVOKE ALL ON FUNCTION public.prune_expired_observation_raw_payloads() FROM anon;
GRANT EXECUTE ON FUNCTION public.prune_expired_observation_raw_payloads() TO service_role;

-- ==============================================================================
-- 7. Row-Level Security Policies
-- ==============================================================================
ALTER TABLE public.ipo_ingestion_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ipo_ingestion_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ipo_source_identity_bindings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins have full access to ipo_ingestion_inbox" ON public.ipo_ingestion_inbox;
CREATE POLICY "Admins have full access to ipo_ingestion_inbox"
  ON public.ipo_ingestion_inbox FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin') AND p.is_suspended = FALSE
    )
  );

DROP POLICY IF EXISTS "Admins have full access to ipo_ingestion_observations" ON public.ipo_ingestion_observations;
CREATE POLICY "Admins have full access to ipo_ingestion_observations"
  ON public.ipo_ingestion_observations FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin') AND p.is_suspended = FALSE
    )
  );

DROP POLICY IF EXISTS "Admins have full access to ipo_source_identity_bindings" ON public.ipo_source_identity_bindings;
CREATE POLICY "Admins have full access to ipo_source_identity_bindings"
  ON public.ipo_source_identity_bindings FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin') AND p.is_suspended = FALSE
    )
  );
