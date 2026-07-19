import { NextResponse } from "next/server";
import { isUser, requireUser } from "@/lib/auth";
import { now, reserveImportQuota, upsertLinkedInPosts } from "@/lib/db";
import { parseLinkedInCsv } from "@/lib/csv";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!isUser(user)) return user;

    const form = await request.formData();
    const file = form.get("csv");
    if (!(file instanceof File) || !file.size) {
      return NextResponse.json({ error: "Choose a LinkedIn CSV file." }, { status: 400 });
    }

    const rows = parseLinkedInCsv(await file.text());
    if (!rows.length) {
      return NextResponse.json({ error: "CSV contained no readable posts." }, { status: 400 });
    }

    const reservation = await reserveImportQuota(user.id, rows.length);
    if (!reservation.allowed) {
      return NextResponse.json(
        {
          error: `Daily CSV import limit reached (${reservation.daily_post_limit}/day on the ${reservation.plan} plan).`,
          quota: reservation
        },
        { status: 429 }
      );
    }

    const accepted = rows.slice(0, reservation.allowed);
    await upsertLinkedInPosts(
      user.id,
      accepted.map((row) => ({
        postedBy: row.postedBy,
        postedByUrl: row.postedByUrl,
        postedDate: row.postedDate,
        postedContent: row.postedContent,
        postUrl: row.postUrl,
        emails: row.emails
      }))
    );

    const truncated = rows.length - accepted.length;
    return NextResponse.json({
      imported: accepted.length,
      withEmails: accepted.filter((row) => row.emails.length).length,
      truncated,
      quota: {
        plan: reservation.plan,
        daily_post_limit: reservation.daily_post_limit,
        used: reservation.used,
        remaining: reservation.remaining,
        day: reservation.day
      },
      at: now()
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "CSV import failed." },
      { status: 500 }
    );
  }
}
