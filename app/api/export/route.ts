import { isUser, requireUser } from "@/lib/auth";
import { exportDraftRows } from "@/lib/db";
import { csvEscape } from "@/lib/csv";

export const runtime = "nodejs";

export async function GET() {
  const user = await requireUser();
  if (!isUser(user)) return user;

  const rows = await exportDraftRows(user.id);
  const fields = ["posted_by", "posted_by_url", "posted_date", "posted_content", "post_url", "recipient_email", "subject", "body", "status", "created_at"];
  const csv = [fields.join(","), ...rows.map((row) => fields.map((field) => csvEscape((row as Record<string, unknown>)[field])).join(","))].join("\r\n");
  return new Response(`\uFEFF${csv}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="linkedin_email_drafts.csv"` } });
}
