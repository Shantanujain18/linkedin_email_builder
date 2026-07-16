import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const databasePath = process.env.DATABASE_PATH || "./data/email_sender.sqlite";
const absolutePath = path.isAbsolute(databasePath)
  ? databasePath
  : path.join(process.cwd(), databasePath);

export const dataDir = path.dirname(absolutePath);
export const resumesDir = path.join(dataDir, "resumes");

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(resumesDir, { recursive: true });

const globalForDb = globalThis as unknown as { emailSenderDb?: Database.Database };
export const db = globalForDb.emailSenderDb ?? new Database(absolutePath);
if (process.env.NODE_ENV !== "production") globalForDb.emailSenderDb = db;

db.pragma("busy_timeout = 5000");
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
  CREATE TABLE IF NOT EXISTS candidate_profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT NOT NULL DEFAULT '',
    yoe TEXT NOT NULL DEFAULT '',
    top_skills TEXT NOT NULL DEFAULT '',
    current_role TEXT NOT NULL DEFAULT '',
    resume_link TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    resume_text TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS linkedin_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    posted_by TEXT NOT NULL DEFAULT '', posted_by_url TEXT NOT NULL DEFAULT '',
    posted_date TEXT NOT NULL DEFAULT '', posted_content TEXT NOT NULL DEFAULT '',
    post_url TEXT NOT NULL DEFAULT '', emails_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL, UNIQUE(posted_by_url, posted_content)
  );
  CREATE TABLE IF NOT EXISTS email_drafts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL UNIQUE, recipient_email TEXT NOT NULL,
    recipient_name TEXT NOT NULL DEFAULT '', subject TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    FOREIGN KEY(post_id) REFERENCES linkedin_posts(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS smtp_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    host TEXT NOT NULL DEFAULT 'smtp.gmail.com',
    port INTEGER NOT NULL DEFAULT 587,
    secure INTEGER NOT NULL DEFAULT 0,
    user TEXT NOT NULL DEFAULT '',
    pass TEXT NOT NULL DEFAULT '',
    from_email TEXT NOT NULL DEFAULT '',
    from_name TEXT NOT NULL DEFAULT '',
    attach_resume INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS email_send_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient_email TEXT NOT NULL,
    sent_on TEXT NOT NULL,
    draft_id INTEGER,
    sent_at TEXT NOT NULL,
    UNIQUE(recipient_email, sent_on)
  );
  CREATE TABLE IF NOT EXISTS draft_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    draft_id INTEGER NOT NULL,
    note TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(draft_id) REFERENCES email_drafts(id) ON DELETE CASCADE
  );
`);

function ensureColumn(table: string, column: string, definition: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((col) => col.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn("candidate_profile", "resume_filename", "TEXT NOT NULL DEFAULT ''");
ensureColumn("candidate_profile", "resume_mime", "TEXT NOT NULL DEFAULT ''");
ensureColumn("candidate_profile", "resume_path", "TEXT NOT NULL DEFAULT ''");
ensureColumn("candidate_profile", "immediate_joiner", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("email_drafts", "phone", "TEXT NOT NULL DEFAULT ''");
ensureColumn("email_drafts", "location", "TEXT NOT NULL DEFAULT ''");
ensureColumn("email_drafts", "company", "TEXT NOT NULL DEFAULT ''");
ensureColumn("email_drafts", "contact_name", "TEXT NOT NULL DEFAULT ''");
ensureColumn("email_drafts", "hiring_summary", "TEXT NOT NULL DEFAULT ''");
ensureColumn("email_drafts", "talking_points", "TEXT NOT NULL DEFAULT ''");
ensureColumn("email_drafts", "job_post", "TEXT NOT NULL DEFAULT ''");
ensureColumn("email_drafts", "matched_skills", "TEXT NOT NULL DEFAULT ''");
ensureColumn("email_drafts", "called", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("email_drafts", "called_at", "TEXT NOT NULL DEFAULT ''");
ensureColumn("email_drafts", "replied", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("email_drafts", "replied_at", "TEXT NOT NULL DEFAULT ''");

export type DraftNote = {
  id: number;
  draft_id: number;
  note: string;
  created_at: string;
};

export function getNotesForDraft(draftId: number): DraftNote[] {
  return db
    .prepare("SELECT id, draft_id, note, created_at FROM draft_notes WHERE draft_id = ? ORDER BY id DESC")
    .all(draftId) as DraftNote[];
}

export function getNotesByDraftIds(draftIds: number[]): Record<number, DraftNote[]> {
  const map: Record<number, DraftNote[]> = {};
  for (const id of draftIds) map[id] = [];
  if (!draftIds.length) return map;
  const placeholders = draftIds.map(() => "?").join(",");
  const rows = db
    .prepare(`SELECT id, draft_id, note, created_at FROM draft_notes WHERE draft_id IN (${placeholders}) ORDER BY id DESC`)
    .all(...draftIds) as DraftNote[];
  for (const row of rows) {
    if (!map[row.draft_id]) map[row.draft_id] = [];
    map[row.draft_id].push(row);
  }
  return map;
}

export function addDraftNote(draftId: number, note: string) {
  const text = String(note || "").trim();
  if (!text) throw new Error("Note cannot be empty.");
  const createdAt = now();
  const result = db.prepare("INSERT INTO draft_notes (draft_id, note, created_at) VALUES (?, ?, ?)").run(draftId, text, createdAt);
  return db.prepare("SELECT id, draft_id, note, created_at FROM draft_notes WHERE id = ?").get(result.lastInsertRowid) as DraftNote;
}

export function deleteDraftNote(noteId: number) {
  return db.prepare("DELETE FROM draft_notes WHERE id = ?").run(noteId).changes;
}

export function repliedEmailSet() {
  const rows = db
    .prepare("SELECT DISTINCT lower(trim(recipient_email)) AS email FROM email_drafts WHERE replied = 1")
    .all() as Array<{ email: string }>;
  return new Set(rows.map((row) => normalizeEmail(row.email)).filter(Boolean));
}

export function setDraftReplied(draftId: number, replied: boolean) {
  const draft = db.prepare("SELECT id, recipient_email FROM email_drafts WHERE id = ?").get(draftId) as
    | { id: number; recipient_email: string }
    | undefined;
  if (!draft) return null;
  const timestamp = now();
  const email = normalizeEmail(draft.recipient_email);
  // Mark all drafts for this email so automation never emails them again.
  if (email) {
    db.prepare(`UPDATE email_drafts
      SET replied = ?, replied_at = CASE WHEN ? = 1 THEN ? ELSE '' END, updated_at = ?
      WHERE lower(trim(recipient_email)) = ?`).run(replied ? 1 : 0, replied ? 1 : 0, timestamp, timestamp, email);
  } else {
    db.prepare(`UPDATE email_drafts
      SET replied = ?, replied_at = ?, updated_at = ?
      WHERE id = ?`).run(replied ? 1 : 0, replied ? timestamp : "", timestamp, draftId);
  }
  return db.prepare(`SELECT id, recipient_email, recipient_name, subject, body, status,
    phone, location, company, contact_name, hiring_summary, talking_points, job_post, matched_skills,
    called, called_at, replied, replied_at
    FROM email_drafts WHERE id = ?`).get(draftId) as Record<string, unknown>;
}

export type SmtpSettings = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from_email: string;
  from_name: string;
  attach_resume: boolean;
};

export function now() {
  return new Date().toISOString();
}

/** Calendar day key in the server's local timezone (YYYY-MM-DD). */
export function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizeEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

export function wasEmailedToday(email: string, day = todayKey()) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const row = db
    .prepare("SELECT id FROM email_send_log WHERE recipient_email = ? AND sent_on = ?")
    .get(normalized, day);
  return Boolean(row);
}

export function recordEmailSent(email: string, draftId: number | null, day = todayKey()) {
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  db.prepare(`INSERT INTO email_send_log (recipient_email, sent_on, draft_id, sent_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(recipient_email, sent_on) DO UPDATE SET draft_id = excluded.draft_id, sent_at = excluded.sent_at
  `).run(normalized, day, draftId, now());
}

export function emailedTodaySet(day = todayKey()) {
  const rows = db.prepare("SELECT recipient_email FROM email_send_log WHERE sent_on = ?").all(day) as Array<{
    recipient_email: string;
  }>;
  return new Set(rows.map((row) => normalizeEmail(row.recipient_email)));
}

export function getProfile() {
  return db.prepare("SELECT * FROM candidate_profile WHERE id = 1").get() as Record<string, string> | undefined;
}

export function getPublicProfile() {
  const row = getProfile();
  if (!row) return null;
  const { resume_text: _resumeText, resume_path: _resumePath, ...rest } = row;
  return {
    ...rest,
    immediate_joiner: Number(row.immediate_joiner) === 1,
    has_resume_file: Boolean(row.resume_path && fs.existsSync(String(row.resume_path)))
  };
}

export function setImmediateJoiner(value: boolean) {
  return updateProfile({ immediate_joiner: value });
}

export function updateProfile(fields: { immediate_joiner?: boolean; top_skills?: string }) {
  const existing = getProfile();
  if (!existing) return null;

  const updates: string[] = [];
  const values: Array<string | number> = [];

  if (typeof fields.immediate_joiner === "boolean") {
    updates.push("immediate_joiner = ?");
    values.push(fields.immediate_joiner ? 1 : 0);
  }
  if (typeof fields.top_skills === "string") {
    updates.push("top_skills = ?");
    values.push(fields.top_skills.trim());
  }
  if (!updates.length) return getPublicProfile();

  updates.push("updated_at = ?");
  values.push(now());
  values.push(1);
  db.prepare(`UPDATE candidate_profile SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  return getPublicProfile();
}

export function getPosts() {
  return db.prepare("SELECT * FROM linkedin_posts ORDER BY id DESC").all() as Array<Record<string, string | number>>;
}

export function clearDrafts() {
  const result = db.transaction(() => {
    db.prepare("DELETE FROM draft_notes").run();
    return db.prepare("DELETE FROM email_drafts").run();
  })();
  return result.changes;
}

export function deleteDraftsByIds(ids: number[]) {
  const unique = Array.from(new Set(ids.filter((id) => Number.isFinite(id) && id > 0)));
  if (!unique.length) return 0;
  const placeholders = unique.map(() => "?").join(",");
  const result = db.transaction(() => {
    db.prepare(`DELETE FROM draft_notes WHERE draft_id IN (${placeholders})`).run(...unique);
    return db.prepare(`DELETE FROM email_drafts WHERE id IN (${placeholders})`).run(...unique);
  })();
  return result.changes;
}

export function getSmtpSettings(): SmtpSettings | null {
  const row = db.prepare("SELECT * FROM smtp_settings WHERE id = 1").get() as
    | {
        host: string;
        port: number;
        secure: number;
        user: string;
        pass: string;
        from_email: string;
        from_name: string;
        attach_resume: number;
      }
    | undefined;
  if (!row) return null;
  return {
    host: row.host || "smtp.gmail.com",
    port: Number(row.port) || 587,
    secure: Boolean(row.secure),
    user: row.user || "",
    pass: row.pass || "",
    from_email: row.from_email || row.user || "",
    from_name: row.from_name || "",
    attach_resume: row.attach_resume !== 0
  };
}

export function saveSmtpSettings(input: {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass?: string;
  from_email: string;
  from_name: string;
  attach_resume: boolean;
}) {
  const existing = getSmtpSettings();
  const pass = input.pass?.trim() ? input.pass.trim() : existing?.pass || "";
  db.prepare(`INSERT INTO smtp_settings
    (id, host, port, secure, user, pass, from_email, from_name, attach_resume, updated_at)
    VALUES (1, @host, @port, @secure, @user, @pass, @from_email, @from_name, @attach_resume, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      host=@host, port=@port, secure=@secure, user=@user, pass=@pass,
      from_email=@from_email, from_name=@from_name, attach_resume=@attach_resume, updated_at=@updated_at
  `).run({
    host: input.host.trim() || "smtp.gmail.com",
    port: input.port || 587,
    secure: input.secure ? 1 : 0,
    user: input.user.trim(),
    pass,
    from_email: input.from_email.trim() || input.user.trim(),
    from_name: input.from_name.trim(),
    attach_resume: input.attach_resume ? 1 : 0,
    updated_at: now()
  });
  return getSmtpSettings();
}

export function getPublicSmtpSettings() {
  const settings = getSmtpSettings();
  if (!settings) {
    return {
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      user: "",
      from_email: "",
      from_name: "",
      attach_resume: true,
      configured: false,
      has_password: false
    };
  }
  return {
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    user: settings.user,
    from_email: settings.from_email,
    from_name: settings.from_name,
    attach_resume: settings.attach_resume,
    configured: Boolean(settings.user && settings.pass),
    has_password: Boolean(settings.pass)
  };
}
