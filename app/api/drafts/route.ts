import { NextResponse } from "next/server";
import { isUser, requireUser } from "@/lib/auth";
import {
  clearDrafts,
  deleteDraftsByIds,
  draftedEmailsTodaySet,
  existingDraftPostIds,
  getDraftStatus,
  getPostsWithEmails,
  getProfile,
  insertDraft,
  listDraftsPage,
  setDraftReplied,
  setPostDraftSkipReason,
  updateDraftCalled,
  updateDraftContent,
  type DraftStatusFilter
} from "@/lib/db";
import { ALREADY_DRAFTED_EMAIL_TODAY, claimDraftEmail, normalizeDraftEmail } from "@/lib/draft-dedupe";
import { draftEmailBatch } from "@/lib/openai";
import { mapPool } from "@/lib/pool";
import { parsePage, parsePageSize, postDraftStatus } from "@/lib/post-draft-status";
import type { CandidateProfile } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const BATCH_SIZE = 5;
const BATCH_CONCURRENCY = 4;

const DRAFT_STATUS_FILTERS = new Set<DraftStatusFilter>([
  "all",
  "unsent",
  "draft",
  "sent",
  "skipped",
  "replied"
]);

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    if (!isUser(user)) return user;

    const url = new URL(request.url);
    const page = parsePage(url.searchParams.get("page"));
    const pageSize = parsePageSize(url.searchParams.get("pageSize"));
    const statusRaw = String(url.searchParams.get("status") || "all") as DraftStatusFilter;
    const status = DRAFT_STATUS_FILTERS.has(statusRaw) ? statusRaw : "all";
    const q = String(url.searchParams.get("q") || "");
    const date = String(url.searchParams.get("date") || "");

    const result = await listDraftsPage(user.id, { page, pageSize, status, q, date });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load drafts." },
      { status: 500 }
    );
  }
}

type PendingDraft = {
  key: string;
  postId: number;
  postedBy: string;
  content: string;
  email: string;
  phones: string[];
};

function parseJsonList(raw: unknown): string[] {
  try {
    const parsed = JSON.parse(String(raw || "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed.map((value) => String(value || "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

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

    const body = (await request.json().catch(() => ({}))) as { postIds?: unknown; pendingOnly?: unknown };
    const requestedIds = Array.isArray(body.postIds)
      ? body.postIds.map((value) => Number(value)).filter((id) => Number.isFinite(id) && id > 0)
      : [];
    const requestedSet = requestedIds.length ? new Set(requestedIds) : null;
    const pendingOnly = Boolean(body.pendingOnly);

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

    const [existingPostIds, draftedEmailsToday] = await Promise.all([
      existingDraftPostIds(user.id),
      draftedEmailsTodaySet(user.id)
    ]);
    const topSkills = String(profileRow.top_skills || "");
    const claimedEmails = new Set(draftedEmailsToday);

    const pending: PendingDraft[] = [];
    const emailDupes: Array<{ postId: number; email: string; reason: string }> = [];
    for (const post of posts) {
      const postId = Number(post.id);
      if (requestedSet && !requestedSet.has(postId)) continue;
      if (existingPostIds.has(postId)) continue;
      const emails = parseJsonList(post.emailsJson);
      const email = emails[0];
      if (!email) continue;
      // Unless the caller asked for specific postIds, skip posts already marked unworkable.
      if (!requestedSet && String(post.draftSkipReason || "").trim()) continue;
      if (pendingOnly) {
        const outcome = postDraftStatus(
          {
            id: postId,
            emails_json: post.emailsJson,
            draft_skip_reason: post.draftSkipReason,
            posted_content: post.postedContent
          },
          existingPostIds,
          topSkills
        );
        if (outcome.kind !== "pending") continue;
      }
      // One draft per recipient email per day (same recruiter, many posts).
      if (!claimDraftEmail(email, claimedEmails)) {
        emailDupes.push({
          postId,
          email: normalizeDraftEmail(email),
          reason: ALREADY_DRAFTED_EMAIL_TODAY
        });
        continue;
      }
      pending.push({
        key: String(postId),
        postId,
        postedBy: String(post.postedBy || ""),
        content: String(post.postedContent || ""),
        email,
        phones: parseJsonList(post.phonesJson)
      });
    }

    const remaining = Math.max(0, pending.length - MAX_POSTS_PER_REQUEST);
    const work = pending.slice(0, MAX_POSTS_PER_REQUEST);
    // Only stamp email-dupes whose winner is already in DB or in this request's work window
    // (don't mark skipped if the first post for that email is still queued for a later chunk).
    const workEmails = new Set(work.map((item) => normalizeDraftEmail(item.email)));
    const stampDupes = emailDupes.filter(
      (item) => draftedEmailsToday.has(item.email) || workEmails.has(item.email)
    );

    if (stampDupes.length) {
      await mapPool(stampDupes, 8, async (item) => {
        await setPostDraftSkipReason(user.id, item.postId, item.reason);
      });
    }

    if (!work.length) {
      return NextResponse.json({
        created: 0,
        skipped: stampDupes.length,
        pending: 0,
        remaining,
        skip_reasons: stampDupes.slice(0, 20).map(({ postId, reason }) => ({ postId, reason }))
      });
    }

    const batches = chunk(work, BATCH_SIZE);
    let created = 0;
    let skipped = stampDupes.length;
    const skipReasons: Array<{ postId: number; reason: string }> = stampDupes
      .slice(0, 20)
      .map(({ postId, reason }) => ({ postId, reason }));

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
          phone: draft.phone || item.phones[0] || "",
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
