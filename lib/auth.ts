import { createHash } from "crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { ensureUserDefaults, type User } from "@/lib/db";

function mapUser(user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }): User {
  return {
    id: user.id,
    email: user.email || "",
    name: String(user.user_metadata?.name || user.email?.split("@")[0] || "")
  };
}

/** ponytail: short TTL so parallel /api calls don't each hit Auth; keyed by cookie so logout is safe. */
const AUTH_USER_TTL_MS = 20_000;
const authUserCache = new Map<string, { user: User; at: number }>();
const authUserInflight = new Map<string, Promise<User | null>>();

function authCookieCacheKey(
  cookieStore: Awaited<ReturnType<typeof cookies>>
): string | null {
  const parts = cookieStore
    .getAll()
    .filter((c) => c.name.includes("auth-token"))
    .map((c) => `${c.name}=${c.value}`);
  if (!parts.length) return null;
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

async function userFromBearer(token: string): Promise<User | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const supabase = createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const {
    data: { user },
    error
  } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  await ensureUserDefaults(user.id);
  return mapUser(user);
}

async function userFromCookies(): Promise<User | null> {
  const cookieStore = await cookies();
  const cacheKey = authCookieCacheKey(cookieStore);
  if (!cacheKey) return null;

  const now = Date.now();
  const cached = authUserCache.get(cacheKey);
  if (cached && now - cached.at < AUTH_USER_TTL_MS) return cached.user;

  const existing = authUserInflight.get(cacheKey);
  if (existing) return existing;

  const pending = (async () => {
    try {
      const supabase = await createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) {
        authUserCache.delete(cacheKey);
        return null;
      }
      await ensureUserDefaults(user.id);
      const mapped = mapUser(user);
      authUserCache.set(cacheKey, { user: mapped, at: Date.now() });
      return mapped;
    } finally {
      authUserInflight.delete(cacheKey);
    }
  })();

  authUserInflight.set(cacheKey, pending);
  return pending;
}

export async function getCurrentUser(): Promise<User | null> {
  const headerStore = await headers();
  const authHeader = headerStore.get("authorization") || headerStore.get("Authorization");
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) {
      const bearerUser = await userFromBearer(token);
      if (bearerUser) return bearerUser;
    }
  }

  return userFromCookies();
}

export async function requireUser(): Promise<User | NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  return user;
}

export function isUser(value: User | NextResponse): value is User {
  return !(value instanceof NextResponse);
}
