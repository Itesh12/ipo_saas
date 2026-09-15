import fs from 'fs';
import path from 'path';
import pg from 'pg';

async function applyMigration() {
  const migrationPath = path.resolve(__dirname, '../supabase/migrations/20260914000020_phase9_stage3a4_lot_size_nullable.sql');
  const sql = fs.readFileSync(migrationPath, 'utf-8');

  const connectionString = 'postgresql://postgres.cfhbyanfptwkucqkiegs:Kruti98.@aws-0-ap-south-1.pooler.supabase.com:6543/postgres';
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  console.log('Connecting to Supabase Postgres...');
  await client.connect();
  console.log('Connected! Executing Migration 20 (Stage 3A.4 Lot Size Nullable & Status)...');
  await client.query(sql);
  console.log('✅ Migration 20 applied successfully!');

  // Verify columns on ipos table
  const res = await client.query(`
    SELECT column_name, is_nullable, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'ipos' AND column_name IN ('lot_size', 'lot_size_status');
  `);
  console.log('Verification:');
  for (const row of res.rows) {
    console.log(`  - ${row.column_name}: is_nullable=${row.is_nullable}, type=${row.data_type}`);
  }

  await client.end();
}

applyMigration().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
