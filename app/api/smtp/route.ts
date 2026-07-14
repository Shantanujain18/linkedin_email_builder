import { NextResponse } from "next/server";
import { getPublicSmtpSettings, saveSmtpSettings } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ smtp: getPublicSmtpSettings() });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const host = String(body.host || "smtp.gmail.com").trim();
    const port = Number(body.port) || 587;
    const user = String(body.user || "").trim();
    if (!user) return NextResponse.json({ error: "SMTP user / email is required." }, { status: 400 });
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      return NextResponse.json({ error: "SMTP port must be between 1 and 65535." }, { status: 400 });
    }

    const existing = getPublicSmtpSettings();
    const pass = typeof body.pass === "string" ? body.pass : "";
    if (!pass.trim() && !existing.has_password) {
      return NextResponse.json({ error: "App Password is required." }, { status: 400 });
    }

    saveSmtpSettings({
      host,
      port,
      secure: Boolean(body.secure) || port === 465,
      user,
      pass: pass.trim() || undefined,
      from_email: String(body.from_email || user).trim(),
      from_name: String(body.from_name || "").trim(),
      attach_resume: body.attach_resume !== false && body.attach_resume !== 0 && body.attach_resume !== "0"
    });

    return NextResponse.json({ smtp: getPublicSmtpSettings() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to save SMTP settings." }, { status: 500 });
  }
}
