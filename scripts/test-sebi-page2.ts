import { SebiPublicIssuesExtractor } from '../features/external-integrations/adapters/sebiExtractor';

async function testHistoricalPagination() {
  const url = 'https://www.sebi.gov.in/sebiweb/home/HomeAction.do';
  const formData = new URLSearchParams({
    sid: '3',
    ssid: '15',
    smid: '11',
    nextValue: '1', // page 2
    next: 'n',
    search: '',
    fromDate: '',
    toDate: '',
  });

  console.log('Fetching SEBI historical batch (page 2) via POST...');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    body: formData.toString(),
  });

  const html = await res.text();
  console.log(`Response status: ${res.status}, body length: ${html.length}`);
  const items = SebiPublicIssuesExtractor.parseHtml(html);
  console.log(`Parsed ${items.length} historical records from official SEBI archive!`);
  for (let i = 0; i < Math.min(5, items.length); i++) {
    console.log(`  ${i + 1}. [${items[i].document_type}] ${items[i].normalized_payload.company_name}`);
  }
}

testHistoricalPagination().catch(console.error);
