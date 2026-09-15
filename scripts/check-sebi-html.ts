import { SebiSourceClient } from '../features/external-integrations/clients/sebiSourceClient';

async function checkSebiHtml() {
  const client = new SebiSourceClient();
  const res = await client.fetchLiveFilings();
  const lines = res.html.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('pagination') || lines[i].includes('page') || lines[i].includes('form') || lines[i].includes('next')) {
      console.log(`Line ${i}: ${lines[i].trim().slice(0, 120)}`);
    }
  }
}

checkSebiHtml().catch(console.error);
