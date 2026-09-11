-- ==============================================================================
-- PHASE 6: ANALYTICS, SCREENER & INVESTOR INTELLIGENCE
-- Migration: 20260910000006_phase6_analytics.sql
-- ==============================================================================

-- 1. SAVED SCREENS TABLE
CREATE TABLE IF NOT EXISTS public.saved_screens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    filter_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    sort_by VARCHAR(50) NOT NULL DEFAULT 'overall_score',
    sort_direction VARCHAR(4) NOT NULL DEFAULT 'desc',
    selected_columns TEXT[] NOT NULL DEFAULT ARRAY['company_name', 'price_band', 'issue_size_cr', 'pe_ratio_high', 'overall_score', 'status'],
    is_pinned BOOLEAN NOT NULL DEFAULT false,
    is_public BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_user_screen_name UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_saved_screens_user ON public.saved_screens(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_screens_public ON public.saved_screens(is_public, is_pinned);

-- 2. INVESTOR PREFERENCES TABLE (Non-Advisory Analytical Preferences)
CREATE TABLE IF NOT EXISTS public.investor_preferences (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    preferred_categories VARCHAR(20)[] DEFAULT ARRAY['mainboard'],
    preferred_sectors TEXT[] DEFAULT '{}',
    max_lot_investment NUMERIC(14,2),
    min_ipo_score NUMERIC(5,2) DEFAULT 60.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. COMPOSITE INDEXES ON UNDERLYING TABLES FOR SCREENER PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_ipos_pub_status ON public.ipos(publication_status, status);
CREATE INDEX IF NOT EXISTS idx_ipos_status_dates ON public.ipos(status, open_date, close_date);
CREATE INDEX IF NOT EXISTS idx_ipos_category_issue ON public.ipos(category, issue_type);
CREATE INDEX IF NOT EXISTS idx_ipo_valuations_pe_high ON public.ipo_valuations(pe_ratio_high);
CREATE INDEX IF NOT EXISTS idx_ipo_scores_overall_score ON public.ipo_scores(overall_score DESC);
CREATE INDEX IF NOT EXISTS idx_ipo_business_industry ON public.ipo_business_profiles(industry);

-- 4. NORMAL POSTGRESQL VIEW: v_ipo_screener_universe
-- Uses security_invoker = true and hardcoded publication_status = 'published'
-- Performance is driven by indexed source tables; materialization deferred pending EXPLAIN ANALYZE
CREATE OR REPLACE VIEW public.v_ipo_screener_universe 
WITH (security_invoker = true) AS
SELECT 
    i.id,
    i.slug,
    i.company_name,
    i.symbol,
    i.category,
    i.issue_type,
    i.status,
    i.price_band_low,
    i.price_band_high,
    i.lot_size,
    i.min_investment,
    i.issue_size_cr,
    i.fresh_issue_cr,
    i.ofs_cr,
    i.open_date,
    i.close_date,
    i.allotment_date,
    i.listing_date,
    v.pe_ratio_high,
    v.pb_ratio,
    v.ev_ebitda,
    v.industry_pe_median,
    f.financial_year AS latest_financial_year,
    f.revenue_cr AS latest_revenue_cr,
    f.revenue_growth_pct AS latest_revenue_growth_pct,
    f.pat_margin_pct AS latest_pat_margin_pct,
    f.roe_pct AS latest_roe_pct,
    f.roce_pct AS latest_roce_pct,
    f.total_debt_cr AS latest_total_debt_cr,
    f.net_worth_cr AS latest_net_worth_cr,
    s.overall_score,
    s.financial_health_score,
    s.valuation_score,
    s.subscription_demand_score,
    s.market_sentiment_score,
    s.is_insufficient_data,
    bp.industry,
    (SELECT gmp_value FROM public.ipo_gmp_entries WHERE ipo_id = i.id ORDER BY observed_at DESC LIMIT 1) AS latest_gmp_value,
    (SELECT estimated_listing_gain_pct FROM public.ipo_gmp_entries WHERE ipo_id = i.id ORDER BY observed_at DESC LIMIT 1) AS latest_gmp_gain_pct,
    (SELECT overall_x FROM public.ipo_subscription_snapshots WHERE ipo_id = i.id ORDER BY day_number DESC LIMIT 1) AS latest_subscription_x,
    (SELECT retail_x FROM public.ipo_subscription_snapshots WHERE ipo_id = i.id ORDER BY day_number DESC LIMIT 1) AS latest_retail_sub_x,
    (SELECT qib_x FROM public.ipo_subscription_snapshots WHERE ipo_id = i.id ORDER BY day_number DESC LIMIT 1) AS latest_qib_sub_x,
    (SELECT COUNT(*) FROM public.ipo_risks WHERE ipo_id = i.id AND severity = 'high') AS high_risk_count,
    GREATEST(i.updated_at, s.updated_at, v.updated_at) AS last_intelligence_update
FROM public.ipos i
LEFT JOIN public.ipo_valuations v ON v.ipo_id = i.id
LEFT JOIN LATERAL (
    SELECT * FROM public.ipo_financials 
    WHERE ipo_id = i.id 
    ORDER BY financial_year DESC 
    LIMIT 1
) f ON true
LEFT JOIN public.ipo_scores s ON s.ipo_id = i.id
LEFT JOIN public.ipo_business_profiles bp ON bp.ipo_id = i.id
WHERE i.publication_status = 'published';

-- 5. ROW LEVEL SECURITY POLICIES
ALTER TABLE public.saved_screens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investor_preferences ENABLE ROW LEVEL SECURITY;

-- A. saved_screens RLS Policies
DROP POLICY IF EXISTS "saved_screens_select_policy" ON public.saved_screens;
CREATE POLICY "saved_screens_select_policy" ON public.saved_screens
    FOR SELECT
    USING (user_id = auth.uid() OR is_public = true);

DROP POLICY IF EXISTS "saved_screens_insert_policy" ON public.saved_screens;
CREATE POLICY "saved_screens_insert_policy" ON public.saved_screens
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "saved_screens_update_policy" ON public.saved_screens;
CREATE POLICY "saved_screens_update_policy" ON public.saved_screens
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "saved_screens_delete_policy" ON public.saved_screens;
CREATE POLICY "saved_screens_delete_policy" ON public.saved_screens
    FOR DELETE
    USING (user_id = auth.uid());

-- B. investor_preferences RLS Policies
DROP POLICY IF EXISTS "investor_preferences_select_policy" ON public.investor_preferences;
CREATE POLICY "investor_preferences_select_policy" ON public.investor_preferences
    FOR SELECT
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "investor_preferences_insert_policy" ON public.investor_preferences;
CREATE POLICY "investor_preferences_insert_policy" ON public.investor_preferences
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "investor_preferences_update_policy" ON public.investor_preferences;
CREATE POLICY "investor_preferences_update_policy" ON public.investor_preferences
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
