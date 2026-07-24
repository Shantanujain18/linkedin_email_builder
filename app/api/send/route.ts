import { NextResponse } from "next/server";
import { isUser, requireUser } from "@/lib/auth";
import {
  emailedTodaySet,
  getDraftsForSend,
  getProfile,
  getSendQuota,
  getSmtpSettings,
  normalizeEmail,
  recordEmailSent,
  repliedEmailSet,
  todayKey,
  updateDraftStatus,
  wasEmailedToday
} from "@/lib/db";
import { sendMail } from "@/lib/mail";
import { downloadResume } from "@/lib/storage";

export const runtime = "nodejs";
/** Best-effort; Hobby still caps lower. Client batches keep each request short. */
export const maxDuration = 60;

/** Keep small so one request fits Vercel free/Hobby timeouts (~10s). */
const DEFAULT_BATCH = 2;
const MAX_BATCH = 5;

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!isUser(user)) return user;

    const body = await request.json().catch(() => ({}));
    const smtp = await getSmtpSettings(user.id);
    if (!smtp?.user || !smtp.pass) {
      return NextResponse.json({ error: "Configure SMTP details (email + App Password) first." }, { status: 400 });
    }

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

    const attachResume =
      body.attach_resume === undefined ? smtp.attach_resume : Boolean(body.attach_resume);

    const drafts = await getDraftsForSend(user.id, {
      all: sendAll,
      draftIds,
      draftId: sendAll || draftIds.length ? null : draftId
    });

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

    const sendQuota = await getSendQuota(user.id);
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

    const profile = await getProfile(user.id);
    let attachment: { filename: string; content: Buffer; contentType?: string } | null = null;
    if (attachResume) {
      const path = String(profile?.resume_path || "");
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
        filename: String(profile?.resume_filename || "resume.pdf"),
        content: downloaded.buffer,
        contentType: String(profile?.resume_mime || downloaded.contentType || "") || undefined
      };
    }

    const day = todayKey();
    const alreadyToday = await emailedTodaySet(user.id, day);
    const repliedEmails = await repliedEmailSet(user.id);
    const sentThisRun = new Set<string>();

    const work = drafts.slice(0, batchLimit);
    const remainingAfterSelect = Math.max(0, drafts.length - work.length);

    let sent = 0;
    let skipped = 0;
    let limited = 0;
    const errors: Array<{ id: number; error: string }> = [];
    const skippedDrafts: Array<{ id: number; email: string; reason: string }> = [];
    const results: Array<{ id: number; status: string; email?: string; error?: string }> = [];
    let remainingSends = sendQuota.remaining;

    for (const draft of work) {
      const email = normalizeEmail(draft.recipientEmail);
      if (!email) {
        skipped += 1;
        skippedDrafts.push({ id: draft.id, email: draft.recipientEmail, reason: "Missing recipient email." });
        results.push({ id: draft.id, status: "skipped", email: draft.recipientEmail });
        continue;
      }

      if (draft.replied || repliedEmails.has(email)) {
        skipped += 1;
        skippedDrafts.push({
          id: draft.id,
          email,
          reason: "Recipient marked as replied — automation blocked."
        });
        results.push({ id: draft.id, status: "skipped", email });
        continue;
      }

      if (alreadyToday.has(email) || sentThisRun.has(email) || (await wasEmailedToday(user.id, email, day))) {
        skipped += 1;
        skippedDrafts.push({
          id: draft.id,
          email,
          reason: "Already emailed this address today."
        });
        if (draft.status !== "sent") await updateDraftStatus(user.id, draft.id, "skipped");
        results.push({ id: draft.id, status: "skipped", email });
        continue;
      }

      if (remainingSends <= 0) {
        limited += 1;
        skippedDrafts.push({
          id: draft.id,
          email,
          reason: `Daily send limit reached (${sendQuota.daily_post_limit}/day).`
        });
        results.push({ id: draft.id, status: "limited", email });
        continue;
      }

      try {
        await sendMail({
          smtp,
          to: draft.recipientEmail,
          subject: draft.subject,
          body: draft.body,
          attachment
        });
        await updateDraftStatus(user.id, draft.id, "sent");
        await recordEmailSent(user.id, email, draft.id, day);
        alreadyToday.add(email);
        sentThisRun.add(email);
        sent += 1;
        remainingSends -= 1;
        results.push({ id: draft.id, status: "sent", email });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Send failed.";
        await updateDraftStatus(user.id, draft.id, "failed");
        errors.push({ id: draft.id, error: message });
        results.push({ id: draft.id, status: "failed", email, error: message });
      }
    }

    const quotaAfter = await getSendQuota(user.id);
    // If we hit the daily limit mid-batch, remaining unsent in this selection still need another run
    // only if quota recovers — but drafts not in `work` are still remaining.
    const remaining = remainingAfterSelect + limited;

    return NextResponse.json({
      sent,
      skipped,
      limited,
      failed: errors.length,
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
