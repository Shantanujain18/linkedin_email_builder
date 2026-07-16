import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function DELETE() {
  return NextResponse.json({
    ok: true,
    hint: "Call supabase.auth.signOut() from the browser."
  });
}
