-- ==============================================================================
-- MIGRATION: 20260928000036_ipo_data_remediation_batch_001.sql
-- PURPOSE: Phase 2.6B Controlled Existing Canonical IPO Data Remediation
-- BATCH ID: IPO-DATA-REMEDIATION-2026-09-21-001
-- ==============================================================================

-- 1. Remove bulk unverified defaults on quota columns
ALTER TABLE public.ipos ALTER COLUMN retail_quota_pct DROP DEFAULT;
ALTER TABLE public.ipos ALTER COLUMN qib_quota_pct DROP DEFAULT;
ALTER TABLE public.ipos ALTER COLUMN hni_quota_pct DROP DEFAULT;

COMMENT ON COLUMN public.ipos.retail_quota_pct IS 'Retail Investor Allocation Percentage (NULL if not authoritatively published in RHP/Offer Documents)';
COMMENT ON COLUMN public.ipos.qib_quota_pct IS 'Qualified Institutional Buyer Allocation Percentage (NULL if not authoritatively published in RHP/Offer Documents)';
COMMENT ON COLUMN public.ipos.hni_quota_pct IS 'Non-Institutional / HNI Allocation Percentage (NULL if not authoritatively published in RHP/Offer Documents)';

-- 2. Audit Trail Documentation
-- Data remediation updates are tracked in provenance->'remediation_history' with batch ID 'IPO-DATA-REMEDIATION-2026-09-21-001'
