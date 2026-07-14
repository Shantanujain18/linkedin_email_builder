import fs from "node:fs";
import nodemailer from "nodemailer";
import type { SmtpSettings } from "./db";

export async function sendMail(options: {
  smtp: SmtpSettings;
  to: string;
  subject: string;
  body: string;
  attachment?: { filename: string; path: string; contentType?: string } | null;
}) {
  const { smtp, to, subject, body, attachment } = options;
  if (!smtp.user || !smtp.pass) {
    throw new Error("Save SMTP user and App Password before sending.");
  }

  const transporter = nodemailer.createTransport({
    host: smtp.host || "smtp.gmail.com",
    port: smtp.port || 587,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass }
  });

  const attachments =
    attachment && attachment.path && fs.existsSync(attachment.path)
      ? [
          {
            filename: attachment.filename || "resume.pdf",
            path: attachment.path,
            contentType: attachment.contentType || undefined
          }
        ]
      : [];

  await transporter.sendMail({
    from: smtp.from_name
      ? `"${smtp.from_name}" <${smtp.from_email || smtp.user}>`
      : smtp.from_email || smtp.user,
    to,
    subject,
    text: body,
    attachments
  });
}
