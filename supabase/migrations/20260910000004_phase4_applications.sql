-- ==============================================================================
-- PHASE 4: USER IPO APPLICATIONS, APPLICANTS & ALLOTMENT ORCHESTRATION
-- Migration: 20260910000004_phase4_applications.sql
-- ==============================================================================

-- 1. Custom PostgreSQL Enums
CREATE TYPE applicant_relationship AS ENUM (
  'self',
  'father',
  'mother',
  'spouse',
  'son',
  'daughter',
  'brother',
  'sister',
  'friend',
  'other'
);

CREATE TYPE investor_category AS ENUM (
  'retail',
  's_hni',
  'b_hni',
  'employee',
  'shareholder'
);

CREATE TYPE application_status AS ENUM (
  'draft',
  'applied',
  'mandate_pending',
  'mandate_approved',
  'funds_blocked',
  'bidding_closed',
  'allotment_pending',
  'allotted',
  'partially_allotted',
  'not_allotted',
  'refund_pending',
  'refund_completed',
  'funds_unblocked',
  'completed',
  'cancelled'
);

CREATE TYPE mandate_status AS ENUM (
  'not_required',
  'created',
  'pending',
  'approved',
  'rejected',
  'expired',
  'cancelled',
  'blocked',
  'unblocked'
);

CREATE TYPE allotment_status AS ENUM (
  'pending',
  'allotted',
  'partially_allotted',
  'not_allotted'
);

CREATE TYPE application_event_type AS ENUM (
  'application_created',
  'bid_added',
  'bid_updated',
  'mandate_pending',
  'mandate_requested',
  'mandate_approved',
  'mandate_rejected',
  'funds_blocked',
  'bidding_closed',
  'allotment_pending',
  'allotment_processed',
  'allotted',
  'partially_allotted',
  'not_allotted',
  'refund_pending',
  'refund_completed',
  'funds_unblocked',
  'completed',
  'cancelled'
);

-- 2. Applicant Profiles (Family & Friends accounts per user)
CREATE TABLE IF NOT EXISTS applicant_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  relationship applicant_relationship NOT NULL DEFAULT 'self',
  display_name TEXT NOT NULL,
  pan_masked VARCHAR(20) NOT NULL, -- e.g. ABCDE****F
  demat_dp_id_masked VARCHAR(30),   -- e.g. IN300*** or ****1234
  demat_account_no_masked VARCHAR(30),
  upi_id_masked VARCHAR(100),       -- e.g. it***@okaxis
  default_category investor_category NOT NULL DEFAULT 'retail',
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_applicant_profiles_user ON applicant_profiles(user_id);
CREATE INDEX idx_applicant_profiles_active ON applicant_profiles(user_id, is_active);

-- 3. IPO Applications (Aggregate parent record)
CREATE TABLE IF NOT EXISTS ipo_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ipo_id UUID NOT NULL REFERENCES ipos(id) ON DELETE RESTRICT,
  applicant_id UUID NOT NULL REFERENCES applicant_profiles(id) ON DELETE RESTRICT,
  application_number VARCHAR(60) NOT NULL,
  investor_category investor_category NOT NULL DEFAULT 'retail',
  status application_status NOT NULL DEFAULT 'applied',
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_lots INTEGER NOT NULL CHECK (total_lots > 0),
  total_quantity INTEGER NOT NULL CHECK (total_quantity > 0),
  bid_price NUMERIC(14,2) NOT NULL CHECK (bid_price > 0),
  is_cutoff BOOLEAN NOT NULL DEFAULT true,
  application_amount NUMERIC(14,2) NOT NULL CHECK (application_amount >= 0),
  mandate_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (mandate_amount >= 0),
  blocked_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (blocked_amount >= 0),
  allotment_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (allotment_amount >= 0),
  refund_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (refund_amount >= 0),
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial Unique Index: Prevents duplicate active applications for the same applicant, IPO, and category,
-- while cleanly permitting re-application after terminal cancellation or completion.
CREATE UNIQUE INDEX idx_active_applicant_ipo_category
ON ipo_applications (applicant_id, ipo_id, investor_category)
WHERE status NOT IN ('cancelled', 'completed');

CREATE INDEX idx_ipo_applications_user ON ipo_applications(user_id);
CREATE INDEX idx_ipo_applications_ipo ON ipo_applications(ipo_id);
CREATE INDEX idx_ipo_applications_applicant ON ipo_applications(applicant_id);
CREATE INDEX idx_ipo_applications_status ON ipo_applications(status);
CREATE INDEX idx_ipo_applications_applied_at ON ipo_applications(applied_at DESC);

-- 4. Application Bids (Source-of-truth entries for multi-bid book-building)
CREATE TABLE IF NOT EXISTS ipo_application_bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES ipo_applications(id) ON DELETE CASCADE,
  bid_number SMALLINT NOT NULL CHECK (bid_number BETWEEN 1 AND 3),
  lot_count INTEGER NOT NULL CHECK (lot_count > 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price NUMERIC(14,2) NOT NULL CHECK (price > 0),
  is_cutoff BOOLEAN NOT NULL DEFAULT false,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(application_id, bid_number)
);

CREATE INDEX idx_application_bids_app ON ipo_application_bids(application_id);

-- 5. Application Mandates (UPI mandate orchestration & status tracking)
CREATE TABLE IF NOT EXISTS ipo_application_mandates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES ipo_applications(id) ON DELETE CASCADE UNIQUE,
  provider VARCHAR(60) NOT NULL DEFAULT 'BHIM_UPI',
  provider_reference VARCHAR(100),
  upi_id_masked VARCHAR(100),
  mandate_status mandate_status NOT NULL DEFAULT 'created',
  requested_amount NUMERIC(14,2) NOT NULL CHECK (requested_amount >= 0),
  blocked_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (blocked_amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  unblocked_at TIMESTAMPTZ,
  expiry_at TIMESTAMPTZ,
  failure_reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_application_mandates_app ON ipo_application_mandates(application_id);
CREATE INDEX idx_application_mandates_status ON ipo_application_mandates(mandate_status);

-- 6. Application Allotments (Registrar allotment results & refund derivation)
CREATE TABLE IF NOT EXISTS ipo_application_allotments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES ipo_applications(id) ON DELETE CASCADE UNIQUE,
  allotment_status allotment_status NOT NULL DEFAULT 'pending',
  shares_applied INTEGER NOT NULL CHECK (shares_applied > 0),
  shares_allotted INTEGER NOT NULL DEFAULT 0 CHECK (shares_allotted >= 0),
  lots_applied INTEGER NOT NULL CHECK (lots_applied > 0),
  lots_allotted INTEGER NOT NULL DEFAULT 0 CHECK (lots_allotted >= 0),
  allotment_price NUMERIC(14,2) CHECK (allotment_price > 0),
  allotment_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (allotment_amount >= 0),
  refund_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (refund_amount >= 0),
  basis_of_allotment_ref VARCHAR(100),
  processed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_application_allotments_app ON ipo_application_allotments(application_id);

-- 7. Application Events (Immutable audit log and timeline history)
CREATE TABLE IF NOT EXISTS ipo_application_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES ipo_applications(id) ON DELETE CASCADE,
  event_type application_event_type NOT NULL,
  description TEXT NOT NULL,
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_application_events_app ON ipo_application_events(application_id, created_at ASC);

-- 8. Watchlist Items (Private user watchlist)
CREATE TABLE IF NOT EXISTS watchlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ipo_id UUID NOT NULL REFERENCES ipos(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, ipo_id)
);

CREATE INDEX idx_watchlist_items_user ON watchlist_items(user_id);
CREATE INDEX idx_watchlist_items_ipo ON watchlist_items(ipo_id);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE applicant_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ipo_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE ipo_application_bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE ipo_application_mandates ENABLE ROW LEVEL SECURITY;
ALTER TABLE ipo_application_allotments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ipo_application_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist_items ENABLE ROW LEVEL SECURITY;

-- applicant_profiles RLS
CREATE POLICY "Users can manage their own applicants"
  ON applicant_profiles FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all applicants masked"
  ON applicant_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin')
    )
  );

-- ipo_applications RLS
CREATE POLICY "Users can manage their own applications"
  ON ipo_applications FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Staff can view all applications"
  ON ipo_applications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('analyst', 'editor', 'admin', 'super_admin')
    )
  );

CREATE POLICY "Staff can update application status"
  ON ipo_applications FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('editor', 'admin', 'super_admin')
    )
  );

-- ipo_application_bids RLS
CREATE POLICY "Users can view bids of their applications"
  ON ipo_application_bids FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM ipo_applications
      WHERE ipo_applications.id = ipo_application_bids.application_id
      AND ipo_applications.user_id = auth.uid()
    )
  );

-- ipo_application_mandates RLS
CREATE POLICY "Users can view mandates of their applications"
  ON ipo_application_mandates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ipo_applications
      WHERE ipo_applications.id = ipo_application_mandates.application_id
      AND ipo_applications.user_id = auth.uid()
    )
  );

CREATE POLICY "Staff can manage mandates"
  ON ipo_application_mandates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin', 'editor')
    )
  );

-- ipo_application_allotments RLS
CREATE POLICY "Users can view allotments of their applications"
  ON ipo_application_allotments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ipo_applications
      WHERE ipo_applications.id = ipo_application_allotments.application_id
      AND ipo_applications.user_id = auth.uid()
    )
  );

CREATE POLICY "Staff can manage allotments"
  ON ipo_application_allotments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin', 'editor')
    )
  );

-- ipo_application_events RLS
CREATE POLICY "Users can view events of their applications"
  ON ipo_application_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ipo_applications
      WHERE ipo_applications.id = ipo_application_events.application_id
      AND ipo_applications.user_id = auth.uid()
    )
  );

CREATE POLICY "Staff can view all application events"
  ON ipo_application_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('analyst', 'editor', 'admin', 'super_admin')
    )
  );

-- watchlist_items RLS
CREATE POLICY "Users can manage their own watchlist"
  ON watchlist_items FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
