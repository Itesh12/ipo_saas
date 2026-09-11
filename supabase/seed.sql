-- ==============================================================================
-- IPO SaaS Platform (IPO OS) — Isolated Development Seed Data
-- CAUTION: Development and test environments only.
-- ==============================================================================

-- Sample Mainboard IPO currently Open
INSERT INTO public.ipos (
    id, slug, company_name, symbol, category, issue_type, status, publication_status,
    price_band_low, price_band_high, face_value, lot_size, min_investment,
    issue_size_cr, fresh_issue_cr, ofs_cr, retail_quota_pct, exchange,
    announcement_date, open_date, close_date, allotment_date, refund_date, listing_date,
    about_company, published_at
) VALUES (
    'a1111111-1111-1111-1111-111111111111',
    'premier-energies-limited',
    'Premier Energies Limited',
    'PREMIERENE',
    'mainboard',
    'book_building',
    'open',
    'published',
    427.00,
    450.00,
    1.00,
    33,
    14850.00,
    2830.40,
    1291.40,
    1539.00,
    35.00,
    'NSE, BSE',
    '2026-08-20',
    CURRENT_DATE - INTERVAL '1 day',
    CURRENT_DATE + INTERVAL '1 day',
    CURRENT_DATE + INTERVAL '3 days',
    CURRENT_DATE + INTERVAL '4 days',
    CURRENT_DATE + INTERVAL '6 days',
    'Premier Energies Limited is a leading integrated solar cell and solar module manufacturing company based in India with over two decades of operating track record.',
    NOW()
) ON CONFLICT (slug) DO NOTHING;

-- Sample Mainboard IPO Upcoming
INSERT INTO public.ipos (
    id, slug, company_name, symbol, category, issue_type, status, publication_status,
    price_band_low, price_band_high, face_value, lot_size, min_investment,
    issue_size_cr, fresh_issue_cr, ofs_cr, retail_quota_pct, exchange,
    announcement_date, open_date, close_date, allotment_date, refund_date, listing_date,
    about_company, published_at
) VALUES (
    'b2222222-2222-2222-2222-222222222222',
    'bajaj-housing-finance-limited',
    'Bajaj Housing Finance Limited',
    'BAJAJHFL',
    'mainboard',
    'book_building',
    'upcoming',
    'published',
    66.00,
    70.00,
    10.00,
    214,
    14980.00,
    6560.00,
    3560.00,
    3000.00,
    35.00,
    'NSE, BSE',
    '2026-08-28',
    CURRENT_DATE + INTERVAL '5 days',
    CURRENT_DATE + INTERVAL '8 days',
    CURRENT_DATE + INTERVAL '10 days',
    CURRENT_DATE + INTERVAL '11 days',
    CURRENT_DATE + INTERVAL '14 days',
    'Bajaj Housing Finance Limited is a non-deposit taking Housing Finance Company (HFC) offering finance to individuals as well as corporate entities for purchase and renovation of homes.',
    NOW()
) ON CONFLICT (slug) DO NOTHING;

-- Sample SME NSE IPO Currently Listed
INSERT INTO public.ipos (
    id, slug, company_name, symbol, category, issue_type, status, publication_status,
    price_band_low, price_band_high, face_value, lot_size, min_investment,
    issue_size_cr, fresh_issue_cr, ofs_cr, retail_quota_pct, exchange,
    announcement_date, open_date, close_date, allotment_date, refund_date, listing_date,
    listing_price, about_company, published_at
) VALUES (
    'c3333333-3333-3333-3333-333333333333',
    'paramount-specialty-forgings-limited',
    'Paramount Speciality Forgings Limited',
    'PARAMOUNT',
    'sme_nse',
    'book_building',
    'listed',
    'published',
    57.00,
    59.00,
    10.00,
    2000,
    118000.00,
    32.34,
    32.34,
    0.00,
    35.00,
    'NSE SME (Emerge)',
    '2026-07-15',
    CURRENT_DATE - INTERVAL '30 days',
    CURRENT_DATE - INTERVAL '27 days',
    CURRENT_DATE - INTERVAL '25 days',
    CURRENT_DATE - INTERVAL '24 days',
    CURRENT_DATE - INTERVAL '20 days',
    68.00,
    'Paramount Speciality Forgings is a manufacturer of forged products offering closed die forgings and forged rings for petrochemical, oil & gas and heavy engineering sectors.',
    NOW()
) ON CONFLICT (slug) DO NOTHING;

-- Sample Draft IPO (Admin only visibility test)
INSERT INTO public.ipos (
    id, slug, company_name, symbol, category, issue_type, status, publication_status,
    price_band_low, price_band_high, face_value, lot_size, min_investment,
    issue_size_cr, fresh_issue_cr, ofs_cr, retail_quota_pct, exchange,
    announcement_date, open_date, close_date,
    about_company
) VALUES (
    'd4444444-4444-4444-4444-444444444444',
    'draft-fintech-technologies-limited',
    'Draft Fintech Technologies Limited',
    'DFINTECH',
    'mainboard',
    'book_building',
    'announced',
    'draft',
    120.00,
    125.00,
    2.00,
    100,
    12500.00,
    850.00,
    500.00,
    350.00,
    35.00,
    'NSE, BSE',
    CURRENT_DATE - INTERVAL '5 days',
    CURRENT_DATE + INTERVAL '20 days',
    CURRENT_DATE + INTERVAL '23 days',
    'Internal draft record for regulatory filing review. Not visible to public investors.'
) ON CONFLICT (slug) DO NOTHING;

-- ==============================================================================
-- Phase 3: Research Seed Fixtures for Premier Energies & Bajaj Housing Finance
-- ==============================================================================

-- 1. Business Profiles
INSERT INTO public.ipo_business_profiles (
    ipo_id, company_overview, industry, business_model, products_services,
    competitive_strengths, geographic_presence, key_customers, source
) VALUES (
    'a1111111-1111-1111-1111-111111111111',
    'Premier Energies is an integrated manufacturer of solar photovoltaic (PV) cells and solar modules with over 29 years of operations. The company operates five manufacturing units located in Hyderabad, Telangana.',
    'Renewable Energy / Solar Manufacturing',
    'B2B equipment manufacturing and EPC services for IPPs, rooftop solar developers, and government utilities.',
    ARRAY['Bifacial Solar Modules', 'Monocrystalline Solar Cells', 'Polycrystalline Modules', 'EPC Project Execution'],
    ARRAY['Top 2 solar cell producer in India', 'State-of-the-art TOPCon cell lines', 'Robust order book of ₹5,900+ Cr', 'Long-standing global customer relationships'],
    'Exports to North America and Europe, alongside extensive pan-India utility installations.',
    'Tata Power Solar, NTPC, Sterling & Wilson, Vikram Solar',
    'RHP Filing (SEBI)'
) ON CONFLICT (ipo_id) DO NOTHING;

-- 2. Multi-Year Financials (Premier Energies)
INSERT INTO public.ipo_financials (
    ipo_id, financial_year, period_type, statement_type, audit_status,
    revenue_cr, revenue_growth_pct, ebitda_cr, ebitda_margin_pct, pat_cr, pat_margin_pct,
    eps, roe_pct, roce_pct, total_debt_cr, net_worth_cr, operating_cash_flow_cr, source
) VALUES 
(
    'a1111111-1111-1111-1111-111111111111', 'FY22', 'full_year', 'consolidated', 'restated',
    1442.10, 18.5, 96.40, 6.68, 14.30, 0.99, 0.42, 3.20, 5.80, 480.20, 446.50, 112.40, 'RHP Statement II'
),
(
    'a1111111-1111-1111-1111-111111111111', 'FY23', 'full_year', 'consolidated', 'restated',
    1463.20, 1.46, 122.50, 8.37, 37.40, 2.56, 1.05, 7.80, 9.40, 420.10, 484.20, 154.60, 'RHP Statement II'
),
(
    'a1111111-1111-1111-1111-111111111111', 'FY24', 'full_year', 'consolidated', 'restated',
    3143.80, 114.85, 528.20, 16.80, 231.40, 7.36, 6.42, 28.50, 31.20, 310.40, 812.30, 428.10, 'RHP Statement II'
)
ON CONFLICT (ipo_id, financial_year, statement_type) DO NOTHING;

-- 3. Valuation (Premier Energies)
INSERT INTO public.ipo_valuations (
    ipo_id, pe_ratio_low, pe_ratio_high, pb_ratio, ev_ebitda,
    market_cap_cr, post_issue_shares_cr, eps_diluted, industry_pe_median,
    valuation_summary, source
) VALUES (
    'a1111111-1111-1111-1111-111111111111',
    66.5, 70.1, 5.54, 38.2,
    20280.00, 45.0667, 6.42, 85.4,
    'Priced at ~70x FY24 P/E, representing a moderate discount to listed peer median P/E of 85.4x in the solar equipment sector.',
    'RHP / Platform Calculations'
) ON CONFLICT (ipo_id) DO NOTHING;

-- 4. Peers (Premier Energies)
INSERT INTO public.ipo_peers (
    ipo_id, peer_company_name, peer_symbol, market_cap_cr, revenue_cr, pat_cr,
    eps, pe_ratio, pb_ratio, roe_pct, roce_pct, debt_to_equity, source
) VALUES 
(
    'a1111111-1111-1111-1111-111111111111',
    'Websol Energy System Ltd', 'WEBELSOLAR', 6240.00, 584.20, 42.10, 9.80, 112.4, 8.2, 14.5, 16.2, 0.45, 'NSE Exchange'
),
(
    'a1111111-1111-1111-1111-111111111111',
    'Tata Power Solar Systems', 'TATAPOWER', 134200.00, 56000.00, 3800.00, 11.90, 35.6, 3.8, 12.8, 14.1, 1.20, 'NSE Exchange'
)
ON CONFLICT DO NOTHING;

-- 5. Promoters (Premier Energies)
INSERT INTO public.ipo_promoters (
    ipo_id, promoter_name, holding_pre_pct, holding_post_pct, designation, bio, source
) VALUES 
(
    'a1111111-1111-1111-1111-111111111111',
    'Surender Pal Singh Saluja', 48.20, 38.50, 'Chairman & Whole-time Director',
    'Over 3 decades of entrepreneurial leadership in renewable power systems.', 'RHP Capital Structure'
),
(
    'a1111111-1111-1111-1111-111111111111',
    'Chiranjeev Singh Saluja', 24.10, 19.20, 'Managing Director',
    'Oversees manufacturing, capacity expansion, and institutional business.', 'RHP Capital Structure'
)
ON CONFLICT DO NOTHING;

-- 6. Strengths & Risks (Premier Energies)
INSERT INTO public.ipo_strengths (
    ipo_id, title, description, category, display_order, source
) VALUES 
(
    'a1111111-1111-1111-1111-111111111111',
    'Integrated Cell-to-Module Manufacturing',
    'One of the few Indian manufacturers with substantial backward integration into TOPCon solar cell production.',
    'Operational Moat', 1, 'RHP Review'
),
(
    'a1111111-1111-1111-1111-111111111111',
    'Massive Order Book Visibility',
    'Confirmed order book exceeding ₹5,900 Crores provides solid revenue visibility for the next 18–24 months.',
    'Commercial', 2, 'RHP Review'
)
ON CONFLICT DO NOTHING;

INSERT INTO public.ipo_risks (
    ipo_id, title, description, severity, category, display_order, source
) VALUES 
(
    'a1111111-1111-1111-1111-111111111111',
    'Raw Material & Wafer Import Dependency',
    'Heavy reliance on imports of silicon wafers from overseas suppliers exposes the company to supply chain bottlenecks.',
    'high', 'Supply Chain', 1, 'RHP Risk Factors'
),
(
    'a1111111-1111-1111-1111-111111111111',
    'Tariff Policy & ALMM Regulations',
    'Any changes in Approved List of Models and Manufacturers (ALMM) or custom duty waivers could impact margins.',
    'medium', 'Regulatory', 2, 'RHP Risk Factors'
)
ON CONFLICT DO NOTHING;

-- 7. GMP Entries (Premier Energies)
INSERT INTO public.ipo_gmp_entries (
    ipo_id, gmp_value, gmp_percentage, estimated_listing_price, estimated_listing_gain_pct,
    confidence_level, observed_at, source
) VALUES 
(
    'a1111111-1111-1111-1111-111111111111',
    410.00, 91.11, 860.00, 91.11, 'verified', NOW() - INTERVAL '4 hours', 'Market Intelligence (Unofficial)'
),
(
    'a1111111-1111-1111-1111-111111111111',
    385.00, 85.55, 835.00, 85.55, 'verified', NOW() - INTERVAL '1 day', 'Market Intelligence (Unofficial)'
),
(
    'a1111111-1111-1111-1111-111111111111',
    320.00, 71.11, 770.00, 71.11, 'verified', NOW() - INTERVAL '2 days', 'Market Intelligence (Unofficial)'
)
ON CONFLICT DO NOTHING;

-- 8. Subscription Snapshots (Premier Energies)
INSERT INTO public.ipo_subscription_snapshots (
    ipo_id, day_number, snapshot_date, qib_x, nii_x, retail_x, employee_x, overall_x, source
) VALUES 
(
    'a1111111-1111-1111-1111-111111111111',
    1, CURRENT_DATE - INTERVAL '1 day', 0.05, 5.60, 2.10, 3.40, 2.15, 'BSE / NSE Cumulative Feed'
),
(
    'a1111111-1111-1111-1111-111111111111',
    2, CURRENT_DATE, 4.20, 28.50, 6.80, 7.20, 11.40, 'BSE / NSE Cumulative Feed'
)
ON CONFLICT (ipo_id, day_number, snapshot_date) DO NOTHING;

-- 9. Regulatory Documents (Premier Energies)
INSERT INTO public.ipo_documents (
    ipo_id, title, document_type, file_url, is_public, source, published_at
) VALUES 
(
    'a1111111-1111-1111-1111-111111111111',
    'Red Herring Prospectus (RHP)', 'rhp',
    'https://www.sebi.gov.in/filings/public-issues/aug-2024/premier-energies-limited-rhp.pdf',
    TRUE, 'SEBI / Company Filing', NOW() - INTERVAL '10 days'
),
(
    'a1111111-1111-1111-1111-111111111111',
    'Investor Presentation & Roadshow Deck', 'presentation',
    'https://www.premierenergies.com/investor-presentation.pdf',
    TRUE, 'Company IR', NOW() - INTERVAL '5 days'
)
ON CONFLICT DO NOTHING;

-- 10. News (Premier Energies)
INSERT INTO public.ipo_news (
    ipo_id, headline, summary, source, source_url, sentiment, published_at
) VALUES 
(
    'a1111111-1111-1111-1111-111111111111',
    'Premier Energies IPO subscribed 11.4x on Day 2 led by robust NII demand',
    'Non-institutional and retail investors drove heavy bidding for the solar manufacturer issue with grey market sentiment surging over 90%.',
    'Financial Express', 'https://www.financialexpress.com/market/premier-energies-day-2',
    'positive', NOW() - INTERVAL '2 hours'
),
(
    'a1111111-1111-1111-1111-111111111111',
    'Premier Energies raises ₹846 Cr from Anchor Investors prior to issue opening',
    'Marquee global and domestic mutual funds including Nomura, Blackrock, and HDFC MF participated in the anchor book allocation.',
    'Economic Times', 'https://economictimes.indiatimes.com/market/premier-energies-anchor',
    'positive', NOW() - INTERVAL '2 days'
)
ON CONFLICT DO NOTHING;

-- ==============================================================================
-- 11. Phase 4: Sample Development Applicants & Applications
-- NOTE: For local development / testing only. Zero real credentials or PII.
-- ==============================================================================

DO $$
DECLARE
    v_user_id UUID;
BEGIN
    SELECT id INTO v_user_id FROM public.profiles LIMIT 1;
    IF v_user_id IS NOT NULL THEN
        INSERT INTO public.applicant_profiles (
            id, user_id, relationship, display_name, pan_masked, demat_dp_id_masked, demat_account_no_masked, upi_id_masked, default_category, notes, is_active
        ) VALUES 
        (
            'c1111111-1111-1111-1111-111111111111',
            v_user_id,
            'self',
            'Primary Demat (Self)',
            'ABCDE****F',
            'IN300***',
            '****1234',
            'ra***@okaxis',
            'retail',
            'Primary trading and IPO application account',
            TRUE
        ),
        (
            'c2222222-2222-2222-2222-222222222222',
            v_user_id,
            'father',
            'Father Account',
            'FGHIJ****K',
            '12081***',
            '****5678',
            'fa***@icici',
            'retail',
            'Family account used for secondary retail allotment quota',
            TRUE
        ),
        (
            'c3333333-3333-3333-3333-333333333333',
            v_user_id,
            'spouse',
            'Spouse Account',
            'LMNOP****Q',
            'IN302***',
            '****9012',
            'sp***@okhdfcbank',
            's_hni',
            'Used for high net worth and retail applications',
            TRUE
        )
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

