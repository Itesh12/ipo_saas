import { SebiSourceClient } from '../features/external-integrations/clients/sebiSourceClient';

async function checkSearchFormNewsList() {
  const client = new SebiSourceClient();
  const res = await client.fetchLiveFilings();
  const idx = res.html.indexOf('function searchFormNewsList');
  if (idx !== -1) {
    console.log(res.html.slice(idx, idx + 600));
  } else {
    // Search for searchForm
    const matches = res.html.match(/searchFormNewsList[^}]*}/g);
    console.log('Matches:', matches);
  }
}

checkSearchFormNewsList().catch(console.error);
