import { NextResponse } from "next/server";
import { isUser, requireUser } from "@/lib/auth";
import { db, now } from "@/lib/db";
import { parseLinkedInCsv } from "@/lib/csv";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!isUser(user)) return user;

    const form = await request.formData();
    const file = form.get("csv");
    if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "Choose a LinkedIn CSV file." }, { status: 400 });
    const rows = parseLinkedInCsv(await file.text());
    const insert = db.prepare(`INSERT INTO linkedin_posts
      (user_id, posted_by, posted_by_url, posted_date, posted_content, post_url, emails_json, created_at)
      VALUES (@userId, @postedBy, @postedByUrl, @postedDate, @postedContent, @postUrl, @emailsJson, @createdAt)
      ON CONFLICT(user_id, posted_by_url, posted_content) DO UPDATE SET posted_date=@postedDate, post_url=@postUrl, emails_json=@emailsJson`);
    const transaction = db.transaction((items: typeof rows) => {
      for (const row of items) {
        insert.run({ ...row, userId: user.id, emailsJson: JSON.stringify(row.emails), createdAt: now() });
      }
    });
    transaction(rows);
    return NextResponse.json({ imported: rows.length, withEmails: rows.filter((row) => row.emails.length).length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "CSV import failed." }, { status: 500 });
  }
}
