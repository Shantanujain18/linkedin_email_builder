import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
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

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;
  await ensureUserDefaults(user.id);
  return mapUser(user);
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
