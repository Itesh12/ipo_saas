import fs from 'fs';
import path from 'path';
import pg from 'pg';

async function applyMigration() {
  const migrationPath = path.resolve(__dirname, '../supabase/migrations/20260914000014_phase9_stage3_sync_runs.sql');
  const sql = fs.readFileSync(migrationPath, 'utf-8');

  const connectionString = 'postgresql://postgres.cfhbyanfptwkucqkiegs:Kruti98.@aws-0-ap-south-1.pooler.supabase.com:6543/postgres';
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  console.log('Connecting to Supabase Postgres...');
  await client.connect();
  console.log('Connected! Executing Migration 14...');
  await client.query(sql);
  console.log('✅ Migration 14 applied successfully!');

  // Verify table existence
  const res = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'ipo_source_sync_runs'
    ORDER BY ordinal_position;
  `);
  console.log(`Table ipo_source_sync_runs created with ${res.rows.length} columns:`);
  for (const r of res.rows) {
    console.log(` - ${r.column_name}: ${r.data_type}`);
  }

  await client.end();
}

applyMigration().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
