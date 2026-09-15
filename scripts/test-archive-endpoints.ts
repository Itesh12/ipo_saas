import { NseSourceClient } from '../features/external-integrations/clients/nseSourceClient';
import { SebiSourceClient } from '../features/external-integrations/clients/sebiSourceClient';

async function findWorkingEndpoints() {
  const nseClient = new NseSourceClient();
  const sebiClient = new SebiSourceClient();

  const nseCandidates = [
    'https://www.nseindia.com/api/public-issues',
    'https://www.nseindia.com/api/ipo-detail',
    'https://www.nseindia.com/api/equity-stockIndices?index=NIFTY%2050',
    'https://www.nseindia.com/api/marketStatus',
  ];

  for (const ep of nseCandidates) {
    try {
      const res = await nseClient.fetchLiveCurrentIssues(ep);
      console.log(`NSE [${ep}] -> Status ${res.status}, body length: ${res.byteLength}`);
    } catch (e: any) {
      console.log(`NSE [${ep}] -> FAILED: ${e.message}`);
    }
  }

  const sebiCandidates = [
    'https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=3&smid=11&ssid=15&pageNo=2',
    'https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=3&smid=11&ssid=15&year=2025',
    'https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=3&smid=35&ssid=0',
  ];

  for (const ep of sebiCandidates) {
    try {
      const res = await sebiClient.fetchLiveFilings(ep);
      console.log(`SEBI [${ep}] -> Status ${res.status}, body length: ${res.byteLength}`);
    } catch (e: any) {
      console.log(`SEBI [${ep}] -> FAILED: ${e.message}`);
    }
  }
}

findWorkingEndpoints().catch(console.error);
