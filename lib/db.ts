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

export function getProfile() {
  return db.prepare("SELECT * FROM candidate_profile WHERE id = 1").get() as Record<string, string> | undefined;
}

export function getPublicProfile() {
  const row = getProfile();
  if (!row) return null;
  const { resume_text: _resumeText, resume_path: _resumePath, ...rest } = row;
  return {
    ...rest,
    has_resume_file: Boolean(row.resume_path && fs.existsSync(String(row.resume_path)))
  };
}

export function getPosts() {
  return db.prepare("SELECT * FROM linkedin_posts ORDER BY id DESC").all() as Array<Record<string, string | number>>;
}

export function clearDrafts() {
  const result = db.prepare("DELETE FROM email_drafts").run();
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
