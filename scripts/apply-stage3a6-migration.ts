import fs from 'fs';
import path from 'path';
import pg from 'pg';

async function applyMigration() {
  const migrationPath = path.resolve(__dirname, '../supabase/migrations/20260914000022_phase9_stage3a6_universe_acquisition.sql');
  const sql = fs.readFileSync(migrationPath, 'utf-8');

  const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL or DIRECT_URL environment variable is required.');
  }

  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  await client.connect();
  console.log('Connected successfully!');
  await client.query(sql);
  console.log('✅ Migration applied successfully!');
  await client.end();
}

applyMigration().catch((err) => {
  console.error(err);
  process.exit(1);
});
