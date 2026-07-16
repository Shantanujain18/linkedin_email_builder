/**
 * One-off: copy local SQLite data into Supabase Postgres + Storage.
 *
 * Usage:
 *   node scripts/migrate-sqlite-to-supabase.mjs
 *   MIGRATE_PASSWORD='your-login-password' node scripts/migrate-sqlite-to-supabase.mjs
 *   MIGRATE_CLEAR=1 node scripts/migrate-sqlite-to-supabase.mjs   # wipe target user's rows first
 *
 * Requires .env.local: DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnvFile(path.join(root, ".env.local"));
loadEnvFile(path.join(root, ".env"));

const SQLITE_PATH =
  process.env.SQLITE_PATH || path.join(root, "data", "email_sender.sqlite");
const CLEAR = process.env.MIGRATE_CLEAR === "1" || process.env.MIGRATE_CLEAR === "true";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function bool(v) {
  return v === 1 || v === true || v === "1";
}

function ts(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function ensureAuthUser(admin, email, name) {
  const { data: listed, error: listErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000
  });
  if (listErr) throw listErr;
  const existing = (listed?.users || []).find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  );
  if (existing) {
    console.log(`Auth user exists: ${email} (${existing.id})`);
    return existing.id;
  }

  const password =
    process.env.MIGRATE_PASSWORD ||
    `Migrate-${Math.random().toString(36).slice(2, 10)}!A1`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: name || "" }
  });
  if (error) throw error;
  console.log(`Created auth user: ${email} (${data.user.id})`);
  if (!process.env.MIGRATE_PASSWORD) {
    console.log(`Temporary password (save this): ${password}`);
  }
  return data.user.id;
}

async function clearUserData(sql, userId) {
  console.log("Clearing existing Supabase rows for this user…");
  await sql`delete from email_send_log where user_id = ${userId}`;
  await sql`delete from email_drafts where user_id = ${userId}`;
  await sql`delete from linkedin_posts where user_id = ${userId}`;
  await sql`delete from profiles where user_id = ${userId}`;
  await sql`delete from smtp_settings where user_id = ${userId}`;
}

async function main() {
  if (!fs.existsSync(SQLITE_PATH)) {
    throw new Error(`SQLite file not found: ${SQLITE_PATH}`);
  }

  const databaseUrl = requireEnv("DATABASE_URL");
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const sqlite = new Database(SQLITE_PATH, { readonly: true });
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const users = sqlite.prepare("SELECT * FROM users").all();
  if (!users.length) throw new Error("No users in SQLite");

  let postsN = 0;
  let draftsN = 0;
  let sendN = 0;
  let notesN = 0;

  for (const user of users) {
    console.log(`\nMigrating user ${user.email} (sqlite id=${user.id})…`);
    const userId = await ensureAuthUser(admin, user.email, user.name);

    if (CLEAR) await clearUserData(sql, userId);

    const profile = sqlite
      .prepare("SELECT * FROM candidate_profile WHERE user_id = ?")
      .get(user.id);
    const smtp = sqlite
      .prepare("SELECT * FROM smtp_settings WHERE user_id = ?")
      .get(user.id);
    const posts = sqlite
      .prepare("SELECT * FROM linkedin_posts WHERE user_id = ? ORDER BY id")
      .all(user.id);
    const drafts = sqlite
      .prepare("SELECT * FROM email_drafts WHERE user_id = ? ORDER BY id")
      .all(user.id);
    const sendLog = sqlite
      .prepare("SELECT * FROM email_send_log WHERE user_id = ? ORDER BY id")
      .all(user.id);
    const draftIds = drafts.map((d) => d.id);
    const notes =
      draftIds.length === 0
        ? []
        : sqlite
            .prepare(
              `SELECT * FROM draft_notes WHERE draft_id IN (${draftIds
                .map(() => "?")
                .join(",")}) ORDER BY id`
            )
            .all(...draftIds);

    let resumePath = profile?.resume_path || "";
    if (profile?.resume_path && fs.existsSync(profile.resume_path)) {
      const bytes = fs.readFileSync(profile.resume_path);
      const safe =
        (profile.resume_filename || "resume.pdf").replace(
          /[^a-zA-Z0-9._-]+/g,
          "_"
        ) || "resume.pdf";
      const storagePath = `${userId}/${Date.now()}-${safe}`;
      const mime = profile.resume_mime || "application/pdf";
      const { error: upErr } = await admin.storage
        .from("resumes")
        .upload(storagePath, bytes, { contentType: mime, upsert: true });
      if (upErr) {
        console.warn(`Resume upload failed: ${upErr.message}`);
      } else {
        resumePath = storagePath;
        console.log(`Uploaded resume → ${storagePath}`);
      }
    } else if (profile?.resume_path) {
      console.warn(`Resume file missing locally: ${profile.resume_path}`);
      resumePath = "";
    }

    await sql.begin(async (tx) => {
      if (profile) {
        await tx`
          insert into profiles (
            user_id, name, yoe, top_skills, "current_role", resume_link,
            phone, email, resume_text, resume_filename, resume_mime, resume_path,
            immediate_joiner, updated_at
          ) values (
            ${userId},
            ${profile.name || ""},
            ${profile.yoe || ""},
            ${profile.top_skills || ""},
            ${profile.current_role || ""},
            ${profile.resume_link || ""},
            ${profile.phone || ""},
            ${profile.email || ""},
            ${profile.resume_text || ""},
            ${profile.resume_filename || ""},
            ${profile.resume_mime || ""},
            ${resumePath},
            ${bool(profile.immediate_joiner)},
            ${ts(profile.updated_at) || new Date().toISOString()}
          )
          on conflict (user_id) do update set
            name = excluded.name,
            yoe = excluded.yoe,
            top_skills = excluded.top_skills,
            "current_role" = excluded."current_role",
            resume_link = excluded.resume_link,
            phone = excluded.phone,
            email = excluded.email,
            resume_text = excluded.resume_text,
            resume_filename = excluded.resume_filename,
            resume_mime = excluded.resume_mime,
            resume_path = excluded.resume_path,
            immediate_joiner = excluded.immediate_joiner,
            updated_at = excluded.updated_at
        `;
        console.log("Upserted profile");
      }

      if (smtp) {
        await tx`
          insert into smtp_settings (
            user_id, host, port, secure, "user", pass, from_email, from_name,
            attach_resume, updated_at
          ) values (
            ${userId},
            ${smtp.host || "smtp.gmail.com"},
            ${smtp.port || 587},
            ${bool(smtp.secure)},
            ${smtp.user || ""},
            ${smtp.pass || ""},
            ${smtp.from_email || ""},
            ${smtp.from_name || ""},
            ${bool(smtp.attach_resume)},
            ${ts(smtp.updated_at) || new Date().toISOString()}
          )
          on conflict (user_id) do update set
            host = excluded.host,
            port = excluded.port,
            secure = excluded.secure,
            "user" = excluded."user",
            pass = excluded.pass,
            from_email = excluded.from_email,
            from_name = excluded.from_name,
            attach_resume = excluded.attach_resume,
            updated_at = excluded.updated_at
        `;
        console.log("Upserted SMTP settings");
      }

      for (const p of posts) {
        await tx`
          insert into linkedin_posts (
            id, user_id, posted_by, posted_by_url, posted_date, posted_content,
            post_url, emails_json, created_at
          ) values (
            ${p.id},
            ${userId},
            ${p.posted_by || ""},
            ${p.posted_by_url || ""},
            ${p.posted_date || ""},
            ${p.posted_content || ""},
            ${p.post_url || ""},
            ${p.emails_json || "[]"},
            ${ts(p.created_at) || new Date().toISOString()}
          )
          on conflict (id) do update set
            user_id = excluded.user_id,
            posted_by = excluded.posted_by,
            posted_by_url = excluded.posted_by_url,
            posted_date = excluded.posted_date,
            posted_content = excluded.posted_content,
            post_url = excluded.post_url,
            emails_json = excluded.emails_json,
            created_at = excluded.created_at
        `;
        postsN++;
      }

      for (const d of drafts) {
        await tx`
          insert into email_drafts (
            id, user_id, post_id, recipient_email, recipient_name, subject, body,
            status, phone, location, company, contact_name, hiring_summary,
            talking_points, job_post, matched_skills, called, called_at,
            replied, replied_at, created_at, updated_at
          ) values (
            ${d.id},
            ${userId},
            ${d.post_id},
            ${d.recipient_email},
            ${d.recipient_name || ""},
            ${d.subject || ""},
            ${d.body || ""},
            ${d.status || "draft"},
            ${d.phone || ""},
            ${d.location || ""},
            ${d.company || ""},
            ${d.contact_name || ""},
            ${d.hiring_summary || ""},
            ${d.talking_points || ""},
            ${d.job_post || ""},
            ${d.matched_skills || ""},
            ${bool(d.called)},
            ${d.called_at || ""},
            ${bool(d.replied)},
            ${d.replied_at || ""},
            ${ts(d.created_at) || new Date().toISOString()},
            ${ts(d.updated_at) || new Date().toISOString()}
          )
          on conflict (id) do update set
            user_id = excluded.user_id,
            post_id = excluded.post_id,
            recipient_email = excluded.recipient_email,
            recipient_name = excluded.recipient_name,
            subject = excluded.subject,
            body = excluded.body,
            status = excluded.status,
            phone = excluded.phone,
            location = excluded.location,
            company = excluded.company,
            contact_name = excluded.contact_name,
            hiring_summary = excluded.hiring_summary,
            talking_points = excluded.talking_points,
            job_post = excluded.job_post,
            matched_skills = excluded.matched_skills,
            called = excluded.called,
            called_at = excluded.called_at,
            replied = excluded.replied,
            replied_at = excluded.replied_at,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at
        `;
        draftsN++;
      }

      for (const s of sendLog) {
        await tx`
          insert into email_send_log (
            id, user_id, recipient_email, sent_on, draft_id, sent_at
          ) values (
            ${s.id},
            ${userId},
            ${s.recipient_email},
            ${s.sent_on},
            ${s.draft_id ?? null},
            ${ts(s.sent_at) || new Date().toISOString()}
          )
          on conflict (id) do update set
            user_id = excluded.user_id,
            recipient_email = excluded.recipient_email,
            sent_on = excluded.sent_on,
            draft_id = excluded.draft_id,
            sent_at = excluded.sent_at
        `;
        sendN++;
      }

      for (const n of notes) {
        await tx`
          insert into draft_notes (id, draft_id, note, created_at)
          values (
            ${n.id},
            ${n.draft_id},
            ${n.note},
            ${ts(n.created_at) || new Date().toISOString()}
          )
          on conflict (id) do update set
            draft_id = excluded.draft_id,
            note = excluded.note,
            created_at = excluded.created_at
        `;
        notesN++;
      }

      await tx`select setval(pg_get_serial_sequence('linkedin_posts','id'), coalesce((select max(id) from linkedin_posts), 1))`;
      await tx`select setval(pg_get_serial_sequence('email_drafts','id'), coalesce((select max(id) from email_drafts), 1))`;
      await tx`select setval(pg_get_serial_sequence('email_send_log','id'), coalesce((select max(id) from email_send_log), 1))`;
      await tx`select setval(pg_get_serial_sequence('draft_notes','id'), coalesce((select max(id) from draft_notes), 1))`;
    });

    console.log(
      `Done for ${user.email}: posts=${posts.length}, drafts=${drafts.length}, send_log=${sendLog.length}, notes=${notes.length}`
    );
  }

  sqlite.close();
  await sql.end({ timeout: 5 });
  console.log(
    `\nMigration complete. Totals: posts=${postsN}, drafts=${draftsN}, send_log=${sendN}, notes=${notesN}`
  );
  console.log(
    "Log in at /login with the migrated email (use MIGRATE_PASSWORD if the account was newly created)."
  );
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
