-- ==============================================================================
-- PHASE 10 / STAGE 4: REGISTRAR ALLOTMENT VERIFICATION GATEWAY
-- Migration: 20260916000024_phase10_stage4_registrar_allotment.sql
-- ==============================================================================

-- 1. Custom Enums
DO $$ BEGIN
  CREATE TYPE public.registrar_verification_mode AS ENUM (
    'automated_api',
    'user_assisted',
    'cas_statement_upload',
    'bank_mandate_evidence',
    'manual_admin_entry'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.evidence_source_type AS ENUM (
    'REGISTRAR_DIRECT',
    'REGISTRAR_USER_ASSISTED',
    'CAS_DOCUMENT',
    'DEPOSITORY_STATEMENT',
    'BANK_NOTIFICATION',
    'USER_SCREENSHOT',
    'USER_ENTERED',
    'ADMIN_ENTERED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.verification_evidence_classification AS ENUM (
    'REGISTRAR_CONFIRMED',
    'DEPOSITORY_CONFIRMED',
    'BANK_CONFIRMED',
    'USER_PROVIDED',
    'MANUAL_ADMIN',
    'CONFLICTED',
    'UNVERIFIED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.verification_attempt_status AS ENUM (
    'completed',
    'record_not_found',
    'challenge_required',
    'portal_unavailable',
    'parse_error',
    'network_error'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.verification_result_type AS ENUM (
    'allotted',
    'partially_allotted',
    'not_allotted',
    'unknown'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Deterministic Issue Bindings Table
-- Eliminates loose company-name string matching by mapping IPOs to registrar-internal issue IDs
CREATE TABLE IF NOT EXISTS public.ipo_registrar_issue_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ipo_id UUID NOT NULL REFERENCES public.ipos(id) ON DELETE RESTRICT,
  registrar_code VARCHAR(50) NOT NULL,
  registrar_issue_id VARCHAR(100) NOT NULL, -- e.g. LinkIntime '1042', KFin 'KFIN_TATA_TECH'
  company_name_at_source VARCHAR(255) NOT NULL,
  source_portal_url TEXT NOT NULL,
  lookup_parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_registrar_issue UNIQUE(registrar_code, registrar_issue_id),
  CONSTRAINT uq_ipo_registrar UNIQUE(ipo_id, registrar_code)
);

CREATE INDEX IF NOT EXISTS idx_issue_bindings_ipo ON public.ipo_registrar_issue_bindings(ipo_id);
CREATE INDEX IF NOT EXISTS idx_issue_bindings_reg_code ON public.ipo_registrar_issue_bindings(registrar_code);

-- 3. Dynamic Registrar Capability Configuration Table
CREATE TABLE IF NOT EXISTS public.ipo_registrar_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registrar_code VARCHAR(50) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  supports_pan_lookup BOOLEAN NOT NULL DEFAULT true,
  supports_application_no_lookup BOOLEAN NOT NULL DEFAULT true,
  supports_dp_client_id_lookup BOOLEAN NOT NULL DEFAULT true,
  is_headless_api_available BOOLEAN NOT NULL DEFAULT false,
  requires_interactive_challenge BOOLEAN NOT NULL DEFAULT true,
  terms_access_status VARCHAR(50) NOT NULL DEFAULT 'verified',
  source_url TEXT NOT NULL,
  last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed initial capability configs
INSERT INTO public.ipo_registrar_capabilities (
  registrar_code, display_name, supports_pan_lookup, supports_application_no_lookup,
  supports_dp_client_id_lookup, is_headless_api_available, requires_interactive_challenge,
  terms_access_status, source_url
) VALUES
  ('link_intime', 'Link Intime India Private Limited', true, true, true, false, true, 'verified', 'https://linkintime.co.in/initial_offer/public-issues.html'),
  ('kfintech', 'KFin Technologies Limited', true, true, true, false, true, 'verified', 'https://kosmic.kfintech.com/ipostatus/'),
  ('bigshare', 'Bigshare Services Private Limited', true, true, true, false, true, 'verified', 'https://ipo.bigshareonline.com/'),
  ('cameo', 'Cameo Corporate Services Limited', true, false, true, false, true, 'verified', 'https://cameoindia.com/'),
  ('mas', 'MAS Services Limited', true, true, false, false, true, 'verified', 'https://masserv.com/')
ON CONFLICT (registrar_code) DO UPDATE SET
  updated_at = NOW();

-- 4. Immutable Verification Attempts (Audit Ledger)
-- Every outbound check or user-assisted submission creates an immutable record
CREATE TABLE IF NOT EXISTS public.ipo_allotment_verification_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.ipo_applications(id) ON DELETE RESTRICT,
  applicant_id UUID NOT NULL REFERENCES public.applicant_profiles(id) ON DELETE RESTRICT,
  ipo_id UUID NOT NULL REFERENCES public.ipos(id) ON DELETE RESTRICT,
  registrar_code VARCHAR(50) NOT NULL,
  registrar_binding_id UUID REFERENCES public.ipo_registrar_issue_bindings(id) ON DELETE RESTRICT,
  
  attempt_number INTEGER NOT NULL DEFAULT 1,
  verification_mode public.registrar_verification_mode NOT NULL,
  attempt_status public.verification_attempt_status NOT NULL,
  verification_result public.verification_result_type NOT NULL DEFAULT 'unknown',
  
  lookup_type VARCHAR(30) NOT NULL, -- 'pan', 'application_no', 'dp_client_id'
  lookup_identifier_masked VARCHAR(60) NOT NULL,
  lookup_identifier_hash VARCHAR(64) NOT NULL, -- SHA-256 for deterministic matching
  
  -- Sanitized Normalized Domain Facts (NO RAW PII)
  normalized_result JSONB DEFAULT NULL,
  raw_response_hash VARCHAR(64) NOT NULL,
  raw_response_retention VARCHAR(20) NOT NULL DEFAULT 'none',
  
  evidence_source_type public.evidence_source_type NOT NULL,
  evidence_classification public.verification_evidence_classification NOT NULL DEFAULT 'UNVERIFIED',
  
  -- Freshness and Observation Timestamps
  source_observed_at TIMESTAMPTZ, -- Timestamp on registrar result / statement
  verified_at TIMESTAMPTZ,        -- When our gateway verified it
  
  idempotency_key VARCHAR(128) NOT NULL,
  error_code VARCHAR(50),
  error_message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Hard Invariant: record_not_found must NEVER have verification_result = 'not_allotted'
  CONSTRAINT chk_record_not_found_unknown CHECK (
    attempt_status != 'record_not_found' OR (verification_result = 'unknown' AND evidence_classification = 'UNVERIFIED')
  )
);

CREATE INDEX IF NOT EXISTS idx_verification_attempts_app ON public.ipo_allotment_verification_attempts(application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_verification_attempts_ipo ON public.ipo_allotment_verification_attempts(ipo_id);
CREATE INDEX IF NOT EXISTS idx_verification_attempts_idemp ON public.ipo_allotment_verification_attempts(idempotency_key);

-- 5. Current State Projection (Application Allotment Verification Status)
-- Single point of read for current application allotment verification state
CREATE TABLE IF NOT EXISTS public.ipo_application_allotment_projections (
  application_id UUID PRIMARY KEY REFERENCES public.ipo_applications(id) ON DELETE RESTRICT,
  applicant_id UUID NOT NULL REFERENCES public.applicant_profiles(id) ON DELETE RESTRICT,
  ipo_id UUID NOT NULL REFERENCES public.ipos(id) ON DELETE RESTRICT,
  
  evidence_classification public.verification_evidence_classification NOT NULL DEFAULT 'UNVERIFIED',
  last_verified_attempt_id UUID REFERENCES public.ipo_allotment_verification_attempts(id) ON DELETE RESTRICT,
  
  -- Verified Allotment Facts (Ledger & financial state belong solely to Phase 5)
  shares_applied INTEGER NOT NULL CHECK (shares_applied >= 0),
  shares_allotted INTEGER NOT NULL DEFAULT 0 CHECK (shares_allotted >= 0),
  lots_allotted INTEGER NOT NULL DEFAULT 0 CHECK (lots_allotted >= 0),
  allotment_price NUMERIC(14,2) CHECK (allotment_price IS NULL OR allotment_price >= 0),
  reported_refund_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (reported_refund_amount >= 0),
  
  has_conflict BOOLEAN NOT NULL DEFAULT false,
  conflict_details TEXT,
  
  source_observed_at TIMESTAMPTZ,
  first_verified_at TIMESTAMPTZ,
  last_verified_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Hard Domain Invariant: shares_allotted must never exceed shares_applied
  CONSTRAINT chk_shares_allotted_le_applied CHECK (shares_allotted <= shares_applied)
);

CREATE INDEX IF NOT EXISTS idx_projections_applicant ON public.ipo_application_allotment_projections(applicant_id);
CREATE INDEX IF NOT EXISTS idx_projections_ipo ON public.ipo_application_allotment_projections(ipo_id);
CREATE INDEX IF NOT EXISTS idx_projections_classification ON public.ipo_application_allotment_projections(evidence_classification);

-- 6. In-Flight Verification Concurrency Locks Table
-- Short-lived 30-second locks to prevent concurrent duplicate verification jobs
CREATE TABLE IF NOT EXISTS public.ipo_allotment_verification_locks (
  idempotency_key VARCHAR(128) PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES public.ipo_applications(id) ON DELETE RESTRICT,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 seconds')
);

-- 7. Row Level Security (RLS) Policies
ALTER TABLE public.ipo_registrar_issue_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ipo_registrar_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ipo_allotment_verification_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ipo_application_allotment_projections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ipo_allotment_verification_locks ENABLE ROW LEVEL SECURITY;

-- Bindings & Capabilities: Readable by public/authenticated
CREATE POLICY "Public read issue bindings"
  ON public.ipo_registrar_issue_bindings FOR SELECT
  USING (true);

CREATE POLICY "Public read registrar capabilities"
  ON public.ipo_registrar_capabilities FOR SELECT
  USING (true);

-- Attempts: User can read attempts for their own applications
CREATE POLICY "Users read own verification attempts"
  ON public.ipo_allotment_verification_attempts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.ipo_applications a
      WHERE a.id = ipo_allotment_verification_attempts.application_id
        AND a.user_id = auth.uid()
    )
  );

-- Projections: User can read projections for their own applications
CREATE POLICY "Users read own allotment projections"
  ON public.ipo_application_allotment_projections FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.ipo_applications a
      WHERE a.id = ipo_application_allotment_projections.application_id
        AND a.user_id = auth.uid()
    )
  );

-- Admins: Full access across all Stage 4 tables
CREATE POLICY "Admins manage issue bindings"
  ON public.ipo_registrar_issue_bindings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admins manage registrar capabilities"
  ON public.ipo_registrar_capabilities FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admins manage verification attempts"
  ON public.ipo_allotment_verification_attempts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admins manage allotment projections"
  ON public.ipo_application_allotment_projections FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admins manage verification locks"
  ON public.ipo_allotment_verification_locks FOR ALL
  USING (true);
