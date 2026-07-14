import { NextResponse } from "next/server";
import fs from "node:fs";
import { db, getProfile, getSmtpSettings, now } from "@/lib/db";
import { sendMail } from "@/lib/mail";

export const runtime = "nodejs";

type DraftRow = {
  id: number;
  recipient_email: string;
  subject: string;
  body: string;
  status: string;
};

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const smtp = getSmtpSettings();
    if (!smtp?.user || !smtp.pass) {
      return NextResponse.json({ error: "Configure SMTP details (email + App Password) first." }, { status: 400 });
    }

    const draftId = body.draftId != null ? Number(body.draftId) : null;
    const sendAll = Boolean(body.all);
    if (!sendAll && (!draftId || !Number.isFinite(draftId))) {
      return NextResponse.json({ error: "Provide draftId or set all=true." }, { status: 400 });
    }

    const attachResume =
      body.attach_resume === undefined ? smtp.attach_resume : Boolean(body.attach_resume);

    let drafts: DraftRow[];
    if (sendAll) {
      drafts = db
        .prepare("SELECT id, recipient_email, subject, body, status FROM email_drafts WHERE status != 'sent' ORDER BY id ASC")
        .all() as DraftRow[];
    } else {
      const draft = db
        .prepare("SELECT id, recipient_email, subject, body, status FROM email_drafts WHERE id = ?")
        .get(draftId) as DraftRow | undefined;
      drafts = draft ? [draft] : [];
    }

    if (!drafts.length) {
      return NextResponse.json({ error: sendAll ? "No unsent drafts to send." : "Draft not found." }, { status: 404 });
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

    let sent = 0;
    const errors: Array<{ id: number; error: string }> = [];

    for (const draft of drafts) {
      try {
        await sendMail({
          smtp,
          to: draft.recipient_email,
          subject: draft.subject,
          body: draft.body,
          attachment
        });
        db.prepare("UPDATE email_drafts SET status = 'sent', updated_at = ? WHERE id = ?").run(now(), draft.id);
        sent += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Send failed.";
        db.prepare("UPDATE email_drafts SET status = 'failed', updated_at = ? WHERE id = ?").run(now(), draft.id);
        errors.push({ id: draft.id, error: message });
      }
    }

    return NextResponse.json({
      sent,
      failed: errors.length,
      errors,
      attached_resume: Boolean(attachment)
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to send email." }, { status: 500 });
  }
}
