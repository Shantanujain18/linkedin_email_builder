import { NextResponse } from "next/server";
import { notifyContactSubmission, saveContactSubmission } from "@/lib/contact";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      email?: string;
      plan?: string;
      message?: string;
      source?: string;
    };

    const saved = await saveContactSubmission({
      name: String(body.name || ""),
      email: String(body.email || ""),
      plan: String(body.plan || "general"),
      message: String(body.message || ""),
      source: String(body.source || "website")
    });

    let emailSent = false;
    let emailWarning = "";
    try {
      const notify = await notifyContactSubmission({
        id: saved.id,
        name: saved.name,
        email: saved.email,
        plan: saved.plan,
        message: saved.message,
        source: saved.source
      });
      emailSent = notify.sent;
      if (!notify.sent) emailWarning = notify.reason || "";
    } catch (error) {
      emailWarning = error instanceof Error ? error.message : "Could not send notification email.";
    }

    return NextResponse.json({
      ok: true,
      id: saved.id,
      email_sent: emailSent,
      email_warning: emailWarning || undefined,
      message: emailSent
        ? "Thanks — we got your message and will reply soon."
        : "Thanks — your message was saved. We will follow up by email."
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not submit contact form." },
      { status: 400 }
    );
  }
}
