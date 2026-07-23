import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

async function userFromBearer(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const supabase = createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const {
    data: { user }
  } = await supabase.auth.getUser(token);
  return user ?? null;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request
  });

  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
  const bearerToken =
    authHeader?.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";

  if (bearerToken && request.nextUrl.pathname.startsWith("/api/")) {
    const bearerUser = await userFromBearer(bearerToken);
    if (bearerUser) return NextResponse.next({ request });
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        }
      }
    }
  );

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthPage =
    path === "/login" || path === "/signup" || path === "/forgot-password";
  const isResetPassword = path === "/reset-password";
  const isAuthCallback = path.startsWith("/auth/callback");
  const isPublicApi =
    path.startsWith("/api/auth") ||
    path === "/api/contact" ||
    path === "/api/extension/version";
  const isMarketing =
    path === "/" ||
    path.startsWith("/#") ||
    path === "/privacy" ||
    path === "/terms" ||
    path === "/contact";
  const isPublicPath =
    isAuthPage || isResetPassword || isAuthCallback || isPublicApi || isMarketing;

  const isProtectedApp =
    path.startsWith("/dashboard") ||
    (path.startsWith("/api/") && !isPublicApi);

  if (!user && isProtectedApp) {
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // Returning users: don't strand them on marketing "Start free"
  if (user && path === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
