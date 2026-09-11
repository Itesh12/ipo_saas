/**
 * lib/supabase/admin.ts
 *
 * Provides a service-role Supabase client for administrative workers,
 * scheduled cron handlers, and background processing.
 */

import { createClient } from '@supabase/supabase-js';
import { env } from '@/config/env';

export function createAdminClient() {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to initialize admin client');
  }

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
