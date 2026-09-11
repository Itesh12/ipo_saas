import { createClient } from "@/lib/supabase/server";
import { UserRole, Database } from "@/types/database.types";
import { hasMinimumRole } from "./roles";
import { redirect } from "next/navigation";

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  avatarUrl: string | null;
}

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

/**
 * Retrieves the currently authenticated user and their profile from Supabase.
 * Returns null if unauthenticated.
 */
export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  // Fetch role and profile from the database
  const { data } = await supabase
    .from("profiles")
    .select("role, full_name, avatar_url, is_suspended")
    .eq("id", user.id)
    .single();

  const profile = data as Pick<ProfileRow, "role" | "full_name" | "avatar_url" | "is_suspended"> | null;

  if (profile?.is_suspended) {
    return null;
  }

  return {
    id: user.id,
    email: user.email ?? "",
    fullName: profile?.full_name ?? user.user_metadata?.full_name ?? null,
    role: profile?.role || "user",
    avatarUrl: profile?.avatar_url ?? user.user_metadata?.avatar_url ?? null,
  };
}

/**
 * Server-side Guard: Ensures the user is logged in.
 * If not authenticated, redirects to /login.
 */
export async function requireAuth(redirectTo = "/login"): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();

  if (!user) {
    redirect(redirectTo);
  }

  return user;
}

/**
 * Server-side Guard: Enforces minimum role requirement.
 * If role is insufficient, redirects or throws.
 */
export async function requireRole(
  requiredRole: UserRole,
  fallbackRedirect = "/dashboard"
): Promise<AuthenticatedUser> {
  const user = await requireAuth();

  if (!hasMinimumRole(user.role, requiredRole)) {
    redirect(fallbackRedirect);
  }

  return user;
}
