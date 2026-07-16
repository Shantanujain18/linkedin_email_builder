import { NextResponse } from "next/server";
import { isUser, requireUser } from "@/lib/auth";
import { getDraftsForEnrich, getPostsByIds, getProfile, updateDraftEnrichment } from "@/lib/db";
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

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!isUser(user)) return user;

    const profileRow = await getProfile(user.id);
    if (!profileRow?.resume_text) return NextResponse.json({ error: "Upload a resume first." }, { status: 400 });

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

    const drafts = await getDraftsForEnrich(user.id, { ids, onlyMissing });
    if (!drafts.length) {
      return NextResponse.json({ enriched: 0, message: "No drafts need enrichment." });
    }

    const postIds = Array.from(new Set(drafts.map((draft) => draft.postId)));
    const posts = await getPostsByIds(user.id, postIds);
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
      const post = postById.get(draft.postId);
      const content = String(post?.postedContent || draft.jobPost || "").trim();
      if (!content) continue;
      work.push({
        key: String(draft.id),
        draftId: draft.id,
        postedBy: String(post?.postedBy || draft.recipientName || ""),
        content,
        email: draft.recipientEmail
      });
    }

    if (!work.length) {
      return NextResponse.json({
        error: "Could not find original LinkedIn post text for these drafts."
      }, { status: 400 });
    }

    let enriched = 0;
    const batches = chunk(work, BATCH_SIZE);
    await mapPool(batches, BATCH_CONCURRENCY, async (batch) => {
      const results = await enrichDraftBatch(profile, batch);
      for (const item of batch) {
        const row = results[item.key];
        if (!row) continue;
        await updateDraftEnrichment(user.id, item.draftId, {
          phone: row.phone,
          location: row.location,
          company: row.company,
          contactName: row.contact_name || item.postedBy,
          hiringSummary: row.hiring_summary,
          talkingPoints: row.talking_points,
          jobPost: item.content,
          matchedSkills: row.matched_skills.join(", ")
        });
        enriched += 1;
      }
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
