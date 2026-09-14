import pg from 'pg';

const regions = [
  'ap-south-1',
  'ap-southeast-1',
  'ap-northeast-1',
  'eu-central-1',
  'eu-west-1',
  'us-east-1',
  'us-west-1',
];

async function check() {
  for (const r of regions) {
    const host = `aws-0-${r}.pooler.supabase.com`;
    console.log('Testing host:', host);
    const client = new pg.Client({
      host,
      port: 6543,
      user: 'postgres.cfhbyanfptwkucqkiegs',
      password: 'PASSWORD_PLACEHOLDER',
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    });
    try {
      await client.connect();
      console.log('🎉 SUCCESS on region:', r);
      await client.query('SELECT 1;');
      await client.end();
      return host;
    } catch (e: any) {
      console.log(`Failed on ${r}:`, e.message);
      try { await client.end(); } catch {}
    }
  }
}

check();
