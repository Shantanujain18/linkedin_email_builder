import { NextResponse } from "next/server";
import { getPublicProfile, setImmediateJoiner } from "@/lib/db";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  try {
    if (!getPublicProfile()) {
      return NextResponse.json({ error: "Upload a resume first." }, { status: 400 });
    }
    const body = await request.json();
    if (typeof body.immediate_joiner !== "boolean") {
      return NextResponse.json({ error: "immediate_joiner must be true or false." }, { status: 400 });
    }
    const profile = setImmediateJoiner(body.immediate_joiner);
    return NextResponse.json({ profile });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update profile." }, { status: 500 });
  }
}
