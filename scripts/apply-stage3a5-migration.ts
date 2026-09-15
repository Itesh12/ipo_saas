import fs from 'fs';
import path from 'path';
import pg from 'pg';

async function applyMigration() {
  const migrationPath = path.resolve(__dirname, '../supabase/migrations/20260914000021_phase9_stage3a5_universe_reconstruction.sql');
  const sql = fs.readFileSync(migrationPath, 'utf-8');

  const hosts = [
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

  console.log('Executing Migration 21 (Universe Reconstruction Schema)...');
  await client.query(sql);
  console.log('✅ Migration 21 applied successfully!');

  // Verify columns on ipos table
  const res = await client.query(`
    SELECT column_name, is_nullable, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'ipos' AND column_name IN ('data_quality', 'instrument_type', 'field_truth_table', 'issue_identity', 'offering_year');
  `);
  console.log('Verification on ipos:');
  for (const row of res.rows) {
    console.log(`  - ${row.column_name}: is_nullable=${row.is_nullable}, type=${row.data_type}`);
  }

  // Verify ipo_rejection_audit table exists
  const resAudit = await client.query(`
    SELECT table_name FROM information_schema.tables WHERE table_name = 'ipo_rejection_audit';
  `);
  console.log('Verification ipo_rejection_audit exists:', resAudit.rows.length > 0);

  await client.end();
}

applyMigration().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
