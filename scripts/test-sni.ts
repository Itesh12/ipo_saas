import pg from 'pg';

async function testSni() {
  const variations = [
    // 1. User with brackets
    { host: 'aws-0-ap-south-1.pooler.supabase.com', port: 6543, user: 'postgres[cfhbyanfptwkucqkiegs]' },
    // 2. SNI servername
    { host: 'aws-0-ap-south-1.pooler.supabase.com', port: 6543, user: 'postgres.cfhbyanfptwkucqkiegs', sni: 'cfhbyanfptwkucqkiegs.pooler.supabase.com' },
    // 3. User with project ref prefix
    { host: 'aws-0-ap-south-1.pooler.supabase.com', port: 6543, user: 'cfhbyanfptwkucqkiegs.postgres' },
    // 4. Port 5432 with SNI
    { host: 'aws-0-ap-south-1.pooler.supabase.com', port: 5432, user: 'postgres', sni: 'cfhbyanfptwkucqkiegs.pooler.supabase.com' },
  ];

  for (const v of variations) {
    console.log('Testing', v.user, v.port, v.sni);
    const client = new pg.Client({
      host: v.host,
      port: v.port,
      user: v.user,
      password: 'PASSWORD_PLACEHOLDER',
      database: 'postgres',
      ssl: {
        rejectUnauthorized: false,
        servername: v.sni,
      },
      connectionTimeoutMillis: 5000,
    });
    try {
      await client.connect();
      console.log('🎉 SUCCESS!', v);
      await client.query('SELECT 1;');
      await client.end();
      return;
    } catch (e: any) {
      console.log('Error:', e.message);
      try { await client.end(); } catch {}
    }
  }
}

testSni();
