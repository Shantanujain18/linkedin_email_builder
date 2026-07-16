import { isUser, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { csvEscape } from "@/lib/csv";

export const runtime = "nodejs";

export async function GET() {
  const user = await requireUser();
  if (!isUser(user)) return user;

  const rows = db.prepare(`SELECT p.posted_by, p.posted_by_url, p.posted_date, p.posted_content, p.post_url,
    d.recipient_email, d.subject, d.body, d.status, d.created_at
    FROM email_drafts d JOIN linkedin_posts p ON p.id = d.post_id
    WHERE d.user_id = ? ORDER BY d.id DESC`).all(user.id) as Array<Record<string, unknown>>;
  const fields = ["posted_by", "posted_by_url", "posted_date", "posted_content", "post_url", "recipient_email", "subject", "body", "status", "created_at"];
  const csv = [fields.join(","), ...rows.map((row) => fields.map((field) => csvEscape(row[field])).join(","))].join("\r\n");
  return new Response(`\uFEFF${csv}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="linkedin_email_drafts.csv"` } });
}
