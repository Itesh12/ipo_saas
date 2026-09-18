/**
 * app/api/admin/listings/route.ts
 *
 * Candidate D: Listing Management API
 * Records immutable listing events with SHA-256 payload verification.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ListingService } from '@/features/finance/services/listingService';

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

    // Query recent listing events
    const { data: events, error: evErr } = await admin
      .from('ipo_listing_events')
      .select(`
        id,
        ipo_id,
        security_id,
        exchange,
        event_type,
        listing_date,
        listing_price,
        issue_price,
        listing_gain,
        listing_gain_pct,
        source,
        source_record_id,
        payload_hash,
        idempotency_key,
        effective_at,
        created_at,
        ipos (
          company_name,
          symbol
        ),
        securities (
          symbol,
          listing_status
        )
      `)
      .order('effective_at', { ascending: false })
      .limit(50);

    if (evErr) {
      return NextResponse.json({ error: evErr.message }, { status: 500 });
    }

    // Query eligible IPOs for recording listing events
    const { data: ipos } = await admin
      .from('ipos')
      .select('id, company_name, symbol, price_band_high, listing_date, listing_price')
      .order('created_at', { ascending: false })
      .limit(30);

    // Query securities
    const { data: securities } = await admin
      .from('securities')
      .select('id, ipo_id, symbol, exchange, isin, listing_status, listing_price')
      .limit(50);

    return NextResponse.json({
      events: events || [],
      ipos: ipos || [],
      securities: securities || [],
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
      ipoId,
      securityId,
      exchange,
      eventType,
      listingDate,
      listingPrice,
      issuePrice,
      source,
      sourceRecordId,
      idempotencyKey,
    } = body;

    if (!ipoId || !securityId || !listingDate || !listingPrice || !issuePrice) {
      return NextResponse.json(
        { error: 'Missing required fields: ipoId, securityId, listingDate, listingPrice, issuePrice' },
        { status: 400 }
      );
    }

    const event = await ListingService.recordListingEvent({
      ipoId,
      securityId,
      exchange: exchange || 'NSE',
      eventType: eventType || 'LISTING_CONFIRMED',
      listingDate,
      listingPrice,
      issuePrice,
      source: source || 'MANUAL_ADMIN',
      sourceRecordId: sourceRecordId || null,
      idempotencyKey,
    });

    return NextResponse.json({ success: true, event });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
