import { NextResponse } from "next/server";
import { db, getPosts, getPublicProfile, getPublicSmtpSettings } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const drafts = db
    .prepare(`SELECT id, recipient_email, recipient_name, subject, body, status,
      phone, location, company, contact_name, hiring_summary, talking_points, job_post,
      matched_skills, called, called_at, post_id
      FROM email_drafts ORDER BY id DESC`)
    .all()
    .map((row) => {
      const draft = row as Record<string, unknown>;
      return {
        ...draft,
        called: Number(draft.called) === 1
      };
    });
  return NextResponse.json({
    profile: getPublicProfile(),
    posts: getPosts(),
    drafts,
    smtp: getPublicSmtpSettings()
  });
}
