-- ==============================================================================
-- CANDIDATE A: IPO APPLICATION & BIDDING WORKFLOW ENGINE
-- Migration 2 of 2: Schema Hardening, Indexes & Idempotency Constraints
-- Migration: 20260918000029_candidate_a_bidding_engine.sql
-- ==============================================================================

-- 1. Add idempotency and concurrency controls to ipo_applications
ALTER TABLE ipo_applications
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128),
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS submission_source VARCHAR(30) NOT NULL DEFAULT 'web_portal',
  ADD COLUMN IF NOT EXISTS client_ip_hash VARCHAR(64);

-- 2. Idempotency unique constraint per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_ipo_applications_idempotency
  ON ipo_applications(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 3. Recreate active applicant IPO category index to include 'withdrawn' in non-active terminal statuses
DROP INDEX IF EXISTS idx_active_applicant_ipo_category;
CREATE UNIQUE INDEX idx_active_applicant_ipo_category
  ON ipo_applications (applicant_id, ipo_id, investor_category)
  WHERE status NOT IN ('cancelled', 'withdrawn', 'completed');

-- 4. Extend ipo_application_events for transition lineage and idempotency
ALTER TABLE ipo_application_events
  ADD COLUMN IF NOT EXISTS from_status VARCHAR(40),
  ADD COLUMN IF NOT EXISTS to_status VARCHAR(40),
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128);

-- 5. Query and timeline performance indexes
CREATE INDEX IF NOT EXISTS idx_ipo_applications_lookup_fast
  ON ipo_applications(applicant_id, ipo_id, investor_category, status);
CREATE INDEX IF NOT EXISTS idx_ipo_applications_user_applied
  ON ipo_applications(user_id, status, applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_ipo_application_events_timeline
  ON ipo_application_events(application_id, created_at ASC);
