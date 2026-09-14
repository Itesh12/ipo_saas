import fs from 'fs';
import path from 'path';
import pg from 'pg';

async function applyMigration() {
  const migrationPath = path.resolve(__dirname, '../supabase/migrations/20260914000017_phase9_stage3c_subscription.sql');
  const sql = fs.readFileSync(migrationPath, 'utf-8');

  const connectionString = 'postgresql://postgres.cfhbyanfptwkucqkiegs:Kruti98.@aws-0-ap-south-1.pooler.supabase.com:6543/postgres';
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  console.log('Connecting to Supabase Postgres...');
  await client.connect();
  console.log('Connected! Executing Migration 17 (Stage 3C Subscription & Allotment)...');
  await client.query(sql);
  console.log('✅ Migration 17 applied successfully!');

  // Verify created tables
  const tables = [
    'ipo_subscription_observations',
    'ipo_allotment_events',
    'ipo_allotment_facts',
    'ipo_registrar_portal_status',
    'ipo_allotment_estimates',
  ];

  for (const tbl of tables) {
    const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = $1
      ORDER BY ordinal_position;
    `, [tbl]);
    console.log(`Table ${tbl} created with ${res.rows.length} columns.`);
  }

  await client.end();
}

applyMigration().catch((err) => {
  console.error('Migration 17 failed:', err);
  process.exit(1);
});
