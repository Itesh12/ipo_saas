import { SebiSourceClient } from '../features/external-integrations/clients/sebiSourceClient';

async function checkPaginationDiv() {
  const client = new SebiSourceClient();
  const res = await client.fetchLiveFilings();
  const lines = res.html.split('\n');
  console.log(lines.slice(225, 255).join('\n'));
}

checkPaginationDiv().catch(console.error);
