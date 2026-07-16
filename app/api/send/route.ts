import { NextResponse } from "next/server";
import { isUser, requireUser } from "@/lib/auth";
import {
  emailedTodaySet,
  getDraftsForSend,
  getProfile,
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

    const attachResume =
      body.attach_resume === undefined ? smtp.attach_resume : Boolean(body.attach_resume);

    const drafts = await getDraftsForSend(user.id, {
      all: sendAll,
      draftIds,
      draftId: sendAll || draftIds.length ? null : draftId
    });

    if (!drafts.length) {
      return NextResponse.json({ error: sendAll ? "No unsent drafts to send." : "Draft not found or marked as replied." }, { status: 404 });
    }

    const profile = await getProfile(user.id);
    let attachment: { filename: string; content: Buffer; contentType?: string } | null = null;
    if (attachResume) {
      const path = String(profile?.resume_path || "");
      const downloaded = path ? await downloadResume(path) : null;
      if (!downloaded) {
        return NextResponse.json({
          error: "Attach resume is enabled, but no resume file is stored. Re-upload the resume first."
        }, { status: 400 });
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

    let sent = 0;
    let skipped = 0;
    const errors: Array<{ id: number; error: string }> = [];
    const skippedDrafts: Array<{ id: number; email: string; reason: string }> = [];

    for (const draft of drafts) {
      const email = normalizeEmail(draft.recipientEmail);
      if (!email) {
        skipped += 1;
        skippedDrafts.push({ id: draft.id, email: draft.recipientEmail, reason: "Missing recipient email." });
        continue;
      }

      if (draft.replied || repliedEmails.has(email)) {
        skipped += 1;
        skippedDrafts.push({
          id: draft.id,
          email,
          reason: "Recipient marked as replied — automation blocked."
        });
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
      } catch (error) {
        const message = error instanceof Error ? error.message : "Send failed.";
        await updateDraftStatus(user.id, draft.id, "failed");
        errors.push({ id: draft.id, error: message });
      }
    }

    return NextResponse.json({
      sent,
      skipped,
      failed: errors.length,
      errors,
      skipped_drafts: skippedDrafts,
      attached_resume: Boolean(attachment),
      day
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to send email." }, { status: 500 });
  }
}
