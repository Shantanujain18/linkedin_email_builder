import { NextResponse } from "next/server";
import { db, getPosts, getPublicProfile, getPublicSmtpSettings } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const drafts = db
    .prepare("SELECT id, recipient_email, recipient_name, subject, body, status FROM email_drafts ORDER BY id DESC")
    .all();
  return NextResponse.json({
    profile: getPublicProfile(),
    posts: getPosts(),
    drafts,
    smtp: getPublicSmtpSettings()
  });
}
