import { NextResponse } from "next/server";
import { isUser, requireUser } from "@/lib/auth";
import { now, upsertLinkedInPosts } from "@/lib/db";
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
    await upsertLinkedInPosts(
      user.id,
      rows.map((row) => ({
        postedBy: row.postedBy,
        postedByUrl: row.postedByUrl,
        postedDate: row.postedDate,
        postedContent: row.postedContent,
        postUrl: row.postUrl,
        emails: row.emails
      }))
    );
    return NextResponse.json({ imported: rows.length, withEmails: rows.filter((row) => row.emails.length).length, at: now() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "CSV import failed." }, { status: 500 });
  }
}
