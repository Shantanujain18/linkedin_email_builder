import { NextResponse } from "next/server";
import { isUser, requireUser } from "@/lib/auth";
import {
  clearDrafts,
  deleteDraftsByIds,
  existingDraftPostIds,
  getDraftStatus,
  getPostsWithEmails,
  getProfile,
  insertDraft,
  setDraftReplied,
  setPostDraftSkipReason,
  updateDraftCalled,
  updateDraftContent
} from "@/lib/db";
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

function mapDraft(draft: Record<string, unknown>) {
  return {
    ...draft,
    called: Boolean(draft.called),
    replied: Boolean(draft.replied)
  };
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    if (!isUser(user)) return user;

    const body = await request.json().catch(() => ({}));
    const ids = Array.isArray(body.ids)
      ? body.ids.map((value: unknown) => Number(value)).filter((value: number) => Number.isFinite(value) && value > 0)
      : [];

    if (ids.length) {
      const deleted = await deleteDraftsByIds(user.id, ids);
      return NextResponse.json({ deleted, ids });
    }

    const deleted = await clearDrafts(user.id);
    return NextResponse.json({ deleted });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to clear drafts." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    if (!isUser(user)) return user;

    const body = await request.json();
    const id = Number(body.id);
    if (!Number.isFinite(id) || id < 1) {
      return NextResponse.json({ error: "Draft id is required." }, { status: 400 });
    }

    const existing = await getDraftStatus(user.id, id);
    if (!existing) return NextResponse.json({ error: "Draft not found." }, { status: 404 });

    const flagOnly =
      body.recipient_email == null && body.subject == null && body.body == null;

    if (flagOnly && typeof body.replied === "boolean") {
      const draft = await setDraftReplied(user.id, id, body.replied);
      if (!draft) return NextResponse.json({ error: "Draft not found." }, { status: 404 });
      return NextResponse.json({ draft: mapDraft(draft) });
    }

    if (flagOnly && typeof body.called === "boolean") {
      const draft = await updateDraftCalled(user.id, id, body.called);
      if (!draft) return NextResponse.json({ error: "Draft not found." }, { status: 404 });
      return NextResponse.json({ draft: mapDraft(draft) });
    }

    const recipientEmail = String(body.recipient_email ?? "").trim();
    const subject = String(body.subject ?? "").trim();
    const draftBody = String(body.body ?? "");
    if (!recipientEmail) return NextResponse.json({ error: "Recipient email is required." }, { status: 400 });
    if (!subject) return NextResponse.json({ error: "Subject is required." }, { status: 400 });

    const nextStatus = existing.status === "sent" ? "sent" : "draft";
    const draft = await updateDraftContent(user.id, id, {
      recipient_email: recipientEmail,
      subject,
      body: draftBody,
      status: nextStatus
    });
    return NextResponse.json({ draft: mapDraft(draft || {}) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update draft." }, { status: 500 });
  }
}

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Cap per request so large pending queues do not hit the HTTP timeout. */
const MAX_POSTS_PER_REQUEST = 20;

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!isUser(user)) return user;

    const body = (await request.json().catch(() => ({}))) as { postIds?: unknown };
    const requestedIds = Array.isArray(body.postIds)
      ? body.postIds.map((value) => Number(value)).filter((id) => Number.isFinite(id) && id > 0)
      : [];
    const requestedSet = requestedIds.length ? new Set(requestedIds) : null;

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

    const posts = await getPostsWithEmails(user.id);
    if (!posts.length) return NextResponse.json({ error: "No imported posts contain email addresses." }, { status: 400 });

    const existingPostIds = await existingDraftPostIds(user.id);

    const pending: PendingDraft[] = [];
    for (const post of posts) {
      const postId = Number(post.id);
      if (requestedSet && !requestedSet.has(postId)) continue;
      if (existingPostIds.has(postId)) continue;
      const emails = JSON.parse(String(post.emailsJson || "[]")) as string[];
      const email = emails.find((value) => String(value || "").trim());
      if (!email) continue;
      pending.push({
        key: String(postId),
        postId,
        postedBy: String(post.postedBy || ""),
        content: String(post.postedContent || ""),
        email: String(email).trim()
      });
    }

    if (!pending.length) {
      return NextResponse.json({ created: 0, skipped: 0, pending: 0, remaining: 0 });
    }

    const remaining = Math.max(0, pending.length - MAX_POSTS_PER_REQUEST);
    const work = pending.slice(0, MAX_POSTS_PER_REQUEST);
    const batches = chunk(work, BATCH_SIZE);
    let created = 0;
    let skipped = 0;
    const skipReasons: Array<{ postId: number; reason: string }> = [];

    await mapPool(batches, BATCH_CONCURRENCY, async (batch) => {
      const generated = await draftEmailBatch(profile, batch);
      for (const item of batch) {
        const draft = generated[item.key];
        if (!draft || draft.skip) {
          skipped += 1;
          const reason = draft && "reason" in draft ? draft.reason : "Skipped.";
          skipReasons.push({ postId: item.postId, reason });
          await setPostDraftSkipReason(user.id, item.postId, reason);
          continue;
        }
        if (!draft.subject || !draft.body) {
          skipped += 1;
          const reason = "Model returned an incomplete draft.";
          skipReasons.push({ postId: item.postId, reason });
          await setPostDraftSkipReason(user.id, item.postId, reason);
          continue;
        }
        await insertDraft(user.id, {
          postId: item.postId,
          recipientEmail: item.email,
          recipientName: draft.contact_name || item.postedBy,
          subject: draft.subject,
          body: draft.body,
          phone: draft.phone,
          location: draft.location,
          company: draft.company,
          contactName: draft.contact_name || item.postedBy,
          hiringSummary: draft.hiring_summary,
          talkingPoints: draft.talking_points,
          jobPost: item.content,
          matchedSkills: draft.matched_skills.join(", ")
        });
        created += 1;
      }
    });

    return NextResponse.json({
      created,
      skipped,
      pending: work.length,
      remaining,
      skip_reasons: skipReasons.slice(0, 20)
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Draft generation failed." }, { status: 500 });
  }
}
