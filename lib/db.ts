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

function tableExists(name: string) {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(name) as
    | { name: string }
    | undefined;
  return Boolean(row);
}

function ensureColumn(table: string, column: string, definition: string) {
  if (!tableExists(table)) return;
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((col) => col.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function hasColumn(table: string, column: string) {
  if (!tableExists(table)) return false;
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return cols.some((col) => col.name === column);
}

/** One-time migration from single-user schema to per-user tables. */
function migrateToMultiUser() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // candidate_profile: was singleton id=1 → now keyed by user_id
  if (tableExists("candidate_profile") && hasColumn("candidate_profile", "id") && !hasColumn("candidate_profile", "user_id")) {
    db.exec(`
      CREATE TABLE candidate_profile_new (
        user_id INTEGER PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        yoe TEXT NOT NULL DEFAULT '',
        top_skills TEXT NOT NULL DEFAULT '',
        current_role TEXT NOT NULL DEFAULT '',
        resume_link TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        resume_text TEXT NOT NULL DEFAULT '',
        resume_filename TEXT NOT NULL DEFAULT '',
        resume_mime TEXT NOT NULL DEFAULT '',
        resume_path TEXT NOT NULL DEFAULT '',
        immediate_joiner INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );
      INSERT INTO candidate_profile_new (
        user_id, name, yoe, top_skills, current_role, resume_link, phone, email, resume_text,
        resume_filename, resume_mime, resume_path, immediate_joiner, updated_at
      )
      SELECT 1,
        COALESCE(name,''), COALESCE(yoe,''), COALESCE(top_skills,''), COALESCE(current_role,''),
        COALESCE(resume_link,''), COALESCE(phone,''), COALESCE(email,''), COALESCE(resume_text,''),
        COALESCE(resume_filename,''), COALESCE(resume_mime,''), COALESCE(resume_path,''),
        COALESCE(immediate_joiner,0), COALESCE(updated_at, datetime('now'))
      FROM candidate_profile;
      DROP TABLE candidate_profile;
      ALTER TABLE candidate_profile_new RENAME TO candidate_profile;
    `);
  }

  if (!tableExists("candidate_profile")) {
    db.exec(`
      CREATE TABLE candidate_profile (
        user_id INTEGER PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        yoe TEXT NOT NULL DEFAULT '',
        top_skills TEXT NOT NULL DEFAULT '',
        current_role TEXT NOT NULL DEFAULT '',
        resume_link TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        resume_text TEXT NOT NULL DEFAULT '',
        resume_filename TEXT NOT NULL DEFAULT '',
        resume_mime TEXT NOT NULL DEFAULT '',
        resume_path TEXT NOT NULL DEFAULT '',
        immediate_joiner INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );
    `);
  }

  // smtp_settings: singleton → per user
  if (tableExists("smtp_settings") && hasColumn("smtp_settings", "id") && !hasColumn("smtp_settings", "user_id")) {
    db.exec(`
      CREATE TABLE smtp_settings_new (
        user_id INTEGER PRIMARY KEY,
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
      INSERT INTO smtp_settings_new (
        user_id, host, port, secure, user, pass, from_email, from_name, attach_resume, updated_at
      )
      SELECT 1,
        COALESCE(host,'smtp.gmail.com'), COALESCE(port,587), COALESCE(secure,0),
        COALESCE(user,''), COALESCE(pass,''), COALESCE(from_email,''), COALESCE(from_name,''),
        COALESCE(attach_resume,1), COALESCE(updated_at, datetime('now'))
      FROM smtp_settings;
      DROP TABLE smtp_settings;
      ALTER TABLE smtp_settings_new RENAME TO smtp_settings;
    `);
  }

  if (!tableExists("smtp_settings")) {
    db.exec(`
      CREATE TABLE smtp_settings (
        user_id INTEGER PRIMARY KEY,
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
  }

  // linkedin_posts: rebuild unique constraint to include user_id.
  // Foreign keys must be off: DROP would CASCADE-delete email_drafts otherwise.
  if (tableExists("linkedin_posts") && !hasColumn("linkedin_posts", "user_id")) {
    db.pragma("foreign_keys = OFF");
    db.exec(`
      CREATE TABLE linkedin_posts_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL DEFAULT 1,
        posted_by TEXT NOT NULL DEFAULT '',
        posted_by_url TEXT NOT NULL DEFAULT '',
        posted_date TEXT NOT NULL DEFAULT '',
        posted_content TEXT NOT NULL DEFAULT '',
        post_url TEXT NOT NULL DEFAULT '',
        emails_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        UNIQUE(user_id, posted_by_url, posted_content)
      );
      INSERT INTO linkedin_posts_new (
        id, user_id, posted_by, posted_by_url, posted_date, posted_content, post_url, emails_json, created_at
      )
      SELECT id, 1, posted_by, posted_by_url, posted_date, posted_content, post_url, emails_json, created_at
      FROM linkedin_posts;
      DROP TABLE linkedin_posts;
      ALTER TABLE linkedin_posts_new RENAME TO linkedin_posts;
    `);
    db.pragma("foreign_keys = ON");
  } else if (!tableExists("linkedin_posts")) {
    db.exec(`
      CREATE TABLE linkedin_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        posted_by TEXT NOT NULL DEFAULT '',
        posted_by_url TEXT NOT NULL DEFAULT '',
        posted_date TEXT NOT NULL DEFAULT '',
        posted_content TEXT NOT NULL DEFAULT '',
        post_url TEXT NOT NULL DEFAULT '',
        emails_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        UNIQUE(user_id, posted_by_url, posted_content)
      );
    `);
  }

  if (tableExists("email_drafts") && !hasColumn("email_drafts", "user_id")) {
    ensureColumn("email_drafts", "user_id", "INTEGER NOT NULL DEFAULT 1");
  } else if (!tableExists("email_drafts")) {
    db.exec(`
      CREATE TABLE email_drafts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        post_id INTEGER NOT NULL,
        recipient_email TEXT NOT NULL,
        recipient_name TEXT NOT NULL DEFAULT '',
        subject TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'draft',
        phone TEXT NOT NULL DEFAULT '',
        location TEXT NOT NULL DEFAULT '',
        company TEXT NOT NULL DEFAULT '',
        contact_name TEXT NOT NULL DEFAULT '',
        hiring_summary TEXT NOT NULL DEFAULT '',
        talking_points TEXT NOT NULL DEFAULT '',
        job_post TEXT NOT NULL DEFAULT '',
        matched_skills TEXT NOT NULL DEFAULT '',
        called INTEGER NOT NULL DEFAULT 0,
        called_at TEXT NOT NULL DEFAULT '',
        replied INTEGER NOT NULL DEFAULT 0,
        replied_at TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(user_id, post_id),
        FOREIGN KEY(post_id) REFERENCES linkedin_posts(id) ON DELETE CASCADE
      );
    `);
  }

  // Rebuild email_drafts unique(post_id) → unique(user_id, post_id) if needed
  if (tableExists("email_drafts") && hasColumn("email_drafts", "user_id")) {
    const indexes = db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='email_drafts'").all() as Array<{ sql: string | null }>;
    const hasOldUnique = indexes.some((row) => row.sql && /UNIQUE\s*\(\s*post_id\s*\)/i.test(row.sql));
    // Also check table SQL for inline UNIQUE(post_id)
    const tableSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='email_drafts'").get() as { sql?: string } | undefined)?.sql || "";
    if (/UNIQUE\s*\(\s*post_id\s*\)/i.test(tableSql) || hasOldUnique) {
      db.pragma("foreign_keys = OFF");
      db.exec(`
        CREATE TABLE email_drafts_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL DEFAULT 1,
          post_id INTEGER NOT NULL,
          recipient_email TEXT NOT NULL,
          recipient_name TEXT NOT NULL DEFAULT '',
          subject TEXT NOT NULL DEFAULT '',
          body TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'draft',
          phone TEXT NOT NULL DEFAULT '',
          location TEXT NOT NULL DEFAULT '',
          company TEXT NOT NULL DEFAULT '',
          contact_name TEXT NOT NULL DEFAULT '',
          hiring_summary TEXT NOT NULL DEFAULT '',
          talking_points TEXT NOT NULL DEFAULT '',
          job_post TEXT NOT NULL DEFAULT '',
          matched_skills TEXT NOT NULL DEFAULT '',
          called INTEGER NOT NULL DEFAULT 0,
          called_at TEXT NOT NULL DEFAULT '',
          replied INTEGER NOT NULL DEFAULT 0,
          replied_at TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(user_id, post_id),
          FOREIGN KEY(post_id) REFERENCES linkedin_posts(id) ON DELETE CASCADE
        );
        INSERT INTO email_drafts_new (
          id, user_id, post_id, recipient_email, recipient_name, subject, body, status,
          phone, location, company, contact_name, hiring_summary, talking_points, job_post, matched_skills,
          called, called_at, replied, replied_at, created_at, updated_at
        )
        SELECT id, COALESCE(user_id,1), post_id, recipient_email, recipient_name, subject, body, status,
          COALESCE(phone,''), COALESCE(location,''), COALESCE(company,''), COALESCE(contact_name,''),
          COALESCE(hiring_summary,''), COALESCE(talking_points,''), COALESCE(job_post,''), COALESCE(matched_skills,''),
          COALESCE(called,0), COALESCE(called_at,''), COALESCE(replied,0), COALESCE(replied_at,''),
          created_at, updated_at
        FROM email_drafts;
        DROP TABLE email_drafts;
        ALTER TABLE email_drafts_new RENAME TO email_drafts;
      `);
      db.pragma("foreign_keys = ON");
    }
  }

  if (tableExists("email_send_log") && !hasColumn("email_send_log", "user_id")) {
    db.exec(`
      CREATE TABLE email_send_log_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL DEFAULT 1,
        recipient_email TEXT NOT NULL,
        sent_on TEXT NOT NULL,
        draft_id INTEGER,
        sent_at TEXT NOT NULL,
        UNIQUE(user_id, recipient_email, sent_on)
      );
      INSERT INTO email_send_log_new (id, user_id, recipient_email, sent_on, draft_id, sent_at)
      SELECT id, 1, recipient_email, sent_on, draft_id, sent_at FROM email_send_log;
      DROP TABLE email_send_log;
      ALTER TABLE email_send_log_new RENAME TO email_send_log;
    `);
  } else if (!tableExists("email_send_log")) {
    db.exec(`
      CREATE TABLE email_send_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        recipient_email TEXT NOT NULL,
        sent_on TEXT NOT NULL,
        draft_id INTEGER,
        sent_at TEXT NOT NULL,
        UNIQUE(user_id, recipient_email, sent_on)
      );
    `);
  }

  if (!tableExists("draft_notes")) {
    db.exec(`
      CREATE TABLE draft_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        draft_id INTEGER NOT NULL,
        note TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(draft_id) REFERENCES email_drafts(id) ON DELETE CASCADE
      );
    `);
  }

  // Ensure enrichment columns exist on drafts
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
  ensureColumn("candidate_profile", "resume_filename", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("candidate_profile", "resume_mime", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("candidate_profile", "resume_path", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("candidate_profile", "immediate_joiner", "INTEGER NOT NULL DEFAULT 0");
}

migrateToMultiUser();

export type User = {
  id: number;
  email: string;
  name: string;
  created_at: string;
};

export type DraftNote = {
  id: number;
  draft_id: number;
  note: string;
  created_at: string;
};

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

export function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizeEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

export function createUser(email: string, name: string, passwordHash: string): User {
  const result = db.prepare(
    "INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)"
  ).run(normalizeEmail(email), name.trim(), passwordHash, now());
  return db.prepare("SELECT id, email, name, created_at FROM users WHERE id = ?").get(result.lastInsertRowid) as User;
}

export function findUserByEmail(email: string) {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(normalizeEmail(email)) as
    | (User & { password_hash: string })
    | undefined;
}

export function findUserById(id: number) {
  return db.prepare("SELECT id, email, name, created_at FROM users WHERE id = ?").get(id) as User | undefined;
}

export function createSession(userId: number, token: string, expiresAt: string) {
  db.prepare("INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").run(
    token,
    userId,
    expiresAt,
    now()
  );
}

export function getSessionUser(token: string): User | null {
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.id, u.email, u.name, u.created_at, s.expires_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ?
  `).get(token) as (User & { expires_at: string }) | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return null;
  }
  return { id: row.id, email: row.email, name: row.name, created_at: row.created_at };
}

export function deleteSession(token: string) {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

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

export function deleteDraftNote(userId: number, noteId: number) {
  const owned = db
    .prepare(`SELECT n.id FROM draft_notes n
      JOIN email_drafts d ON d.id = n.draft_id
      WHERE n.id = ? AND d.user_id = ?`)
    .get(noteId, userId);
  if (!owned) return 0;
  return db.prepare("DELETE FROM draft_notes WHERE id = ?").run(noteId).changes;
}

export function repliedEmailSet(userId: number) {
  const rows = db
    .prepare("SELECT DISTINCT lower(trim(recipient_email)) AS email FROM email_drafts WHERE user_id = ? AND replied = 1")
    .all(userId) as Array<{ email: string }>;
  return new Set(rows.map((row) => normalizeEmail(row.email)).filter(Boolean));
}

export function setDraftReplied(userId: number, draftId: number, replied: boolean) {
  const draft = db.prepare("SELECT id, recipient_email FROM email_drafts WHERE id = ? AND user_id = ?").get(draftId, userId) as
    | { id: number; recipient_email: string }
    | undefined;
  if (!draft) return null;
  const timestamp = now();
  const email = normalizeEmail(draft.recipient_email);
  if (email) {
    db.prepare(`UPDATE email_drafts
      SET replied = ?, replied_at = CASE WHEN ? = 1 THEN ? ELSE '' END, updated_at = ?
      WHERE user_id = ? AND lower(trim(recipient_email)) = ?`).run(
      replied ? 1 : 0,
      replied ? 1 : 0,
      timestamp,
      timestamp,
      userId,
      email
    );
  } else {
    db.prepare(`UPDATE email_drafts
      SET replied = ?, replied_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ?`).run(replied ? 1 : 0, replied ? timestamp : "", timestamp, draftId, userId);
  }
  return db.prepare(`SELECT id, recipient_email, recipient_name, subject, body, status,
    phone, location, company, contact_name, hiring_summary, talking_points, job_post, matched_skills,
    called, called_at, replied, replied_at
    FROM email_drafts WHERE id = ? AND user_id = ?`).get(draftId, userId) as Record<string, unknown>;
}

export function wasEmailedToday(userId: number, email: string, day = todayKey()) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const row = db
    .prepare("SELECT id FROM email_send_log WHERE user_id = ? AND recipient_email = ? AND sent_on = ?")
    .get(userId, normalized, day);
  return Boolean(row);
}

export function recordEmailSent(userId: number, email: string, draftId: number | null, day = todayKey()) {
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  db.prepare(`INSERT INTO email_send_log (user_id, recipient_email, sent_on, draft_id, sent_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, recipient_email, sent_on) DO UPDATE SET draft_id = excluded.draft_id, sent_at = excluded.sent_at
  `).run(userId, normalized, day, draftId, now());
}

export function emailedTodaySet(userId: number, day = todayKey()) {
  const rows = db.prepare("SELECT recipient_email FROM email_send_log WHERE user_id = ? AND sent_on = ?").all(userId, day) as Array<{
    recipient_email: string;
  }>;
  return new Set(rows.map((row) => normalizeEmail(row.recipient_email)));
}

export function getProfile(userId: number) {
  return db.prepare("SELECT * FROM candidate_profile WHERE user_id = ?").get(userId) as Record<string, string> | undefined;
}

export function getPublicProfile(userId: number) {
  const row = getProfile(userId);
  if (!row) return null;
  const hasContent = Boolean(String(row.resume_text || "").trim() || row.resume_path);
  if (!hasContent) return null;
  const { resume_text: _resumeText, resume_path: _resumePath, ...rest } = row;
  return {
    ...rest,
    immediate_joiner: Number(row.immediate_joiner) === 1,
    has_resume_file: Boolean(row.resume_path && fs.existsSync(String(row.resume_path)))
  };
}

export function updateProfile(userId: number, fields: { immediate_joiner?: boolean; top_skills?: string }) {
  const existing = getProfile(userId);
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
  if (!updates.length) return getPublicProfile(userId);

  updates.push("updated_at = ?");
  values.push(now());
  values.push(userId);
  db.prepare(`UPDATE candidate_profile SET ${updates.join(", ")} WHERE user_id = ?`).run(...values);
  return getPublicProfile(userId);
}

export function getPosts(userId: number) {
  return db.prepare("SELECT * FROM linkedin_posts WHERE user_id = ? ORDER BY id DESC").all(userId) as Array<
    Record<string, string | number>
  >;
}

export function clearDrafts(userId: number) {
  const result = db.transaction(() => {
    db.prepare(`DELETE FROM draft_notes WHERE draft_id IN (SELECT id FROM email_drafts WHERE user_id = ?)`).run(userId);
    return db.prepare("DELETE FROM email_drafts WHERE user_id = ?").run(userId);
  })();
  return result.changes;
}

export function deleteDraftsByIds(userId: number, ids: number[]) {
  const unique = Array.from(new Set(ids.filter((id) => Number.isFinite(id) && id > 0)));
  if (!unique.length) return 0;
  const placeholders = unique.map(() => "?").join(",");
  const owned = db
    .prepare(`SELECT id FROM email_drafts WHERE user_id = ? AND id IN (${placeholders})`)
    .all(userId, ...unique) as Array<{ id: number }>;
  const ownedIds = owned.map((row) => row.id);
  if (!ownedIds.length) return 0;
  const ownedPlaceholders = ownedIds.map(() => "?").join(",");
  const result = db.transaction(() => {
    db.prepare(`DELETE FROM draft_notes WHERE draft_id IN (${ownedPlaceholders})`).run(...ownedIds);
    return db.prepare(`DELETE FROM email_drafts WHERE user_id = ? AND id IN (${ownedPlaceholders})`).run(userId, ...ownedIds);
  })();
  return result.changes;
}

export function getSmtpSettings(userId: number): SmtpSettings | null {
  const row = db.prepare("SELECT * FROM smtp_settings WHERE user_id = ?").get(userId) as
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

export function saveSmtpSettings(
  userId: number,
  input: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass?: string;
    from_email: string;
    from_name: string;
    attach_resume: boolean;
  }
) {
  const existing = getSmtpSettings(userId);
  const pass = input.pass?.trim() ? input.pass.trim() : existing?.pass || "";
  db.prepare(`INSERT INTO smtp_settings
    (user_id, host, port, secure, user, pass, from_email, from_name, attach_resume, updated_at)
    VALUES (@user_id, @host, @port, @secure, @user, @pass, @from_email, @from_name, @attach_resume, @updated_at)
    ON CONFLICT(user_id) DO UPDATE SET
      host=@host, port=@port, secure=@secure, user=@user, pass=@pass,
      from_email=@from_email, from_name=@from_name, attach_resume=@attach_resume, updated_at=@updated_at
  `).run({
    user_id: userId,
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
  return getSmtpSettings(userId);
}

export function getPublicSmtpSettings(userId: number) {
  const settings = getSmtpSettings(userId);
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

export function userOwnsDraft(userId: number, draftId: number) {
  return Boolean(db.prepare("SELECT id FROM email_drafts WHERE id = ? AND user_id = ?").get(draftId, userId));
}
