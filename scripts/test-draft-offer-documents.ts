import { SebiSourceClient } from '../features/external-integrations/clients/sebiSourceClient';
import { SebiPublicIssuesExtractor } from '../features/external-integrations/adapters/sebiExtractor';

async function testDraftOfferDocuments() {
  const client = new SebiSourceClient();
  
  // smid=10 is official "Draft Offer Documents filed with SEBI" (Announced / Pre-issue IPOs)
  const announcedUrl = 'https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=3&smid=10&ssid=15';
  console.log(`Querying official announced archive: ${announcedUrl}...`);
  
  const res = await client.fetchLiveFilings(announcedUrl);
  console.log(`HTTP Status: ${res.status}, body length: ${res.byteLength}`);
  
  const items = SebiPublicIssuesExtractor.parseHtml(res.html);
  console.log(`Parsed ${items.length} REAL ANNOUNCED IPO RECORDS from official SEBI archive!`);
  for (let i = 0; i < Math.min(10, items.length); i++) {
    console.log(`  ${i + 1}. [${items[i].document_type}] ${items[i].normalized_payload.company_name} (URL: ${items[i].normalized_payload.drhp_url})`);
  }
}

testDraftOfferDocuments().catch(console.error);
