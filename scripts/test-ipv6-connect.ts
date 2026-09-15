import pg from 'pg';

async function testDirect() {
  const passwords = [
    'Kruti98.',
    'postgres',
  ];

  for (const pw of passwords) {
    console.log('Testing direct IPv6 with password length:', pw.length);
    const client = new pg.Client({
      host: '2406:da1c:10e4:6400:789d:d117:aee3:4335',
      port: 5432,
      user: 'postgres',
      password: pw,
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    });

    try {
      await client.connect();
      console.log('🎉 DIRECT IPV6 POSTGRES CONNECTED SUCCESSFULLY!');
      const res = await client.query('SELECT current_database(), version();');
      console.log('Database:', res.rows[0]);
      await client.end();
      return pw;
    } catch (e: any) {
      console.log('Failed:', e.message);
      try { await client.end(); } catch {}
    }
  }
}

testDirect().catch(console.error);
