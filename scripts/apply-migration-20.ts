import fs from 'fs';
import path from 'path';
import pg from 'pg';

async function applyMigration() {
  const migrationPath = path.resolve(__dirname, '../supabase/migrations/20260914000020_phase9_stage3a4_production_ipo_data.sql');
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
  console.log('Connected! Executing Migration 20...');
  await client.query(sql);
  console.log('✅ Migration 20 applied successfully!');
  await client.end();
}

applyMigration().catch((err) => {
  console.error(err);
  process.exit(1);
});
