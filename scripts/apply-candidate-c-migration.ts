import fs from 'fs';
import path from 'path';
import pg from 'pg';

async function applyCandidateCMigration() {
  const migrationPath = path.resolve(__dirname, '../supabase/migrations/20260920000032_candidate_c_settlement_engine.sql');
  const sql = fs.readFileSync(migrationPath, 'utf-8');

  const hosts = [
    'postgresql://postgres:Kruti98.@db.cfhbyanfptwkucqkiegs.supabase.co:5432/postgres',
    'postgresql://postgres.cfhbyanfptwkucqkiegs:Kruti98.@aws-0-ap-south-1.pooler.supabase.com:6543/postgres',
    'postgresql://postgres.cfhbyanfptwkucqkiegs:Kruti98.@aws-0-ap-south-1.pooler.supabase.com:5432/postgres',
  ];

  let client: pg.Client | null = null;
  for (const connectionString of hosts) {
    try {
      console.log(`Connecting to: ${connectionString.split('@')[1]}...`);
      client = new pg.Client({
        connectionString,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000,
      });
      await client.connect();
      console.log('Connected successfully!');
      break;
    } catch (err: any) {
      console.log(`Failed with ${connectionString.split('@')[1]}: ${err.message}`);
      client = null;
    }
  }

  if (!client) {
    throw new Error('Could not connect to any Supabase endpoint.');
  }

  console.log('Executing Migration 32 (Candidate C: Settlement Engine & Ledger)...');
  await client.query(sql);
  console.log('✅ Migration 32 applied successfully!');

  // Verify that ipo_application_settlements table exists
  const res = await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'ipo_application_settlements'
    ORDER BY ordinal_position;
  `);

  console.log(`Verified ipo_application_settlements: found ${res.rows.length} columns.`);
  for (const row of res.rows) {
    console.log(` - ${row.column_name}: ${row.data_type} (${row.is_nullable === 'YES' ? 'nullable' : 'NOT NULL'})`);
  }

  await client.end();
}

applyCandidateCMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
