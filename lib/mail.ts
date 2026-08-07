import nodemailer from "nodemailer";
import type { SmtpSettings } from "./db";

export type MailTransporter = ReturnType<typeof nodemailer.createTransport>;

export function createMailTransport(smtp: SmtpSettings): MailTransporter {
  if (!smtp.user || !smtp.pass) {
    throw new Error("Save SMTP user and App Password before sending.");
  }
  return nodemailer.createTransport({
    host: smtp.host || "smtp.gmail.com",
    port: smtp.port || 587,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass }
  });
}

export async function sendMailWith(
  transporter: MailTransporter,
  options: {
    smtp: SmtpSettings;
    to: string;
    subject: string;
    body: string;
    attachment?: { filename: string; content: Buffer; contentType?: string } | null;
  }
) {
  const { smtp, to, subject, body, attachment } = options;
  const attachments =
    attachment && attachment.content?.length
      ? [
          {
            filename: attachment.filename || "resume.pdf",
            content: attachment.content,
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

export async function sendMail(options: {
  smtp: SmtpSettings;
  to: string;
  subject: string;
  body: string;
  attachment?: { filename: string; content: Buffer; contentType?: string } | null;
}) {
  const transporter = createMailTransport(options.smtp);
  await sendMailWith(transporter, options);
}
