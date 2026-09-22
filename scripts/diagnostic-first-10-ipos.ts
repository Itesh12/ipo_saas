import fs from 'fs';
import { getPublishedIPOs, getIPOBySlug } from '../features/ipo/services/ipoService';
import { getIPOResearchBundle } from '../features/ipo/services/ipoResearchService';
import { getTodayIST } from '../features/ipo/services/ipoLifecycle';

async function main() {
  const todayIST = getTodayIST();
  console.log(`Current Reference Date (IST): ${todayIST}\n`);

  const { ipos, totalCount } = await getPublishedIPOs({ pageSize: 10, page: 1 });
  console.log(`Total Published IPOs in List Query: ${totalCount}`);
  console.log(`Top 10 IPOs returned by getPublishedIPOs():\n`);

  const rows: any[] = [];

  for (let i = 0; i < ipos.length; i++) {
    const listIpo = ipos[i];
    const detailIpo = await getIPOBySlug(listIpo.slug);
    const bundle = await getIPOResearchBundle(listIpo.slug);

    const prov = (listIpo.provenance || {}) as Record<string, any>;
    const provKeys = Object.keys(prov);
    const firstProvSource = provKeys.length > 0 ? (prov[provKeys[0]]?.source || 'unknown') : 'direct_db';
    const providerId = prov.issue_identity || prov.isin?.value || listIpo.symbol || listIpo.id;

    const idMatch = detailIpo ? listIpo.id === detailIpo.id : false;
    const slugMatch = detailIpo ? listIpo.slug === detailIpo.slug : false;
    const nameMatch = detailIpo ? listIpo.company_name === detailIpo.company_name : false;
    const statusMatch = detailIpo ? listIpo.status === detailIpo.status : false;
    const openMatch = detailIpo ? listIpo.open_date === detailIpo.open_date : false;
    const closeMatch = detailIpo ? listIpo.close_date === detailIpo.close_date : false;
    const priceMatch = detailIpo ? (listIpo.price_band_high === detailIpo.price_band_high && listIpo.price_band_low === detailIpo.price_band_low) : false;
    const lotMatch = detailIpo ? listIpo.lot_size === detailIpo.lot_size : false;

    rows.push({
      index: i + 1,
      name: listIpo.company_name,
      dbId: listIpo.id,
      slug: listIpo.slug,
      providerId: providerId,
      symbol: listIpo.symbol,
      open: listIpo.open_date,
      close: listIpo.close_date,
      listing: listIpo.listing_date,
      status: listIpo.status,
      source: firstProvSource,
      updated: (listIpo as any).updated_at || 'N/A',
      priceBand: `${listIpo.price_band_low ?? 'null'} - ${listIpo.price_band_high ?? 'null'}`,
      lotSize: listIpo.lot_size,
      issueSizeCr: listIpo.issue_size_cr,
      // Checks
      detailFound: !!detailIpo,
      idMatch,
      slugMatch,
      nameMatch,
      statusMatch,
      openMatch,
      closeMatch,
      priceMatch,
      lotMatch,
      hasBusinessProfile: !!bundle?.businessProfile,
      financialsCount: bundle?.financials?.length ?? 0,
      hasValuation: !!bundle?.valuation,
      gmpCount: bundle?.gmpHistory?.length ?? 0,
      subCount: bundle?.subscriptionSnapshots?.length ?? 0,
    });
  }

  console.table(rows.map(r => ({
    '#': r.index,
    'Company': r.name.slice(0, 25),
    'DB ID': r.dbId.slice(0, 8),
    'Slug': r.slug.slice(0, 20),
    'Open': r.open ?? 'null',
    'Close': r.close ?? 'null',
    'Status': r.status,
    'Price': r.priceBand,
    'Lot': r.lotSize,
    'IssueCr': r.issueSizeCr,
    'Match': r.idMatch ? '✅' : '❌',
    'BizProf': r.hasBusinessProfile ? 'YES' : 'NO',
    'FinRows': r.financialsCount,
    'GMP': r.gmpCount,
    'Sub': r.subCount
  })));

  console.log('\n--- DETAILED INSPECTION FOR TOP 10 ---');
  for (const r of rows) {
    console.log(`\n[${r.index}] ${r.name}`);
    console.log(`    DB ID: ${r.dbId}`);
    console.log(`    Slug: ${r.slug} | Symbol: ${r.symbol} | Provider ID: ${r.providerId}`);
    console.log(`    Dates: Open=${r.open} | Close=${r.close} | Listing=${r.listing}`);
    console.log(`    Status: ${r.status}`);
    console.log(`    Pricing: ${r.priceBand} | Lot: ${r.lotSize} | IssueSizeCr: ${r.issueSizeCr}`);
    console.log(`    Source: ${r.source} | Updated: ${r.updated}`);
    console.log(`    Detail Match: id=${r.idMatch}, slug=${r.slugMatch}, name=${r.nameMatch}, status=${r.statusMatch}, price=${r.priceMatch}, lot=${r.lotMatch}`);
    console.log(`    Enrichment: BizProfile=${r.hasBusinessProfile}, Financials=${r.financialsCount}, Valuation=${r.hasValuation}, GMP=${r.gmpCount}, Subs=${r.subCount}`);
  }
}

main().catch(console.error);
