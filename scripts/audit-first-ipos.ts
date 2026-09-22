import fs from 'fs';
import { getPublishedIPOs, getIPOUniverseCounts } from '../features/ipo/services/ipoService';
import { getTodayIST } from '../features/ipo/services/ipoLifecycle';

async function auditFirstIpos() {
  const todayIST = getTodayIST();
  console.log(`Current Reference Date (IST): ${todayIST}`);

  // Test 1: All published IPOs (default order)
  const defaultResult = await getPublishedIPOs({ pageSize: 15, page: 1 });
  console.log(`\n=== 1. DEFAULT PUBLISHED IPOS (Page 1, pageSize 15) Total: ${defaultResult.totalCount} ===`);
  defaultResult.ipos.forEach((ipo, idx) => {
    console.log(`\n[${idx + 1}] ID: ${ipo.id} | Slug: ${ipo.slug} | Symbol: ${ipo.symbol}`);
    console.log(`     Company: "${ipo.company_name}"`);
    console.log(`     Status: Derived="${ipo.status}" | Raw DB Status="${(ipo as any).raw_status || 'N/A'}"`);
    console.log(`     Dates: Open=${ipo.open_date} | Close=${ipo.close_date} | Listing=${ipo.listing_date}`);
    console.log(`     Price: ₹${ipo.price_band_low} - ₹${ipo.price_band_high} | Lot: ${ipo.lot_size} | IssueSizeCr: ${ipo.issue_size_cr}`);
    console.log(`     Category: ${ipo.category} | Segment: ${(ipo as any).market_segment} | Exchange: ${ipo.exchange}`);
    console.log(`     Provenance:`, JSON.stringify(ipo.provenance));
  });

  // Test 2: Tab "current"
  const currentResult = await getPublishedIPOs({ status: 'current', pageSize: 10, page: 1 });
  console.log(`\n=== 2. TAB "CURRENT" IPOS Total: ${currentResult.totalCount} ===`);
  currentResult.ipos.forEach((ipo, idx) => {
    console.log(`[${idx + 1}] "${ipo.company_name}" (${ipo.symbol}) - Status: ${ipo.status} - Open: ${ipo.open_date} - Close: ${ipo.close_date} - Listing: ${ipo.listing_date} - Slug: ${ipo.slug}`);
  });

  // Test 3: Tab "upcoming"
  const upcomingResult = await getPublishedIPOs({ status: 'upcoming', pageSize: 10, page: 1 });
  console.log(`\n=== 3. TAB "UPCOMING" IPOS Total: ${upcomingResult.totalCount} ===`);
  upcomingResult.ipos.forEach((ipo, idx) => {
    console.log(`[${idx + 1}] "${ipo.company_name}" (${ipo.symbol}) - Status: ${ipo.status} - Open: ${ipo.open_date} - Close: ${ipo.close_date} - Listing: ${ipo.listing_date} - Slug: ${ipo.slug}`);
  });

  // Test 4: Tab "past"
  const pastResult = await getPublishedIPOs({ status: 'past', pageSize: 10, page: 1 });
  console.log(`\n=== 4. TAB "PAST" IPOS Total: ${pastResult.totalCount} ===`);
  pastResult.ipos.forEach((ipo, idx) => {
    console.log(`[${idx + 1}] "${ipo.company_name}" (${ipo.symbol}) - Status: ${ipo.status} - Open: ${ipo.open_date} - Close: ${ipo.close_date} - Listing: ${ipo.listing_date} - Slug: ${ipo.slug}`);
  });
}

auditFirstIpos().catch(console.error);
