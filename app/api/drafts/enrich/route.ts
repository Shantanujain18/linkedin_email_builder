import { NextResponse } from "next/server";
import { db, getProfile, now } from "@/lib/db";
import { enrichDraftBatch } from "@/lib/openai";
import { mapPool } from "@/lib/pool";
import type { CandidateProfile } from "@/lib/types";

export const runtime = "nodejs";

const BATCH_SIZE = 4;
const BATCH_CONCURRENCY = 3;

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

type DraftRow = {
  id: number;
  post_id: number;
  recipient_email: string;
  recipient_name: string;
  job_post: string;
  phone: string;
  company: string;
  hiring_summary: string;
};

/**
 * Backfill phone/location/company/summary/talking points for existing drafts
 * (including already-sent ones) from the linked LinkedIn post text.
 */
export async function POST(request: Request) {
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
      email: String(profileRow.email || ""),
      immediate_joiner: Number(profileRow.immediate_joiner) === 1
    };

    const body = await request.json().catch(() => ({}));
    const ids = Array.isArray(body.ids)
      ? body.ids.map((value: unknown) => Number(value)).filter((value: number) => Number.isFinite(value) && value > 0)
      : [];
    const onlyMissing = body.only_missing !== false;

    let drafts: DraftRow[];
    if (ids.length) {
      const placeholders = ids.map(() => "?").join(",");
      drafts = db
        .prepare(`SELECT id, post_id, recipient_email, recipient_name, job_post, phone, company, hiring_summary
          FROM email_drafts WHERE id IN (${placeholders}) ORDER BY id ASC`)
        .all(...ids) as DraftRow[];
    } else if (onlyMissing) {
      drafts = db
        .prepare(`SELECT id, post_id, recipient_email, recipient_name, job_post, phone, company, hiring_summary
          FROM email_drafts
          WHERE trim(coalesce(phone,'')) = ''
             OR trim(coalesce(company,'')) = ''
             OR trim(coalesce(hiring_summary,'')) = ''
             OR trim(coalesce(talking_points,'')) = ''
             OR trim(coalesce(job_post,'')) = ''
          ORDER BY id ASC`)
        .all() as DraftRow[];
    } else {
      drafts = db
        .prepare(`SELECT id, post_id, recipient_email, recipient_name, job_post, phone, company, hiring_summary
          FROM email_drafts ORDER BY id ASC`)
        .all() as DraftRow[];
    }

    if (!drafts.length) {
      return NextResponse.json({ enriched: 0, message: "No drafts need enrichment." });
    }

    const postIds = Array.from(new Set(drafts.map((draft) => draft.post_id)));
    const placeholders = postIds.map(() => "?").join(",");
    const posts = db
      .prepare(`SELECT id, posted_by, posted_content FROM linkedin_posts WHERE id IN (${placeholders})`)
      .all(...postIds) as Array<{ id: number; posted_by: string; posted_content: string }>;
    const postById = new Map(posts.map((post) => [post.id, post]));

    type WorkItem = {
      key: string;
      draftId: number;
      postedBy: string;
      content: string;
      email: string;
    };

    const work: WorkItem[] = [];
    for (const draft of drafts) {
      const post = postById.get(draft.post_id);
      const content = String(post?.posted_content || draft.job_post || "").trim();
      if (!content) continue;
      work.push({
        key: String(draft.id),
        draftId: draft.id,
        postedBy: String(post?.posted_by || draft.recipient_name || ""),
        content,
        email: draft.recipient_email
      });
    }

    if (!work.length) {
      return NextResponse.json({
        error: "Could not find original LinkedIn post text for these drafts."
      }, { status: 400 });
    }

    const update = db.prepare(`UPDATE email_drafts SET
      phone = ?, location = ?, company = ?, contact_name = ?,
      hiring_summary = ?, talking_points = ?, job_post = ?, matched_skills = ?,
      updated_at = ?
      WHERE id = ?`);

    let enriched = 0;
    const batches = chunk(work, BATCH_SIZE);
    await mapPool(batches, BATCH_CONCURRENCY, async (batch) => {
      const results = await enrichDraftBatch(profile, batch);
      const timestamp = now();
      const write = db.transaction(() => {
        for (const item of batch) {
          const row = results[item.key];
          if (!row) continue;
          update.run(
            row.phone,
            row.location,
            row.company,
            row.contact_name || item.postedBy,
            row.hiring_summary,
            row.talking_points,
            item.content,
            row.matched_skills.join(", "),
            timestamp,
            item.draftId
          );
          enriched += 1;
        }
      });
      write();
    });

    return NextResponse.json({
      enriched,
      requested: drafts.length,
      processed: work.length
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to enrich drafts."
    }, { status: 500 });
  }
}
