import { NextResponse } from "next/server";
import { isUser, requireUser } from "@/lib/auth";
import { extractEmails } from "@/lib/csv";
import { now, upsertLinkedInPosts } from "@/lib/db";
import { requireMatchingExtensionVersion } from "@/lib/extension-version";

export const runtime = "nodejs";

type RawPost = Record<string, unknown>;

function str(value: unknown) {
  return String(value ?? "").trim();
}

function normalizePost(raw: RawPost) {
  const postedBy = str(raw.posted_by ?? raw.postedBy);
  const postedByUrl = str(raw.posted_by_url ?? raw.postedByUrl);
  const postedDate = str(raw.posted_date ?? raw.postedDate);
  const postedContent = str(raw.posted_content ?? raw.postedContent);
  const postUrl = str(raw.post_url ?? raw.postUrl);
  const emails = extractEmails(
    [postedBy, postedByUrl, postedDate, postedContent, postUrl].join("\n")
  );
  return { postedBy, postedByUrl, postedDate, postedContent, postUrl, emails };
}

export async function POST(request: Request) {
  try {
    const versionGate = await requireMatchingExtensionVersion(request);
    if (!versionGate.ok) return versionGate.response;

    const user = await requireUser();
    if (!isUser(user)) return user;

    const body = (await request.json().catch(() => ({}))) as { posts?: unknown };
    if (!Array.isArray(body.posts) || !body.posts.length) {
      return NextResponse.json({ error: "posts must be a non-empty array." }, { status: 400 });
    }

    const rows = body.posts
      .filter((item): item is RawPost => Boolean(item) && typeof item === "object")
      .map(normalizePost)
      .filter((row) => row.postedContent);

    if (!rows.length) {
      return NextResponse.json({ error: "No readable posts in payload." }, { status: 400 });
    }

    await upsertLinkedInPosts(user.id, rows);

    return NextResponse.json({
      imported: rows.length,
      withEmails: rows.filter((row) => row.emails.length).length,
      at: now()
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save scraped posts." },
      { status: 500 }
    );
  }
}
