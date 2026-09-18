import fs from 'fs';
import path from 'path';
import pg from 'pg';

async function applyMigration() {
  const migrationPath = path.resolve(__dirname, '../supabase/migrations/20260914000014_phase9_stage3_sync_runs.sql');
  const sql = fs.readFileSync(migrationPath, 'utf-8');

  const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL or DIRECT_URL environment variable is required.');
  }

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
  `);
  console.log('Columns created:', res.rows.map((r: any) => r.column_name));
  await client.end();
}

applyMigration().catch((err) => {
  console.error(err);
  process.exit(1);
});
