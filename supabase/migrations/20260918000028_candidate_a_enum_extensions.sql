-- ==============================================================================
-- CANDIDATE A: IPO APPLICATION & BIDDING WORKFLOW ENGINE
-- Migration 1 of 2: Enum Extensions (Must commit before enum values are referenced)
-- Migration: 20260918000028_candidate_a_enum_extensions.sql
-- ==============================================================================

-- 1. Extend application_status enum for Candidate A state machine
ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'submitted';
ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'mandate_failed';
ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'withdrawn';

-- 2. Extend application_event_type enum for granular audit logging
ALTER TYPE application_event_type ADD VALUE IF NOT EXISTS 'application_submitted';
ALTER TYPE application_event_type ADD VALUE IF NOT EXISTS 'bid_modified';
ALTER TYPE application_event_type ADD VALUE IF NOT EXISTS 'bid_cancelled';
ALTER TYPE application_event_type ADD VALUE IF NOT EXISTS 'mandate_failed';
ALTER TYPE application_event_type ADD VALUE IF NOT EXISTS 'application_withdrawn';
