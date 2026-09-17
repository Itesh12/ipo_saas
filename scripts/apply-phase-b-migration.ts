import fs from 'fs';
import path from 'path';
import pg from 'pg';

async function applyPhaseBMigration() {
  const migrationPath = path.resolve(__dirname, '../supabase/migrations/20260917000027_phase_b_provenance_contracts.sql');
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

  console.log('Executing Migration 27 (Phase B: Safe Provenance Contracts)...');
  await client.query(sql);
  console.log('✅ Migration 27 applied successfully!');

  // Verify that the provenance columns exist and have NULL defaults for existing records
  const targetTables = [
    'ipo_business_profiles',
    'ipo_financials',
    'ipo_valuations',
    'ipo_peers',
    'ipo_promoters',
    'ipo_strengths',
    'ipo_risks'
  ];

  for (const tbl of targetTables) {
    const res = await client.query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = $1 AND column_name IN (
        'source_observation_id', 'source_type', 'verification_state', 'confidence_level', 'is_unofficial', 'parser_version', 'observed_at'
      )
      ORDER BY column_name;
    `, [tbl]);

    console.log(`Table ${tbl}: found ${res.rows.length} provenance columns.`);
    if (res.rows.length !== 7) {
      console.error(`Warning: Expected 7 columns in ${tbl}, found ${res.rows.length}`);
    }
  }

  await client.end();
}

applyPhaseBMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
