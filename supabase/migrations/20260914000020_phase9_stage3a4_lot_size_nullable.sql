-- ==============================================================================
-- Migration: 20260914000020_phase9_stage3a4_lot_size_nullable.sql
-- Description: Phase 9 Stage 3A.4 Lot Size Purity & Invariant Hardening (Correction 2)
-- Makes lot_size nullable so live exchange issues without ticker lot size
-- remain honest (lot_size = NULL, lot_size_status = 'pending_verification')
-- without violating database constraints or fabricating synthetic estimates.
-- ==============================================================================

-- 1. Drop NOT NULL constraint on lot_size in public.ipos
ALTER TABLE public.ipos ALTER COLUMN lot_size DROP NOT NULL;

-- 2. Update check constraint to allow NULL or positive integer
ALTER TABLE public.ipos DROP CONSTRAINT IF EXISTS ipos_lot_size_check;
ALTER TABLE public.ipos ADD CONSTRAINT ipos_lot_size_check CHECK (lot_size IS NULL OR lot_size > 0);

-- 3. Add lot_size_status column to track verification state
ALTER TABLE public.ipos ADD COLUMN IF NOT EXISTS lot_size_status VARCHAR(32) DEFAULT 'verified';
