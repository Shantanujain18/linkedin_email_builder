import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const databasePath = process.env.DATABASE_PATH || "./data/email_sender.sqlite";
const absolutePath = path.isAbsolute(databasePath)
  ? databasePath
  : path.join(process.cwd(), databasePath);

fs.mkdirSync(path.dirname(absolutePath), { recursive: true });

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
`);

export function now() {
  return new Date().toISOString();
}

export function getProfile() {
  return db.prepare("SELECT * FROM candidate_profile WHERE id = 1").get() as Record<string, string> | undefined;
}

export function getPosts() {
  return db.prepare("SELECT * FROM linkedin_posts ORDER BY id DESC").all() as Array<Record<string, string | number>>;
}
