import { NseSourceClient } from '../features/external-integrations/clients/nseSourceClient';
import { SebiSourceClient } from '../features/external-integrations/clients/sebiSourceClient';

async function testHistoricalEndpoints() {
  console.log('Testing official historical acquisition endpoints...');

  // 1. Test NSE past issues endpoint
  const nseClient = new NseSourceClient();
  const nsePastEndpoints = [
    'https://www.nseindia.com/api/ipo-past-issues',
    'https://www.nseindia.com/api/ipo-current-issue',
  ];

  for (const ep of nsePastEndpoints) {
    try {
      console.log(`Querying NSE endpoint: ${ep}...`);
      const res = await nseClient.fetchLiveCurrentIssues(ep);
      console.log(`NSE endpoint ${ep} SUCCESS: status=${res.status}, issues=${res.issues.length}`);
      if (res.issues.length > 0) {
        console.log('Sample issue:', res.issues[0]);
      }
    } catch (err: any) {
      console.log(`NSE endpoint ${ep} FAILED: ${err.message}`);
    }
  }

  // 2. Test SEBI public issues / historical offer documents
  const sebiClient = new SebiSourceClient();
  try {
    console.log('Querying SEBI live filings portal...');
    const res = await sebiClient.fetchLiveFilings();
    console.log(`SEBI portal SUCCESS: status=${res.status}, length=${res.byteLength}`);
  } catch (err: any) {
    console.log(`SEBI portal FAILED: ${err.message}`);
  }
}

testHistoricalEndpoints().catch(console.error);
