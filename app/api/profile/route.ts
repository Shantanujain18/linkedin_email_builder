import { NextResponse } from "next/server";
import { getPublicProfile, updateProfile } from "@/lib/db";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  try {
    if (!getPublicProfile()) {
      return NextResponse.json({ error: "Upload a resume first." }, { status: 400 });
    }
    const body = await request.json();
    const patch: { immediate_joiner?: boolean; top_skills?: string } = {};

    if (Object.prototype.hasOwnProperty.call(body, "immediate_joiner")) {
      if (typeof body.immediate_joiner !== "boolean") {
        return NextResponse.json({ error: "immediate_joiner must be true or false." }, { status: 400 });
      }
      patch.immediate_joiner = body.immediate_joiner;
    }

    if (Object.prototype.hasOwnProperty.call(body, "top_skills")) {
      if (typeof body.top_skills !== "string") {
        return NextResponse.json({ error: "top_skills must be a string." }, { status: 400 });
      }
      patch.top_skills = body.top_skills;
    }

    if (!Object.keys(patch).length) {
      return NextResponse.json({ error: "Provide immediate_joiner and/or top_skills to update." }, { status: 400 });
    }

    const profile = updateProfile(patch);
    return NextResponse.json({ profile });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update profile." }, { status: 500 });
  }
}
