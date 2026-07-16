import { NextResponse } from "next/server";
import { isUser, requireUser } from "@/lib/auth";
import { getPublicSmtpSettings, saveSmtpSettings } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const user = await requireUser();
  if (!isUser(user)) return user;
  return NextResponse.json({ smtp: getPublicSmtpSettings(user.id) });
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!isUser(user)) return user;

    const body = await request.json();
    const host = String(body.host || "smtp.gmail.com").trim();
    const port = Number(body.port) || 587;
    const smtpUser = String(body.user || "").trim();
    if (!smtpUser) return NextResponse.json({ error: "SMTP user / email is required." }, { status: 400 });
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      return NextResponse.json({ error: "SMTP port must be between 1 and 65535." }, { status: 400 });
    }

    const existing = getPublicSmtpSettings(user.id);
    const pass = typeof body.pass === "string" ? body.pass : "";
    if (!pass.trim() && !existing.has_password) {
      return NextResponse.json({ error: "App Password is required." }, { status: 400 });
    }

    saveSmtpSettings(user.id, {
      host,
      port,
      secure: Boolean(body.secure) || port === 465,
      user: smtpUser,
      pass: pass.trim() || undefined,
      from_email: String(body.from_email || smtpUser).trim(),
      from_name: String(body.from_name || "").trim(),
      attach_resume: body.attach_resume !== false && body.attach_resume !== 0 && body.attach_resume !== "0"
    });

    return NextResponse.json({ smtp: getPublicSmtpSettings(user.id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to save SMTP settings." }, { status: 500 });
  }
}
