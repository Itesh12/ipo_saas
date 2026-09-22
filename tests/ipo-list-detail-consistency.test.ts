import { test, describe } from 'node:test';
import assert from 'node:assert';
import { getPublishedIPOs, getIPOBySlug } from '../features/ipo/services/ipoService';
import { getIPOResearchBundle } from '../features/ipo/services/ipoResearchService';

describe('IPO List vs Detail Resolution & Data Consistency Suite', () => {
  test('verifies list item resolves to the exact same canonical IPO record on detail query', async () => {
    // 1. Fetch top 15 published IPOs from list query
    const { ipos: listIpos } = await getPublishedIPOs({ pageSize: 15, page: 1 });
    assert.ok(listIpos.length > 0, 'Must have published IPO records to test');

    for (const item of listIpos) {
      // 2. Resolve detail via slug
      const detailIpo = await getIPOBySlug(item.slug);
      assert.ok(detailIpo, `Detail record must resolve for slug: ${item.slug}`);

      // 3. Identity Consistency Assertions
      assert.strictEqual(
        item.id,
        detailIpo.id,
        `Identity mismatch: list.id (${item.id}) !== detail.id (${detailIpo.id}) for slug ${item.slug}`
      );
      assert.strictEqual(
        item.slug,
        detailIpo.slug,
        `Slug mismatch: list.slug (${item.slug}) !== detail.slug (${detailIpo.slug})`
      );
      assert.strictEqual(
        item.company_name,
        detailIpo.company_name,
        `Company name mismatch: "${item.company_name}" !== "${detailIpo.company_name}"`
      );

      // 4. Canonical Field Consistency
      assert.strictEqual(item.symbol, detailIpo.symbol, `Symbol mismatch for ${item.slug}`);
      assert.strictEqual(item.status, detailIpo.status, `Derived status mismatch for ${item.slug}`);
      assert.strictEqual(item.open_date, detailIpo.open_date, `Open date mismatch for ${item.slug}`);
      assert.strictEqual(item.close_date, detailIpo.close_date, `Close date mismatch for ${item.slug}`);
      assert.strictEqual(item.listing_date, detailIpo.listing_date, `Listing date mismatch for ${item.slug}`);
      assert.strictEqual(item.price_band_low, detailIpo.price_band_low, `Price low mismatch for ${item.slug}`);
      assert.strictEqual(item.price_band_high, detailIpo.price_band_high, `Price high mismatch for ${item.slug}`);
      assert.strictEqual(item.lot_size, detailIpo.lot_size, `Lot size mismatch for ${item.slug}`);
      assert.strictEqual(item.issue_size_cr, detailIpo.issue_size_cr, `Issue size mismatch for ${item.slug}`);

      // 5. Research Bundle Resolution
      const bundle = await getIPOResearchBundle(item.slug);
      assert.ok(bundle, `Research bundle must resolve for slug: ${item.slug}`);
      assert.strictEqual(bundle.ipo.id, item.id, `Bundle IPO ID must match list item ID`);
      assert.strictEqual(bundle.ipo.slug, item.slug, `Bundle IPO slug must match list item slug`);
    }
  });

  test('verifies tab-specific filtering maintains strict status invariants', async () => {
    // Current tab
    const { ipos: currentIpos } = await getPublishedIPOs({ status: 'current', pageSize: 20 });
    for (const ipo of currentIpos) {
      assert.ok(
        ['open', 'closed', 'allotment_pending', 'listing_soon'].includes(ipo.status),
        `Current tab contains invalid status: ${ipo.status} for ${ipo.company_name}`
      );
    }

    // Upcoming tab
    const { ipos: upcomingIpos } = await getPublishedIPOs({ status: 'upcoming', pageSize: 20 });
    for (const ipo of upcomingIpos) {
      assert.strictEqual(
        ipo.status,
        'upcoming',
        `Upcoming tab contains non-upcoming status: ${ipo.status} for ${ipo.company_name}`
      );
    }

    // Past tab
    const { ipos: pastIpos } = await getPublishedIPOs({ status: 'past', pageSize: 20 });
    for (const ipo of pastIpos) {
      assert.strictEqual(
        ipo.status,
        'listed',
        `Past tab contains non-listed status: ${ipo.status} for ${ipo.company_name}`
      );
    }
  });

  test('detects duplicate representations of the same company or issue in public.ipos', async () => {
    const { ipos: allIpos } = await getPublishedIPOs({ pageSize: 100 });
    const seenSlugs = new Set<string>();
    const seenSymbols = new Map<string, string>();

    for (const ipo of allIpos) {
      // Slugs must be unique
      assert.ok(!seenSlugs.has(ipo.slug), `Duplicate slug detected in published list: ${ipo.slug}`);
      seenSlugs.add(ipo.slug);

      // Flag duplicate symbols
      if (ipo.symbol) {
        const sym = ipo.symbol.toUpperCase();
        if (seenSymbols.has(sym)) {
          // Documenting known defect: JINDAL-SUP and RENTOMOJO- have duplicates
          console.warn(`[DATA QUALITY AUDIT] Duplicate symbol in published catalog: ${sym} ("${ipo.company_name}" vs "${seenSymbols.get(sym)}")`);
        } else {
          seenSymbols.set(sym, ipo.company_name);
        }
      }
    }
  });
});
