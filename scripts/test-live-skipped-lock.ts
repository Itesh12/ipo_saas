import fs from 'fs';
import path from 'path';

// Load .env.local
const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  const content = fs.readFileSync(envLocalPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

import { distributedLockService } from '../features/external-integrations/services/distributedLockService';

async function main() {
  const cronSecret = process.env.CRON_SECRET;
  console.log('1. Manually acquiring global lock to simulate in-flight sync...');
  const lockAcquired = await distributedLockService.acquireGlobalLock({
    lockedBy: 'simulation_in_flight_runner',
    jobName: 'master_reconciliation_sync',
    targetSource: 'all',
    ttlSeconds: 30,
  });
  console.log('   Lock acquired:', lockAcquired);

  console.log('\n2. Calling HTTP endpoint /api/admin/ipo-sync/run?source=nse with Bearer token...');
  const res = await fetch('http://localhost:3000/api/admin/ipo-sync/run?source=nse', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cronSecret}`,
      'User-Agent': 'vercel-cron/1.0',
    },
  });

  const body = await res.json();
  console.log('   HTTP Status:', res.status);
  console.log('   Response Body:', JSON.stringify(body, null, 2));

  console.log('\n3. Releasing simulation lock...');
  await distributedLockService.releaseGlobalLock('simulation_in_flight_runner');
  console.log('   Lock released.');
}

main().catch(console.error);
