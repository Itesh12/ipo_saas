import pg from 'pg';

async function testDirect() {
  const connectionString = 'postgresql://postgres:Kruti98.@db.cfhbyanfptwkucqkiegs.supabase.co:5432/postgres';
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    console.log('Connecting to direct Supabase db...');
    await client.connect();
    console.log('Connected! Executing test query...');
    const res = await client.query('SELECT current_database(), current_user;');
    console.log('Result:', res.rows);
    await client.end();
  } catch (err: unknown) {
    console.error('Direct connection failed:', err);
  }
}

testDirect();
