import pg from 'pg';

async function testPort() {
  const configs = [
    { host: 'aws-0-ap-south-1.pooler.supabase.com', port: 5432, user: 'postgres.cfhbyanfptwkucqkiegs' },
    { host: 'aws-0-ap-south-1.pooler.supabase.com', port: 6543, user: 'postgres.cfhbyanfptwkucqkiegs' },
    { host: 'aws-0-ap-south-1.pooler.supabase.com', port: 5432, user: 'postgres' },
  ];

  for (const c of configs) {
    console.log('Testing', c);
    const client = new pg.Client({
      host: c.host,
      port: c.port,
      user: c.user,
      password: 'PASSWORD_PLACEHOLDER',
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 4000,
    });
    try {
      await client.connect();
      console.log('SUCCESS!', c);
      await client.end();
      return;
    } catch (e: any) {
      console.log('Error:', e.message);
      try { await client.end(); } catch {}
    }
  }
}

testPort();
