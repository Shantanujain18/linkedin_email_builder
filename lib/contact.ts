import nodemailer from "nodemailer";
import { getDb } from "@/lib/postgres";
import { contactSubmissions } from "@/lib/schema";

export const CONTACT_TO_EMAIL =
  process.env.CONTACT_TO_EMAIL || "shantanujain18@gmail.com";

export type ContactPayload = {
  name: string;
  email: string;
  plan?: string;
  message?: string;
  source?: string;
};

function contactSmtp() {
  const user = process.env.CONTACT_SMTP_USER || process.env.SMTP_USER || "";
  const pass = process.env.CONTACT_SMTP_PASS || process.env.SMTP_PASS || "";
  return {
    host: process.env.CONTACT_SMTP_HOST || process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.CONTACT_SMTP_PORT || process.env.SMTP_PORT || 587),
    secure: String(process.env.CONTACT_SMTP_SECURE || process.env.SMTP_SECURE || "false") === "true",
    user,
    pass,
    from: process.env.CONTACT_SMTP_FROM || process.env.SMTP_FROM || user
  };
}

export async function saveContactSubmission(payload: ContactPayload) {
  const email = payload.email.trim().toLowerCase();
  const name = payload.name.trim();
  const plan = (payload.plan || "general").trim() || "general";
  const message = (payload.message || "").trim();
  const source = (payload.source || "website").trim() || "website";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }
  if (!name) throw new Error("Enter your name.");

  const [row] = await getDb()
    .insert(contactSubmissions)
    .values({
      name,
      email,
      plan,
      message,
      source,
      createdAt: new Date().toISOString()
    })
    .returning();

  return row;
}

export async function notifyContactSubmission(payload: ContactPayload & { id?: number }) {
  const smtp = contactSmtp();
  if (!smtp.user || !smtp.pass) {
    return { sent: false, reason: "Contact SMTP is not configured on the server." };
  }

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass }
  });

  const subject = `[ReachPod] ${payload.plan || "Contact"} inquiry from ${payload.name}`;
  const body = [
    `New ReachPod contact submission`,
    ``,
    `ID: ${payload.id ?? "n/a"}`,
    `Name: ${payload.name}`,
    `Email: ${payload.email}`,
    `Interest: ${payload.plan || "general"}`,
    `Source: ${payload.source || "website"}`,
    ``,
    `Message:`,
    payload.message || "(none)",
    ``,
    `Reply directly to ${payload.email}.`
  ].join("\n");

  await transporter.sendMail({
    from: smtp.from || smtp.user,
    to: CONTACT_TO_EMAIL,
    replyTo: payload.email,
    subject,
    text: body
  });

  return { sent: true as const };
}
