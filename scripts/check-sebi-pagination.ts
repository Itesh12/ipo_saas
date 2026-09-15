import { SebiSourceClient } from '../features/external-integrations/clients/sebiSourceClient';
import { SebiPublicIssuesExtractor } from '../features/external-integrations/adapters/sebiExtractor';

async function checkSebiPage2() {
  const client = new SebiSourceClient();
  const res1 = await client.fetchLiveFilings('https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=3&smid=11&ssid=15');
  const items1 = SebiPublicIssuesExtractor.parseHtml(res1.html);
  console.log(`Page 1: parsed ${items1.length} filings. First: ${items1[0]?.normalized_payload.company_name}, Last: ${items1[items1.length - 1]?.normalized_payload.company_name}`);

  // Inspect form submission / pagination parameters on SEBI page
  const hasPagination = res1.html.includes('pagination') || res1.html.includes('pageNo') || res1.html.includes('next');
  console.log('HTML contains pagination terms:', hasPagination);

  // Find form actions or pagination links
  const matches = res1.html.match(/(?:href|action)=["']([^"']*(?:doListing|pageNo|pagination)[^"']*)["']/gi);
  console.log('Pagination matches in HTML:', matches?.slice(0, 10));
}

checkSebiPage2().catch(console.error);
