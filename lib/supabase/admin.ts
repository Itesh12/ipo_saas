/**
 * lib/supabase/admin.ts
 *
 * Provides a service-role Supabase client for administrative workers,
 * scheduled cron handlers, and background processing.
 */

import { createClient } from '@supabase/supabase-js';
import { env } from '@/config/env';

export function createAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;

  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to initialize admin client');
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
