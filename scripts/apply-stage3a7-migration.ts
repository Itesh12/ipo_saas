import fs from 'fs';
import path from 'path';
import pg from 'pg';

async function applyMigration() {
  const migrationPath = path.resolve(__dirname, '../supabase/migrations/20260916000023_stage3a7_distributed_lock.sql');
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

  console.log('Executing Migration 23 (Distributed Lock & Concurrency Guard)...');
  await client.query(sql);
  console.log('✅ Migration 23 applied successfully!');

  // Verify ipo_sync_global_lock table exists
  const resTable = await client.query(`
    SELECT table_name FROM information_schema.tables WHERE table_name = 'ipo_sync_global_lock';
  `);
  console.log('Verification ipo_sync_global_lock exists:', resTable.rows.length > 0);

  // Test acquire function
  const testAcquire = await client.query(`
    SELECT public.acquire_ipo_sync_lock('ipo_sync_global', 'migration_test', 'test_job', 'nse', 60) AS acquired;
  `);
  console.log('Test acquire_ipo_sync_lock:', testAcquire.rows[0]);

  // Test release function
  const testRelease = await client.query(`
    SELECT public.release_ipo_sync_lock('ipo_sync_global', 'migration_test') AS released;
  `);
  console.log('Test release_ipo_sync_lock:', testRelease.rows[0]);

  await client.end();
}

applyMigration().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
