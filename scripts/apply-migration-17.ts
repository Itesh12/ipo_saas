import fs from 'fs';
import path from 'path';
import pg from 'pg';

async function applyMigration() {
  const migrationPath = path.resolve(__dirname, '../supabase/migrations/20260914000017_phase9_stage3_canonical_promotion.sql');
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
  console.log('Connected! Executing Migration 17...');
  await client.query(sql);
  console.log('✅ Migration 17 applied successfully!');
  await client.end();
}

applyMigration().catch((err) => {
  console.error(err);
  process.exit(1);
});
