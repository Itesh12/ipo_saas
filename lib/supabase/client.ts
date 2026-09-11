import { createBrowserClient } from "@supabase/ssr";
import { Database } from "@/types/database.types";
import { env } from "@/config/env";

/**
 * Creates a Supabase client for Client Components.
 * Utilizes public environment variables safely.
 */
export function createClient() {
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
