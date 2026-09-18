import fs from 'fs';
import path from 'path';
import pg from 'pg';

async function applyCandidateCMigration() {
  const migrationPath = path.resolve(__dirname, '../supabase/migrations/20260920000032_candidate_c_settlement_engine.sql');
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
  console.log('Executing Migration 32 (Candidate C: Settlement Engine & Ledger)...');
  await client.query(sql);
  console.log('✅ Migration 32 applied successfully!');
  await client.end();
}

applyCandidateCMigration().catch((err) => {
  console.error(err);
  process.exit(1);
});
