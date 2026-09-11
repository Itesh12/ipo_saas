import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { IPOMilestoneEvaluator } from '@/features/notifications/services/evaluators/evaluateIPOMilestones';
import { GMPMovementEvaluator } from '@/features/notifications/services/evaluators/evaluateGMPMovements';
import { GovernanceRiskEvaluator } from '@/features/notifications/services/evaluators/evaluateGovernanceRisks';
import { SavedScreenEvaluator } from '@/features/notifications/services/evaluators/evaluateSavedScreens';
import { NotificationDispatcher } from '@/features/notifications/services/notificationDispatcher';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const secret = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const token = authHeader.replace(/^Bearer\s+/i, '');

    if (!secret || token !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const evaluatedCounts = {
      milestones: 0,
      gmp: 0,
      risks: 0,
      screens: 0,
    };

    // 1. Evaluate IPO Milestones
    const { data: publishedIpos } = await supabase
      .from('ipos')
      .select('id, slug, company_name, symbol, status, open_date, close_date, allotment_date, listing_date, price_band_low, price_band_high')
      .eq('publication_status', 'published');

    if (publishedIpos && publishedIpos.length > 0) {
      const candidates = publishedIpos.map((i) => ({
        id: i.id,
        slug: i.slug,
        companyName: i.company_name,
        symbol: i.symbol,
        status: i.status,
        openDate: i.open_date,
        closeDate: i.close_date,
        allotmentDate: i.allotment_date,
        listingDate: i.listing_date,
        priceBandLow: i.price_band_low ? Number(i.price_band_low) : null,
        priceBandHigh: i.price_band_high ? Number(i.price_band_high) : null,
      }));

      const milestoneEvents = IPOMilestoneEvaluator.evaluateCandidates(candidates);
      for (const ev of milestoneEvents) {
        const { wasIngested } = await NotificationDispatcher.ingestEvent(supabase, {
          eventType: ev.eventType,
          eventClass: ev.eventClass,
          idempotencyKey: ev.idempotencyKey,
          aggregateType: ev.aggregateType,
          aggregateId: ev.aggregateId,
          payload: ev.payload,
        });
        if (wasIngested) evaluatedCounts.milestones++;
      }
    }

    // 2. Evaluate GMP Movements
    const { data: recentGmp } = await supabase
      .from('ipo_gmp_entries')
      .select('id, ipo_id, gmp_value, gmp_percentage, estimated_listing_price, observed_at')
      .order('observed_at', { ascending: false })
      .limit(100);

    if (recentGmp && recentGmp.length > 0) {
      // Group by ipo_id
      const byIpo = new Map<string, typeof recentGmp>();
      for (const g of recentGmp) {
        const arr = byIpo.get(g.ipo_id) || [];
        arr.push(g);
        byIpo.set(g.ipo_id, arr);
      }

      for (const [, entries] of byIpo.entries()) {
        if (entries.length >= 2) {
          const latest = entries[0];
          const previous = entries[1];
          const result = GMPMovementEvaluator.evaluateMovement(
            {
              id: latest.id,
              ipoId: latest.ipo_id,
              gmpValue: Number(latest.gmp_value),
              gmpPercentage: latest.gmp_percentage ? Number(latest.gmp_percentage) : null,
              estimatedListingPrice: latest.estimated_listing_price ? Number(latest.estimated_listing_price) : null,
              observedAt: latest.observed_at,
            },
            {
              id: previous.id,
              ipoId: previous.ipo_id,
              gmpValue: Number(previous.gmp_value),
              gmpPercentage: previous.gmp_percentage ? Number(previous.gmp_percentage) : null,
              estimatedListingPrice: previous.estimated_listing_price ? Number(previous.estimated_listing_price) : null,
              observedAt: previous.observed_at,
            }
          );

          if (result.isSignificant && result.idempotencyKey && result.eventPayload) {
            const { wasIngested } = await NotificationDispatcher.ingestEvent(supabase, {
              eventType: 'gmp_significant_movement',
              eventClass: 'condition_driven',
              idempotencyKey: result.idempotencyKey,
              aggregateType: 'ipos',
              aggregateId: latest.ipo_id,
              payload: result.eventPayload,
            });
            if (wasIngested) evaluatedCounts.gmp++;
          }
        }
      }
    }

    // 3. Evaluate Governance Risks
    const { data: highRisks } = await supabase
      .from('ipo_risks')
      .select('id, ipo_id, title, description, severity, category')
      .eq('severity', 'high')
      .limit(50);

    if (highRisks && highRisks.length > 0) {
      const riskEvents = GovernanceRiskEvaluator.evaluateRisks(
        highRisks.map((r) => ({
          id: r.id,
          ipoId: r.ipo_id,
          title: r.title,
          description: r.description,
          severity: r.severity as 'high',
          category: r.category,
        }))
      );

      for (const ev of riskEvents) {
        const { wasIngested } = await NotificationDispatcher.ingestEvent(supabase, {
          eventType: ev.eventType,
          eventClass: ev.eventClass,
          idempotencyKey: ev.idempotencyKey,
          aggregateType: ev.aggregateType,
          aggregateId: ev.aggregateId,
          payload: ev.payload,
        });
        if (wasIngested) evaluatedCounts.risks++;
      }
    }

    // 4. Evaluate Saved Screens with persistent match state
    const { data: screens } = await supabase.from('saved_screens').select('id, user_id, name, filter_config');
    const { data: screenerUniverse } = await supabase.from('v_ipo_screener_universe').select('*');
    const { data: existingMatches } = await supabase.from('notification_screen_matches').select('screen_id, ipo_id');

    if (screens && screens.length > 0 && screenerUniverse && screenerUniverse.length > 0) {
      const knownSet = new Set((existingMatches || []).map((m) => `${m.screen_id}:${m.ipo_id}`));
      const { newMatches, matchPairsToPersist } = SavedScreenEvaluator.evaluateScreens({
        screens: screens.map((s) => ({
          id: s.id,
          userId: s.user_id,
          name: s.name,
          filterConfig: s.filter_config,
        })),
        candidates: screenerUniverse as unknown as Parameters<typeof SavedScreenEvaluator.evaluateScreens>[0]['candidates'],
        knownMatches: knownSet,
      });

      // Persist matches atomically
      if (matchPairsToPersist.length > 0) {
        await supabase
          .from('notification_screen_matches')
          .upsert(
            matchPairsToPersist.map((p) => ({ screen_id: p.screenId, ipo_id: p.ipoId })),
            { onConflict: 'screen_id,ipo_id' }
          );
      }

      for (const ev of newMatches) {
        const { wasIngested } = await NotificationDispatcher.ingestEvent(supabase, {
          eventType: ev.eventType,
          eventClass: ev.eventClass,
          idempotencyKey: ev.idempotencyKey,
          aggregateType: ev.aggregateType,
          aggregateId: ev.aggregateId,
          userId: ev.userId,
          payload: ev.payload,
        });
        if (wasIngested) evaluatedCounts.screens++;
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      evaluatedCounts,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
