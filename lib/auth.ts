import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { ensureUserDefaults, type User } from "@/lib/db";

export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;
  await ensureUserDefaults(user.id);
  return {
    id: user.id,
    email: user.email || "",
    name: String(user.user_metadata?.name || user.email?.split("@")[0] || "")
  };
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
