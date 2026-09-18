/**
 * app/api/admin/prices/route.ts
 *
 * Candidate D: Market Price Observation Ingestion API
 * Ingests quotes into market_price_observations and atomically projects
 * into security_prices if and only if monotonically newer.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { MarketPriceIngestionService } from '@/features/finance/services/marketPriceIngestionService';

async function verifyAdminAuth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Unauthorized: Authentication required.', status: 401 };
  }
  const adminClient = createAdminClient();
  const { data: profile } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || (profile.role !== 'admin' && profile.role !== 'super_admin')) {
    return { error: 'Forbidden: Administrator privileges required.', status: 403 };
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const authErr = await verifyAdminAuth();
    if (authErr) {
      return NextResponse.json({ error: authErr.error }, { status: authErr.status });
    }
    const admin = createAdminClient();

    // Query latest 50 market price observations
    const { data: observations, error: obsErr } = await admin
      .from('market_price_observations')
      .select(`
        id,
        security_id,
        price,
        day_open,
        day_high,
        day_low,
        previous_close,
        provider,
        raw_hash,
        is_verified,
        provider_timestamp,
        received_at,
        securities (
          symbol,
          exchange,
          company_name
        )
      `)
      .order('received_at', { ascending: false })
      .limit(50);

    if (obsErr) {
      return NextResponse.json({ error: obsErr.message }, { status: 500 });
    }

    // Query latest canonical security prices
    const { data: canonicalPrices } = await admin
      .from('security_prices')
      .select(`
        id,
        security_id,
        price,
        day_open,
        day_high,
        day_low,
        previous_close,
        source,
        provider_timestamp,
        captured_at,
        securities (
          symbol,
          exchange,
          listing_status
        )
      `)
      .order('provider_timestamp', { ascending: false })
      .limit(50);

    return NextResponse.json({
      observations: observations || [],
      canonicalPrices: canonicalPrices || [],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unauthorized' }, { status: err.status || 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authErr = await verifyAdminAuth();
    if (authErr) {
      return NextResponse.json({ error: authErr.error }, { status: authErr.status });
    }
    const body = await request.json();

    const {
      securityId,
      price,
      dayOpen,
      dayHigh,
      dayLow,
      previousClose,
      provider,
      providerTimestamp,
    } = body;

    if (!securityId || !price || !provider) {
      return NextResponse.json(
        { error: 'Missing required fields: securityId, price, provider' },
        { status: 400 }
      );
    }

    const result = await MarketPriceIngestionService.ingestObservation({
      securityId,
      price,
      dayOpen: dayOpen != null ? dayOpen : null,
      dayHigh: dayHigh != null ? dayHigh : null,
      dayLow: dayLow != null ? dayLow : null,
      previousClose: previousClose != null ? previousClose : null,
      provider,
      providerTimestamp: providerTimestamp || new Date().toISOString(),
    });

    return NextResponse.json({ success: true, result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
