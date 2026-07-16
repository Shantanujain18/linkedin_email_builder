import { NextResponse } from "next/server";
import fs from "node:fs";
import {
  db,
  emailedTodaySet,
  getProfile,
  getSmtpSettings,
  normalizeEmail,
  now,
  recordEmailSent,
  repliedEmailSet,
  todayKey,
  wasEmailedToday
} from "@/lib/db";
import { sendMail } from "@/lib/mail";

export const runtime = "nodejs";

type DraftRow = {
  id: number;
  recipient_email: string;
  subject: string;
  body: string;
  status: string;
  replied?: number;
};

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const smtp = getSmtpSettings();
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

    let drafts: DraftRow[];
    if (sendAll) {
      drafts = db
        .prepare(`SELECT id, recipient_email, subject, body, status, replied FROM email_drafts
          WHERE status != 'sent' AND coalesce(replied, 0) = 0 ORDER BY id ASC`)
        .all() as DraftRow[];
    } else if (draftIds.length) {
      const placeholders = draftIds.map(() => "?").join(",");
      drafts = db
        .prepare(`SELECT id, recipient_email, subject, body, status, replied FROM email_drafts
          WHERE id IN (${placeholders}) AND status != 'sent' AND coalesce(replied, 0) = 0 ORDER BY id ASC`)
        .all(...draftIds) as DraftRow[];
    } else {
      const draft = db
        .prepare("SELECT id, recipient_email, subject, body, status, replied FROM email_drafts WHERE id = ?")
        .get(draftId) as DraftRow | undefined;
      drafts = draft ? [draft] : [];
    }

    if (!drafts.length) {
      return NextResponse.json({ error: sendAll ? "No unsent drafts to send." : "Draft not found or marked as replied." }, { status: 404 });
    }

    const profile = getProfile();
    const attachment =
      attachResume && profile?.resume_path && fs.existsSync(String(profile.resume_path))
        ? {
            filename: String(profile.resume_filename || "resume.pdf"),
            path: String(profile.resume_path),
            contentType: String(profile.resume_mime || "") || undefined
          }
        : null;

    if (attachResume && !attachment) {
      return NextResponse.json({
        error: "Attach resume is enabled, but no resume file is stored. Re-upload the resume first."
      }, { status: 400 });
    }

    const day = todayKey();
    const alreadyToday = emailedTodaySet(day);
    const repliedEmails = repliedEmailSet();
    const sentThisRun = new Set<string>();

    let sent = 0;
    let skipped = 0;
    const errors: Array<{ id: number; error: string }> = [];
    const skippedDrafts: Array<{ id: number; email: string; reason: string }> = [];

    for (const draft of drafts) {
      const email = normalizeEmail(draft.recipient_email);
      if (!email) {
        skipped += 1;
        skippedDrafts.push({ id: draft.id, email: draft.recipient_email, reason: "Missing recipient email." });
        continue;
      }

      if (Number(draft.replied) === 1 || repliedEmails.has(email)) {
        skipped += 1;
        skippedDrafts.push({
          id: draft.id,
          email,
          reason: "Recipient marked as replied — automation blocked."
        });
        continue;
      }

      if (alreadyToday.has(email) || sentThisRun.has(email) || wasEmailedToday(email, day)) {
        skipped += 1;
        skippedDrafts.push({
          id: draft.id,
          email,
          reason: "Already emailed this address today."
        });
        db.prepare("UPDATE email_drafts SET status = 'skipped', updated_at = ? WHERE id = ? AND status != 'sent'").run(
          now(),
          draft.id
        );
        continue;
      }

      try {
        await sendMail({
          smtp,
          to: draft.recipient_email,
          subject: draft.subject,
          body: draft.body,
          attachment
        });
        const timestamp = now();
        db.prepare("UPDATE email_drafts SET status = 'sent', updated_at = ? WHERE id = ?").run(timestamp, draft.id);
        recordEmailSent(email, draft.id, day);
        alreadyToday.add(email);
        sentThisRun.add(email);
        sent += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Send failed.";
        db.prepare("UPDATE email_drafts SET status = 'failed', updated_at = ? WHERE id = ?").run(now(), draft.id);
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
