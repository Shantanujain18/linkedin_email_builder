import { NextResponse } from "next/server";
import { isUser, requireUser } from "@/lib/auth";
import {
  emailedTodaySet,
  getDraftsForSend,
  getResumeAttachmentMeta,
  getSendQuota,
  getSmtpSettings,
  normalizeEmail,
  recordEmailSent,
  repliedEmailSet,
  todayKey,
  updateDraftStatus,
  updateDraftStatuses
} from "@/lib/db";
import { createMailTransport, sendMailWith } from "@/lib/mail";
import {
  claimSendEmail,
  mapPool,
  prefilterDraftsForSend,
  releaseSendEmailClaim,
  remainingAfterBatch,
  selectSendWork,
  sendFetchLimit
} from "@/lib/send-batch";
import { downloadResume } from "@/lib/storage";

export const runtime = "nodejs";
/** Best-effort; Hobby still caps lower. Client batches keep each request short. */
export const maxDuration = 60;

/** Keep modest so one request fits Vercel free/Hobby timeouts (~10s). */
const DEFAULT_BATCH = 5;
const MAX_BATCH = 5;
const SEND_CONCURRENCY = 2;

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!isUser(user)) return user;

    const body = await request.json().catch(() => ({}));
    const draftId = body.draftId != null ? Number(body.draftId) : null;
    const draftIds = Array.isArray(body.draftIds)
      ? body.draftIds.map((value: unknown) => Number(value)).filter((value: number) => Number.isFinite(value) && value > 0)
      : [];
    const sendAll = Boolean(body.all);
    if (!sendAll && !draftIds.length && (!draftId || !Number.isFinite(draftId))) {
      return NextResponse.json({ error: "Provide draftId, draftIds, or set all=true." }, { status: 400 });
    }

    const batchLimit = Math.max(
      1,
      Math.min(MAX_BATCH, Math.floor(Number(body.limit) || DEFAULT_BATCH))
    );
    const fetchLimit = sendFetchLimit(batchLimit);

    const attachResumeRequested = body.attach_resume;

    const [smtp, drafts, sendQuota, alreadyToday, repliedEmails, resumeMeta] = await Promise.all([
      getSmtpSettings(user.id),
      getDraftsForSend(user.id, {
        all: sendAll,
        draftIds,
        draftId: sendAll || draftIds.length ? null : draftId,
        fetchLimit
      }),
      getSendQuota(user.id),
      emailedTodaySet(user.id),
      repliedEmailSet(user.id),
      getResumeAttachmentMeta(user.id)
    ]);

    if (!smtp?.user || !smtp.pass) {
      return NextResponse.json({ error: "Configure SMTP details (email + App Password) first." }, { status: 400 });
    }

    if (!drafts.length) {
      return NextResponse.json(
        {
          error: sendAll ? "No unsent drafts to send." : "Draft not found or marked as replied.",
          sent: 0,
          skipped: 0,
          limited: 0,
          failed: 0,
          remaining: 0,
          done: true,
          results: []
        },
        { status: sendAll ? 200 : 404 }
      );
    }

    if (sendQuota.remaining <= 0) {
      return NextResponse.json(
        {
          error: `Daily email send limit reached (${sendQuota.daily_post_limit}/day on the ${sendQuota.plan} plan).`,
          quota: sendQuota,
          remaining: drafts.length,
          done: false
        },
        { status: 429 }
      );
    }

    const attachResume =
      attachResumeRequested === undefined ? smtp.attach_resume : Boolean(attachResumeRequested);

    let attachment: { filename: string; content: Buffer; contentType?: string } | null = null;
    if (attachResume) {
      const path = String(resumeMeta?.resume_path || "");
      const downloaded = path ? await downloadResume(path) : null;
      if (!downloaded) {
        return NextResponse.json(
          {
            error: "Attach resume is enabled, but no resume file is stored. Re-upload the resume first."
          },
          { status: 400 }
        );
      }
      attachment = {
        filename: String(resumeMeta?.resume_filename || "resume.pdf"),
        content: downloaded.buffer,
        contentType: String(resumeMeta?.resume_mime || downloaded.contentType || "") || undefined
      };
    }

    const day = todayKey();
    const sentThisRun = new Set<string>();

    const { eligible, skipIds, preSkipped, preSkippedDrafts } = prefilterDraftsForSend(
      drafts,
      alreadyToday,
      repliedEmails
    );

    if (skipIds.length) {
      await updateDraftStatuses(user.id, skipIds, "skipped");
    }

    const { work, remainingAfterSelect } = selectSendWork(eligible, batchLimit, sendQuota.remaining);

    let sent = 0;
    let skipped = preSkipped.length;
    let failed = 0;
    const errors: Array<{ id: number; error: string }> = [];
    const skippedDrafts = [...preSkippedDrafts];
    const results: Array<{ id: number; status: string; email?: string; error?: string }> = [...preSkipped];

    const transporter = createMailTransport(smtp);

    const outcomes = await mapPool(work, SEND_CONCURRENCY, async (draft) => {
      const email = normalizeEmail(draft.recipientEmail);
      if (claimSendEmail(email, alreadyToday, sentThisRun) !== "ok") {
        return {
          id: draft.id,
          email: email || draft.recipientEmail,
          kind: "skipped" as const,
          reason: !email ? "Missing recipient email." : "Already emailed this address today."
        };
      }

      try {
        await sendMailWith(transporter, {
          smtp,
          to: draft.recipientEmail,
          subject: draft.subject || "",
          body: draft.body || "",
          attachment
        });
        await Promise.all([
          updateDraftStatus(user.id, draft.id, "sent"),
          recordEmailSent(user.id, email, draft.id, day)
        ]);
        return { id: draft.id, email, kind: "sent" as const };
      } catch (error) {
        releaseSendEmailClaim(email, alreadyToday, sentThisRun);
        const message = error instanceof Error ? error.message : "Send failed.";
        await updateDraftStatus(user.id, draft.id, "failed");
        return { id: draft.id, email, kind: "failed" as const, error: message };
      }
    });

    const postSkipIds: number[] = [];
    for (const outcome of outcomes) {
      if (outcome.kind === "sent") {
        sent += 1;
        results.push({ id: outcome.id, status: "sent", email: outcome.email });
      } else if (outcome.kind === "failed") {
        failed += 1;
        errors.push({ id: outcome.id, error: outcome.error });
        results.push({ id: outcome.id, status: "failed", email: outcome.email, error: outcome.error });
      } else {
        skipped += 1;
        skippedDrafts.push({ id: outcome.id, email: outcome.email, reason: outcome.reason });
        postSkipIds.push(outcome.id);
        results.push({ id: outcome.id, status: "skipped", email: outcome.email });
      }
    }
    if (postSkipIds.length) {
      await updateDraftStatuses(user.id, postSkipIds, "skipped");
    }

    const quotaAfter = await getSendQuota(user.id);
    const remaining = remainingAfterBatch({
      sendAll,
      fetched: drafts.length,
      fetchLimit,
      remainingAfterSelect
    });

    return NextResponse.json({
      sent,
      skipped,
      limited: 0,
      failed,
      errors,
      skipped_drafts: skippedDrafts,
      results,
      attached_resume: Boolean(attachment),
      quota: quotaAfter,
      day,
      remaining,
      done: remaining === 0,
      batch_size: work.length
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send email." },
      { status: 500 }
    );
  }
}
