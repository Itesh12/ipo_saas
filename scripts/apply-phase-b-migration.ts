import fs from 'fs';
import path from 'path';
import pg from 'pg';

async function applyPhaseBMigration() {
  const migrationPath = path.resolve(__dirname, '../supabase/migrations/20260917000027_phase_b_provenance_contracts.sql');
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
  console.log('Executing Migration 27 (Phase B: Safe Provenance Contracts)...');
  await client.query(sql);
  console.log('✅ Migration 27 applied successfully!');
  await client.end();
}

applyPhaseBMigration().catch((err) => {
  console.error(err);
  process.exit(1);
});
