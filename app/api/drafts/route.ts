import { NextResponse } from "next/server";
import { db, getProfile, now } from "@/lib/db";
import { draftEmail } from "@/lib/openai";

export const runtime = "nodejs";

export async function POST() {
  try {
    const profileRow = getProfile();
    if (!profileRow) return NextResponse.json({ error: "Upload a resume first." }, { status: 400 });
    const posts = db.prepare("SELECT * FROM linkedin_posts WHERE emails_json != '[]' ORDER BY id ASC").all() as Array<Record<string, string | number>>;
    if (!posts.length) return NextResponse.json({ error: "No imported posts contain email addresses." }, { status: 400 });
    let created = 0;
    for (const post of posts) {
      const emails = JSON.parse(String(post.emails_json || "[]")) as string[];
      for (const email of emails.slice(0, 3)) {
        const existing = db.prepare("SELECT id FROM email_drafts WHERE post_id = ?").get(post.id);
        if (existing) continue;
        const generated = await draftEmail(
          {
            name: String(profileRow.name || ""), yoe: String(profileRow.yoe || ""), top_skills: String(profileRow.top_skills || ""),
            current_role: String(profileRow.current_role || ""), resume_link: String(profileRow.resume_link || ""),
            phone: String(profileRow.phone || ""), email: String(profileRow.email || "")
          },
          { postedBy: String(post.posted_by || ""), content: String(post.posted_content || ""), email }
        );
        const timestamp = now();
        db.prepare(`INSERT INTO email_drafts (post_id, recipient_email, recipient_name, subject, body, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`).run(post.id, email, String(post.posted_by || ""), generated.subject || "", generated.body || "", timestamp, timestamp);
        created += 1;
      }
    }
    return NextResponse.json({ created });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Draft generation failed." }, { status: 500 });
  }
}
