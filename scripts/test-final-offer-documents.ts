import { SebiSourceClient } from '../features/external-integrations/clients/sebiSourceClient';
import { SebiPublicIssuesExtractor } from '../features/external-integrations/adapters/sebiExtractor';

async function testFinalOfferDocuments() {
  const client = new SebiSourceClient();
  
  // smid=12 is official "Final Offer Documents filed with ROC" (Historical listed IPOs)
  const historicalUrl = 'https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=3&smid=12&ssid=15';
  console.log(`Querying official historical archive: ${historicalUrl}...`);
  
  const res = await client.fetchLiveFilings(historicalUrl);
  console.log(`HTTP Status: ${res.status}, body length: ${res.byteLength}`);
  
  const items = SebiPublicIssuesExtractor.parseHtml(res.html);
  console.log(`Parsed ${items.length} REAL HISTORICAL IPO RECORDS from official SEBI archive!`);
  for (let i = 0; i < Math.min(10, items.length); i++) {
    console.log(`  ${i + 1}. [${items[i].document_type}] ${items[i].normalized_payload.company_name} (URL: ${items[i].normalized_payload.prospectus_url || items[i].normalized_payload.rhp_url})`);
  }
}

testFinalOfferDocuments().catch(console.error);
