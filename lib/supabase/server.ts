import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { Database } from "@/types/database.types";
import { env } from "@/config/env";

/**
 * Creates a Supabase client for Server Components and Server Actions.
 * Safely accesses and manages session cookies.
 */
export async function createClient() {
  let cookieStore: {
    getAll: () => Array<{ name: string; value: string }>;
    set: (name: string, value: string, options?: unknown) => void;
  };

  try {
    const store = await cookies();
    cookieStore = {
      getAll: () => store.getAll(),
      set: (name, value, options) => store.set(name, value, options as never),
    };
  } catch {
    // Graceful fallback for CLI/unit-test execution where next/headers cookies is unavailable
    const dummyCookies = new Map<string, string>();
    cookieStore = {
      getAll: () => Array.from(dummyCookies.entries()).map(([name, value]) => ({ name, value })),
      set: (name, value) => dummyCookies.set(name, value),
    };
  }

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignored in Server Component context
          }
        },
      },
    }
  );
}
