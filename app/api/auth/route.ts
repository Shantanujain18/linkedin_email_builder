import { NextResponse } from "next/server";
import { isUser, requireUser, signinUser, signupUser, endSession, getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({ user });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = String(body.action || "signin");
    const email = String(body.email || "");
    const password = String(body.password || "");
    const name = String(body.name || "");

    if (action === "signup") {
      const user = await signupUser(email, password, name);
      return NextResponse.json({ user });
    }
    if (action === "signin") {
      const user = await signinUser(email, password);
      return NextResponse.json({ user });
    }
    if (action === "signout") {
      const current = await requireUser();
      if (!isUser(current)) return current;
      await endSession();
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Auth failed." }, { status: 400 });
  }
}

export async function DELETE() {
  try {
    await endSession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Sign out failed." }, { status: 500 });
  }
}
