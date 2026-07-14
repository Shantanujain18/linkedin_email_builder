import { NextResponse } from "next/server";
import { clearDrafts, db, getProfile, now } from "@/lib/db";
import { draftEmailBatch } from "@/lib/openai";
import { mapPool } from "@/lib/pool";
import type { CandidateProfile } from "@/lib/types";

export const runtime = "nodejs";

const BATCH_SIZE = 5;
const BATCH_CONCURRENCY = 4;

type PendingDraft = {
  key: string;
  postId: number;
  postedBy: string;
  content: string;
  email: string;
};

export async function DELETE() {
  try {
    const deleted = clearDrafts();
    return NextResponse.json({ deleted });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to clear drafts." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const id = Number(body.id);
    if (!Number.isFinite(id) || id < 1) {
      return NextResponse.json({ error: "Draft id is required." }, { status: 400 });
    }

    const existing = db.prepare("SELECT id, status FROM email_drafts WHERE id = ?").get(id) as
      | { id: number; status: string }
      | undefined;
    if (!existing) return NextResponse.json({ error: "Draft not found." }, { status: 404 });

    const recipientEmail = String(body.recipient_email ?? "").trim();
    const subject = String(body.subject ?? "").trim();
    const draftBody = String(body.body ?? "");
    if (!recipientEmail) return NextResponse.json({ error: "Recipient email is required." }, { status: 400 });
    if (!subject) return NextResponse.json({ error: "Subject is required." }, { status: 400 });

    const nextStatus = existing.status === "sent" ? "sent" : "draft";
    db.prepare(`UPDATE email_drafts
      SET recipient_email = ?, subject = ?, body = ?, status = ?, updated_at = ?
      WHERE id = ?`).run(recipientEmail, subject, draftBody, nextStatus, now(), id);

    const draft = db
      .prepare("SELECT id, recipient_email, recipient_name, subject, body, status FROM email_drafts WHERE id = ?")
      .get(id);
    return NextResponse.json({ draft });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update draft." }, { status: 500 });
  }
}

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function POST() {
  try {
    const profileRow = getProfile();
    if (!profileRow) return NextResponse.json({ error: "Upload a resume first." }, { status: 400 });

    const profile: CandidateProfile = {
      name: String(profileRow.name || ""),
      yoe: String(profileRow.yoe || ""),
      top_skills: String(profileRow.top_skills || ""),
      current_role: String(profileRow.current_role || ""),
      resume_link: String(profileRow.resume_link || ""),
      phone: String(profileRow.phone || ""),
      email: String(profileRow.email || "")
    };

    const posts = db
      .prepare("SELECT * FROM linkedin_posts WHERE emails_json != '[]' ORDER BY id ASC")
      .all() as Array<Record<string, string | number>>;
    if (!posts.length) return NextResponse.json({ error: "No imported posts contain email addresses." }, { status: 400 });

    const existingPostIds = new Set(
      (db.prepare("SELECT post_id FROM email_drafts").all() as Array<{ post_id: number }>).map((row) => row.post_id)
    );

    const pending: PendingDraft[] = [];
    for (const post of posts) {
      const postId = Number(post.id);
      if (existingPostIds.has(postId)) continue;
      const emails = JSON.parse(String(post.emails_json || "[]")) as string[];
      const email = emails.find((value) => String(value || "").trim());
      if (!email) continue;
      pending.push({
        key: String(postId),
        postId,
        postedBy: String(post.posted_by || ""),
        content: String(post.posted_content || ""),
        email: String(email).trim()
      });
    }

    if (!pending.length) return NextResponse.json({ created: 0 });

    const batches = chunk(pending, BATCH_SIZE);
    const insert = db.prepare(`INSERT INTO email_drafts
      (post_id, recipient_email, recipient_name, subject, body, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);

    let created = 0;
    await mapPool(batches, BATCH_CONCURRENCY, async (batch) => {
      const generated = await draftEmailBatch(profile, batch);
      const timestamp = now();
      const write = db.transaction(() => {
        for (const item of batch) {
          const draft = generated[item.key];
          if (!draft?.subject || !draft?.body) continue;
          insert.run(item.postId, item.email, item.postedBy, draft.subject, draft.body, timestamp, timestamp);
          created += 1;
        }
      });
      write();
    });

    return NextResponse.json({ created, pending: pending.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Draft generation failed." }, { status: 500 });
  }
}
