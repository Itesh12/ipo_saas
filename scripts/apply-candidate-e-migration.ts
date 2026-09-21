import fs from 'fs';
import path from 'path';
import pg from 'pg';

// Parse .env.local if present
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

async function applyCandidateEMigration() {
  const migrationPath = path.resolve(__dirname, '../supabase/migrations/20260928000034_candidate_e_realized_pnl_engine.sql');
  const sql = fs.readFileSync(migrationPath, 'utf-8');

  const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL or DIRECT_URL environment variable is required.');
  }

  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  await client.connect();
  console.log('Executing Migration 34 (Candidate E: Realized P&L, Exit & Trading Lifecycle Engine)...');
  await client.query(sql);
  console.log('✅ Migration 34 applied successfully!');
  await client.end();
}

applyCandidateEMigration().catch((err) => {
  console.error(err);
  process.exit(1);
});
