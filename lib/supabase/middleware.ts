import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/config/env";
import { Database } from "@/types/database.types";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session if expired
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // Protected User Dashboard routes
  const isDashboardRoute =
    path.startsWith("/dashboard") ||
    path.startsWith("/applications") ||
    path.startsWith("/applicants") ||
    path.startsWith("/portfolio") ||
    path.startsWith("/capital") ||
    path.startsWith("/watchlist") ||
    path.startsWith("/notifications") ||
    path.startsWith("/analytics") ||
    path.startsWith("/reports") ||
    path.startsWith("/settings");

  // Protected Admin routes
  const isAdminRoute = path.startsWith("/admin");

  // Auth pages (login, register, forgot-password)
  const isAuthRoute =
    path.startsWith("/login") ||
    path.startsWith("/register") ||
    path.startsWith("/forgot-password") ||
    path.startsWith("/reset-password");

  // If unauthenticated and accessing protected area, redirect to login
  if (!user && (isDashboardRoute || isAdminRoute)) {
    // Only redirect if valid production config or explicit url
    if (!env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder-project")) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("redirectTo", path);
      return NextResponse.redirect(url);
    }
  }

  // If already authenticated and accessing login/register, redirect to dashboard
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
