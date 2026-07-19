import { and, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/postgres";
import {
  draftNotes,
  emailDrafts,
  emailSendLog,
  linkedinPosts,
  profiles,
  smtpSettings
} from "@/lib/schema";

export type User = {
  id: string;
  email: string;
  name: string;
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

export async function ensureUserDefaults(userId: string) {
  const db = getDb();
  const timestamp = now();
  await db
    .insert(profiles)
    .values({
      userId,
      plan: "free",
      dailyPostLimit: 50,
      postsFetchedOn: "",
      postsFetchedToday: 0,
      postsImportedOn: "",
      postsImportedToday: 0,
      updatedAt: timestamp
    })
    .onConflictDoNothing({ target: profiles.userId });
  await db
    .insert(smtpSettings)
    .values({ userId, updatedAt: timestamp })
    .onConflictDoNothing({ target: smtpSettings.userId });
}

export type DailyQuota = {
  plan: string;
  daily_post_limit: number;
  used: number;
  remaining: number;
  day: string;
};

export type ScrapeQuota = {
  plan: string;
  daily_post_limit: number;
  posts_fetched_today: number;
  posts_fetched_on: string;
  remaining: number;
};

type ProfileQuotaRow = {
  plan: string;
  dailyPostLimit: number;
  postsFetchedOn: string;
  postsFetchedToday: number;
  postsImportedOn: string;
  postsImportedToday: number;
};

async function readQuotaRow(userId: string): Promise<ProfileQuotaRow | undefined> {
  await ensureUserDefaults(userId);
  const [row] = await getDb()
    .select({
      plan: profiles.plan,
      dailyPostLimit: profiles.dailyPostLimit,
      postsFetchedOn: profiles.postsFetchedOn,
      postsFetchedToday: profiles.postsFetchedToday,
      postsImportedOn: profiles.postsImportedOn,
      postsImportedToday: profiles.postsImportedToday
    })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  return row;
}

function limitFromRow(row: { plan: string; dailyPostLimit: number } | undefined) {
  return {
    plan: row?.plan || "free",
    limit: Math.max(0, Number(row?.dailyPostLimit) || 0)
  };
}

function scrapeQuotaFromRow(row: ProfileQuotaRow, day = todayKey()): ScrapeQuota {
  const used = row.postsFetchedOn === day ? row.postsFetchedToday : 0;
  const { plan, limit } = limitFromRow(row);
  return {
    plan,
    daily_post_limit: limit,
    posts_fetched_today: used,
    posts_fetched_on: day,
    remaining: Math.max(0, limit - used)
  };
}

function importQuotaFromRow(row: ProfileQuotaRow, day = todayKey()): DailyQuota {
  const used = row.postsImportedOn === day ? row.postsImportedToday : 0;
  const { plan, limit } = limitFromRow(row);
  return {
    plan,
    daily_post_limit: limit,
    used,
    remaining: Math.max(0, limit - used),
    day
  };
}

export async function getScrapeQuota(userId: string): Promise<ScrapeQuota> {
  const row = await readQuotaRow(userId);
  if (!row) {
    return {
      plan: "free",
      daily_post_limit: 50,
      posts_fetched_today: 0,
      posts_fetched_on: todayKey(),
      remaining: 50
    };
  }
  return scrapeQuotaFromRow(row);
}

export async function getImportQuota(userId: string): Promise<DailyQuota> {
  const row = await readQuotaRow(userId);
  if (!row) {
    return { plan: "free", daily_post_limit: 50, used: 0, remaining: 50, day: todayKey() };
  }
  return importQuotaFromRow(row);
}

export async function getSendQuota(userId: string): Promise<DailyQuota> {
  const day = todayKey();
  const row = await readQuotaRow(userId);
  const { plan, limit } = limitFromRow(row);
  const [{ count }] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(emailSendLog)
    .where(and(eq(emailSendLog.userId, userId), eq(emailSendLog.sentOn, day)));
  const used = Number(count) || 0;
  return {
    plan,
    daily_post_limit: limit,
    used,
    remaining: Math.max(0, limit - used),
    day
  };
}

export async function getAllDailyQuotas(userId: string) {
  const [scrape, csvImport, send] = await Promise.all([
    getScrapeQuota(userId),
    getImportQuota(userId),
    getSendQuota(userId)
  ]);
  return {
    plan: scrape.plan,
    daily_post_limit: scrape.daily_post_limit,
    scrape,
    import: csvImport,
    send
  };
}

/** Atomically reserve up to `requested` posts against today's scrape quota. */
export async function reserveScrapeQuota(
  userId: string,
  requested: number
): Promise<ScrapeQuota & { allowed: number }> {
  const want = Math.max(0, Math.floor(Number(requested) || 0));
  if (!want) {
    const quota = await getScrapeQuota(userId);
    return { ...quota, allowed: 0 };
  }

  const day = todayKey();
  const db = getDb();
  await ensureUserDefaults(userId);

  await db
    .update(profiles)
    .set({
      postsFetchedOn: day,
      postsFetchedToday: 0,
      updatedAt: now()
    })
    .where(and(eq(profiles.userId, userId), ne(profiles.postsFetchedOn, day)));

  const [before] = await db
    .select({
      plan: profiles.plan,
      dailyPostLimit: profiles.dailyPostLimit,
      postsFetchedOn: profiles.postsFetchedOn,
      postsFetchedToday: profiles.postsFetchedToday,
      postsImportedOn: profiles.postsImportedOn,
      postsImportedToday: profiles.postsImportedToday
    })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);

  if (!before) throw new Error("Profile missing for scrape quota.");
  const current = scrapeQuotaFromRow(before, day);
  const allowed = Math.min(want, current.remaining);
  if (!allowed) return { ...current, allowed: 0 };

  await db
    .update(profiles)
    .set({
      postsFetchedOn: day,
      postsFetchedToday: current.posts_fetched_today + allowed,
      updatedAt: now()
    })
    .where(eq(profiles.userId, userId));

  const after = await getScrapeQuota(userId);
  return { ...after, allowed };
}

/** Return unused reserved scrape slots (e.g. scrape stopped early). */
export async function refundScrapeQuota(userId: string, unused: number): Promise<ScrapeQuota> {
  const amount = Math.max(0, Math.floor(Number(unused) || 0));
  if (!amount) return getScrapeQuota(userId);

  const day = todayKey();
  const db = getDb();
  const [row] = await db
    .select({
      postsFetchedOn: profiles.postsFetchedOn,
      postsFetchedToday: profiles.postsFetchedToday
    })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);

  if (!row || row.postsFetchedOn !== day) return getScrapeQuota(userId);

  const next = Math.max(0, row.postsFetchedToday - amount);
  await db
    .update(profiles)
    .set({ postsFetchedToday: next, updatedAt: now() })
    .where(eq(profiles.userId, userId));

  return getScrapeQuota(userId);
}

/** Atomically claim up to `requested` CSV import slots for today. */
export async function reserveImportQuota(
  userId: string,
  requested: number
): Promise<DailyQuota & { allowed: number }> {
  const want = Math.max(0, Math.floor(Number(requested) || 0));
  if (!want) {
    const quota = await getImportQuota(userId);
    return { ...quota, allowed: 0 };
  }

  const day = todayKey();
  const db = getDb();
  await ensureUserDefaults(userId);

  await db
    .update(profiles)
    .set({
      postsImportedOn: day,
      postsImportedToday: 0,
      updatedAt: now()
    })
    .where(and(eq(profiles.userId, userId), ne(profiles.postsImportedOn, day)));

  const [before] = await db
    .select({
      plan: profiles.plan,
      dailyPostLimit: profiles.dailyPostLimit,
      postsFetchedOn: profiles.postsFetchedOn,
      postsFetchedToday: profiles.postsFetchedToday,
      postsImportedOn: profiles.postsImportedOn,
      postsImportedToday: profiles.postsImportedToday
    })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);

  if (!before) throw new Error("Profile missing for import quota.");
  const current = importQuotaFromRow(before, day);
  const allowed = Math.min(want, current.remaining);
  if (!allowed) return { ...current, allowed: 0 };

  await db
    .update(profiles)
    .set({
      postsImportedOn: day,
      postsImportedToday: current.used + allowed,
      updatedAt: now()
    })
    .where(eq(profiles.userId, userId));

  const after = await getImportQuota(userId);
  return { ...after, allowed };
}

export async function getNotesForDraft(draftId: number): Promise<DraftNote[]> {
  const rows = await getDb()
    .select()
    .from(draftNotes)
    .where(eq(draftNotes.draftId, draftId))
    .orderBy(desc(draftNotes.id));
  return rows.map((row) => ({
    id: row.id,
    draft_id: row.draftId,
    note: row.note,
    created_at: row.createdAt
  }));
}

export async function getNotesByDraftIds(draftIds: number[]): Promise<Record<number, DraftNote[]>> {
  const map: Record<number, DraftNote[]> = {};
  for (const id of draftIds) map[id] = [];
  if (!draftIds.length) return map;
  const rows = await getDb()
    .select()
    .from(draftNotes)
    .where(inArray(draftNotes.draftId, draftIds))
    .orderBy(desc(draftNotes.id));
  for (const row of rows) {
    if (!map[row.draftId]) map[row.draftId] = [];
    map[row.draftId].push({
      id: row.id,
      draft_id: row.draftId,
      note: row.note,
      created_at: row.createdAt
    });
  }
  return map;
}

export async function addDraftNote(draftId: number, note: string) {
  const text = String(note || "").trim();
  if (!text) throw new Error("Note cannot be empty.");
  const createdAt = now();
  const [row] = await getDb()
    .insert(draftNotes)
    .values({ draftId, note: text, createdAt })
    .returning();
  return {
    id: row.id,
    draft_id: row.draftId,
    note: row.note,
    created_at: row.createdAt
  } as DraftNote;
}

export async function deleteDraftNote(userId: string, noteId: number) {
  const db = getDb();
  const owned = await db
    .select({ id: draftNotes.id })
    .from(draftNotes)
    .innerJoin(emailDrafts, eq(emailDrafts.id, draftNotes.draftId))
    .where(and(eq(draftNotes.id, noteId), eq(emailDrafts.userId, userId)))
    .limit(1);
  if (!owned.length) return 0;
  await db.delete(draftNotes).where(eq(draftNotes.id, noteId));
  return 1;
}

export async function repliedEmailSet(userId: string) {
  const rows = await getDb()
    .selectDistinct({ email: emailDrafts.recipientEmail })
    .from(emailDrafts)
    .where(and(eq(emailDrafts.userId, userId), eq(emailDrafts.replied, true)));
  return new Set(rows.map((row) => normalizeEmail(row.email)).filter(Boolean));
}

export async function setDraftReplied(userId: string, draftId: number, replied: boolean) {
  const db = getDb();
  const [draft] = await db
    .select({ id: emailDrafts.id, recipientEmail: emailDrafts.recipientEmail })
    .from(emailDrafts)
    .where(and(eq(emailDrafts.id, draftId), eq(emailDrafts.userId, userId)))
    .limit(1);
  if (!draft) return null;
  const timestamp = now();
  const email = normalizeEmail(draft.recipientEmail);
  if (email) {
    await db
      .update(emailDrafts)
      .set({
        replied,
        repliedAt: replied ? timestamp : "",
        updatedAt: timestamp
      })
      .where(and(eq(emailDrafts.userId, userId), sql`lower(trim(${emailDrafts.recipientEmail})) = ${email}`));
  } else {
    await db
      .update(emailDrafts)
      .set({ replied, repliedAt: replied ? timestamp : "", updatedAt: timestamp })
      .where(and(eq(emailDrafts.id, draftId), eq(emailDrafts.userId, userId)));
  }
  return getDraftById(userId, draftId);
}

async function getDraftById(userId: string, draftId: number) {
  const [draft] = await getDb()
    .select()
    .from(emailDrafts)
    .where(and(eq(emailDrafts.id, draftId), eq(emailDrafts.userId, userId)))
    .limit(1);
  if (!draft) return null;
  return mapDraftRow(draft);
}

function mapDraftRow(draft: typeof emailDrafts.$inferSelect) {
  return {
    id: draft.id,
    recipient_email: draft.recipientEmail,
    recipient_name: draft.recipientName,
    subject: draft.subject,
    body: draft.body,
    status: draft.status,
    phone: draft.phone,
    location: draft.location,
    company: draft.company,
    contact_name: draft.contactName,
    hiring_summary: draft.hiringSummary,
    talking_points: draft.talkingPoints,
    job_post: draft.jobPost,
    matched_skills: draft.matchedSkills,
    called: draft.called,
    called_at: draft.calledAt,
    replied: draft.replied,
    replied_at: draft.repliedAt,
    post_id: draft.postId
  };
}

export async function wasEmailedToday(userId: string, email: string, day = todayKey()) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const rows = await getDb()
    .select({ id: emailSendLog.id })
    .from(emailSendLog)
    .where(
      and(
        eq(emailSendLog.userId, userId),
        eq(emailSendLog.recipientEmail, normalized),
        eq(emailSendLog.sentOn, day)
      )
    )
    .limit(1);
  return Boolean(rows.length);
}

export async function recordEmailSent(userId: string, email: string, draftId: number | null, day = todayKey()) {
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  await getDb()
    .insert(emailSendLog)
    .values({
      userId,
      recipientEmail: normalized,
      sentOn: day,
      draftId,
      sentAt: now()
    })
    .onConflictDoUpdate({
      target: [emailSendLog.userId, emailSendLog.recipientEmail, emailSendLog.sentOn],
      set: { draftId, sentAt: now() }
    });
}

export async function emailedTodaySet(userId: string, day = todayKey()) {
  const rows = await getDb()
    .select({ recipientEmail: emailSendLog.recipientEmail })
    .from(emailSendLog)
    .where(and(eq(emailSendLog.userId, userId), eq(emailSendLog.sentOn, day)));
  return new Set(rows.map((row) => normalizeEmail(row.recipientEmail)));
}

export async function getProfile(userId: string) {
  const [row] = await getDb().select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  if (!row) return undefined;
  return {
    user_id: row.userId,
    name: row.name,
    yoe: row.yoe,
    top_skills: row.topSkills,
    current_role: row.currentRole,
    resume_link: row.resumeLink,
    phone: row.phone,
    email: row.email,
    resume_text: row.resumeText,
    resume_filename: row.resumeFilename,
    resume_mime: row.resumeMime,
    resume_path: row.resumePath,
    immediate_joiner: row.immediateJoiner ? 1 : 0,
    updated_at: row.updatedAt
  } as Record<string, string | number>;
}

export async function getPublicProfile(userId: string) {
  const row = await getProfile(userId);
  if (!row) return null;
  const hasContent = Boolean(String(row.resume_text || "").trim() || row.resume_path);
  if (!hasContent) return null;
  const { resume_text: _t, resume_path: path, ...rest } = row;
  return {
    ...rest,
    immediate_joiner: Number(row.immediate_joiner) === 1,
    has_resume_file: Boolean(path)
  };
}

export async function updateProfile(
  userId: string,
  fields: { immediate_joiner?: boolean; top_skills?: string }
) {
  const existing = await getProfile(userId);
  if (!existing) return null;
  const patch: Partial<typeof profiles.$inferInsert> = { updatedAt: now() };
  if (typeof fields.immediate_joiner === "boolean") patch.immediateJoiner = fields.immediate_joiner;
  if (typeof fields.top_skills === "string") patch.topSkills = fields.top_skills.trim();
  await getDb().update(profiles).set(patch).where(eq(profiles.userId, userId));
  return getPublicProfile(userId);
}

export async function upsertProfileFromResume(
  userId: string,
  data: {
    name: string;
    yoe: string;
    top_skills: string;
    current_role: string;
    resume_link: string;
    phone: string;
    email: string;
    resume_text: string;
    resume_filename: string;
    resume_mime: string;
    resume_path: string;
    immediate_joiner: boolean;
  }
) {
  const timestamp = now();
  await getDb()
    .insert(profiles)
    .values({
      userId,
      name: data.name,
      yoe: data.yoe,
      topSkills: data.top_skills,
      currentRole: data.current_role,
      resumeLink: data.resume_link,
      phone: data.phone,
      email: data.email,
      resumeText: data.resume_text,
      resumeFilename: data.resume_filename,
      resumeMime: data.resume_mime,
      resumePath: data.resume_path,
      immediateJoiner: data.immediate_joiner,
      updatedAt: timestamp
    })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: {
        name: data.name,
        yoe: data.yoe,
        topSkills: data.top_skills,
        currentRole: data.current_role,
        resumeLink: data.resume_link,
        phone: data.phone,
        email: data.email,
        resumeText: data.resume_text,
        resumeFilename: data.resume_filename,
        resumeMime: data.resume_mime,
        resumePath: data.resume_path,
        immediateJoiner: data.immediate_joiner,
        updatedAt: timestamp
      }
    });
}

export async function getPosts(userId: string) {
  const rows = await getDb()
    .select()
    .from(linkedinPosts)
    .where(eq(linkedinPosts.userId, userId))
    .orderBy(desc(linkedinPosts.id));
  return rows.map((row) => ({
    id: row.id,
    posted_by: row.postedBy,
    posted_by_url: row.postedByUrl,
    posted_date: row.postedDate,
    posted_content: row.postedContent,
    post_url: row.postUrl,
    emails_json: row.emailsJson,
    created_at: row.createdAt
  }));
}

export async function clearDrafts(userId: string) {
  const db = getDb();
  const ids = await db
    .select({ id: emailDrafts.id })
    .from(emailDrafts)
    .where(eq(emailDrafts.userId, userId));
  const draftIds = ids.map((row) => row.id);
  if (draftIds.length) {
    await db.delete(draftNotes).where(inArray(draftNotes.draftId, draftIds));
  }
  const deleted = await db.delete(emailDrafts).where(eq(emailDrafts.userId, userId)).returning({ id: emailDrafts.id });
  return deleted.length;
}

export async function deleteDraftsByIds(userId: string, ids: number[]) {
  const unique = Array.from(new Set(ids.filter((id) => Number.isFinite(id) && id > 0)));
  if (!unique.length) return 0;
  const db = getDb();
  const owned = await db
    .select({ id: emailDrafts.id })
    .from(emailDrafts)
    .where(and(eq(emailDrafts.userId, userId), inArray(emailDrafts.id, unique)));
  const ownedIds = owned.map((row) => row.id);
  if (!ownedIds.length) return 0;
  await db.delete(draftNotes).where(inArray(draftNotes.draftId, ownedIds));
  const deleted = await db
    .delete(emailDrafts)
    .where(and(eq(emailDrafts.userId, userId), inArray(emailDrafts.id, ownedIds)))
    .returning({ id: emailDrafts.id });
  return deleted.length;
}

export async function getSmtpSettings(userId: string): Promise<SmtpSettings | null> {
  const [row] = await getDb().select().from(smtpSettings).where(eq(smtpSettings.userId, userId)).limit(1);
  if (!row) return null;
  return {
    host: row.host || "smtp.gmail.com",
    port: Number(row.port) || 587,
    secure: Boolean(row.secure),
    user: row.user || "",
    pass: row.pass || "",
    from_email: row.fromEmail || row.user || "",
    from_name: row.fromName || "",
    attach_resume: row.attachResume !== false
  };
}

export async function saveSmtpSettings(
  userId: string,
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
  const existing = await getSmtpSettings(userId);
  const pass = input.pass?.trim() ? input.pass.trim() : existing?.pass || "";
  const timestamp = now();
  await getDb()
    .insert(smtpSettings)
    .values({
      userId,
      host: input.host.trim() || "smtp.gmail.com",
      port: input.port || 587,
      secure: Boolean(input.secure),
      user: input.user.trim(),
      pass,
      fromEmail: input.from_email.trim() || input.user.trim(),
      fromName: input.from_name.trim(),
      attachResume: Boolean(input.attach_resume),
      updatedAt: timestamp
    })
    .onConflictDoUpdate({
      target: smtpSettings.userId,
      set: {
        host: input.host.trim() || "smtp.gmail.com",
        port: input.port || 587,
        secure: Boolean(input.secure),
        user: input.user.trim(),
        pass,
        fromEmail: input.from_email.trim() || input.user.trim(),
        fromName: input.from_name.trim(),
        attachResume: Boolean(input.attach_resume),
        updatedAt: timestamp
      }
    });
  return getSmtpSettings(userId);
}

export async function getPublicSmtpSettings(userId: string) {
  const settings = await getSmtpSettings(userId);
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

export async function userOwnsDraft(userId: string, draftId: number) {
  const rows = await getDb()
    .select({ id: emailDrafts.id })
    .from(emailDrafts)
    .where(and(eq(emailDrafts.id, draftId), eq(emailDrafts.userId, userId)))
    .limit(1);
  return Boolean(rows.length);
}

export async function listDrafts(userId: string) {
  const rows = await getDb()
    .select()
    .from(emailDrafts)
    .where(eq(emailDrafts.userId, userId))
    .orderBy(desc(emailDrafts.id));
  return rows.map(mapDraftRow);
}

export async function getDraftsForSend(
  userId: string,
  options: { all?: boolean; draftIds?: number[]; draftId?: number | null }
) {
  const db = getDb();
  if (options.all) {
    return db
      .select({
        id: emailDrafts.id,
        recipientEmail: emailDrafts.recipientEmail,
        subject: emailDrafts.subject,
        body: emailDrafts.body,
        status: emailDrafts.status,
        replied: emailDrafts.replied
      })
      .from(emailDrafts)
      .where(and(eq(emailDrafts.userId, userId), ne(emailDrafts.status, "sent"), eq(emailDrafts.replied, false)))
      .orderBy(emailDrafts.id);
  }
  if (options.draftIds?.length) {
    return db
      .select({
        id: emailDrafts.id,
        recipientEmail: emailDrafts.recipientEmail,
        subject: emailDrafts.subject,
        body: emailDrafts.body,
        status: emailDrafts.status,
        replied: emailDrafts.replied
      })
      .from(emailDrafts)
      .where(
        and(
          eq(emailDrafts.userId, userId),
          inArray(emailDrafts.id, options.draftIds),
          ne(emailDrafts.status, "sent"),
          eq(emailDrafts.replied, false)
        )
      )
      .orderBy(emailDrafts.id);
  }
  if (options.draftId) {
    return db
      .select({
        id: emailDrafts.id,
        recipientEmail: emailDrafts.recipientEmail,
        subject: emailDrafts.subject,
        body: emailDrafts.body,
        status: emailDrafts.status,
        replied: emailDrafts.replied
      })
      .from(emailDrafts)
      .where(and(eq(emailDrafts.id, options.draftId), eq(emailDrafts.userId, userId)))
      .limit(1);
  }
  return [];
}

export async function updateDraftStatus(userId: string, draftId: number, status: string) {
  await getDb()
    .update(emailDrafts)
    .set({ status, updatedAt: now() })
    .where(and(eq(emailDrafts.id, draftId), eq(emailDrafts.userId, userId)));
}

export async function updateDraftCalled(userId: string, draftId: number, called: boolean) {
  const timestamp = now();
  await getDb()
    .update(emailDrafts)
    .set({ called, calledAt: called ? timestamp : "", updatedAt: timestamp })
    .where(and(eq(emailDrafts.id, draftId), eq(emailDrafts.userId, userId)));
  return getDraftById(userId, draftId);
}

export async function updateDraftContent(
  userId: string,
  draftId: number,
  fields: { recipient_email: string; subject: string; body: string; status: string }
) {
  await getDb()
    .update(emailDrafts)
    .set({
      recipientEmail: fields.recipient_email,
      subject: fields.subject,
      body: fields.body,
      status: fields.status,
      updatedAt: now()
    })
    .where(and(eq(emailDrafts.id, draftId), eq(emailDrafts.userId, userId)));
  return getDraftById(userId, draftId);
}

export async function getDraftStatus(userId: string, draftId: number) {
  const [row] = await getDb()
    .select({ id: emailDrafts.id, status: emailDrafts.status })
    .from(emailDrafts)
    .where(and(eq(emailDrafts.id, draftId), eq(emailDrafts.userId, userId)))
    .limit(1);
  return row;
}

export async function getPostsWithEmails(userId: string) {
  return getDb()
    .select()
    .from(linkedinPosts)
    .where(and(eq(linkedinPosts.userId, userId), ne(linkedinPosts.emailsJson, "[]")))
    .orderBy(linkedinPosts.id);
}

export async function existingDraftPostIds(userId: string) {
  const rows = await getDb()
    .select({ postId: emailDrafts.postId })
    .from(emailDrafts)
    .where(eq(emailDrafts.userId, userId));
  return new Set(rows.map((row) => row.postId));
}

export async function insertDraft(
  userId: string,
  values: {
    postId: number;
    recipientEmail: string;
    recipientName: string;
    subject: string;
    body: string;
    phone: string;
    location: string;
    company: string;
    contactName: string;
    hiringSummary: string;
    talkingPoints: string;
    jobPost: string;
    matchedSkills: string;
  }
) {
  const timestamp = now();
  await getDb().insert(emailDrafts).values({
    userId,
    postId: values.postId,
    recipientEmail: values.recipientEmail,
    recipientName: values.recipientName,
    subject: values.subject,
    body: values.body,
    phone: values.phone,
    location: values.location,
    company: values.company,
    contactName: values.contactName,
    hiringSummary: values.hiringSummary,
    talkingPoints: values.talkingPoints,
    jobPost: values.jobPost,
    matchedSkills: values.matchedSkills,
    called: false,
    calledAt: "",
    replied: false,
    repliedAt: "",
    createdAt: timestamp,
    updatedAt: timestamp
  });
}

export async function getDraftsForEnrich(
  userId: string,
  options: { ids?: number[]; onlyMissing?: boolean }
) {
  const db = getDb();
  if (options.ids?.length) {
    return db
      .select()
      .from(emailDrafts)
      .where(and(eq(emailDrafts.userId, userId), inArray(emailDrafts.id, options.ids)))
      .orderBy(emailDrafts.id);
  }
  if (options.onlyMissing !== false) {
    return db
      .select()
      .from(emailDrafts)
      .where(
        and(
          eq(emailDrafts.userId, userId),
          or(
            sql`trim(coalesce(${emailDrafts.phone}, '')) = ''`,
            sql`trim(coalesce(${emailDrafts.company}, '')) = ''`,
            sql`trim(coalesce(${emailDrafts.hiringSummary}, '')) = ''`,
            sql`trim(coalesce(${emailDrafts.talkingPoints}, '')) = ''`,
            sql`trim(coalesce(${emailDrafts.jobPost}, '')) = ''`
          )
        )
      )
      .orderBy(emailDrafts.id);
  }
  return db.select().from(emailDrafts).where(eq(emailDrafts.userId, userId)).orderBy(emailDrafts.id);
}

export async function getPostsByIds(userId: string, postIds: number[]) {
  if (!postIds.length) return [];
  return getDb()
    .select({
      id: linkedinPosts.id,
      postedBy: linkedinPosts.postedBy,
      postedContent: linkedinPosts.postedContent
    })
    .from(linkedinPosts)
    .where(and(eq(linkedinPosts.userId, userId), inArray(linkedinPosts.id, postIds)));
}

export async function updateDraftEnrichment(
  userId: string,
  draftId: number,
  data: {
    phone: string;
    location: string;
    company: string;
    contactName: string;
    hiringSummary: string;
    talkingPoints: string;
    jobPost: string;
    matchedSkills: string;
  }
) {
  await getDb()
    .update(emailDrafts)
    .set({
      phone: data.phone,
      location: data.location,
      company: data.company,
      contactName: data.contactName,
      hiringSummary: data.hiringSummary,
      talkingPoints: data.talkingPoints,
      jobPost: data.jobPost,
      matchedSkills: data.matchedSkills,
      updatedAt: now()
    })
    .where(and(eq(emailDrafts.id, draftId), eq(emailDrafts.userId, userId)));
}

export async function upsertLinkedInPosts(
  userId: string,
  rows: Array<{
    postedBy: string;
    postedByUrl: string;
    postedDate: string;
    postedContent: string;
    postUrl: string;
    emails: string[];
  }>
) {
  const db = getDb();
  const timestamp = now();
  for (const row of rows) {
    await db
      .insert(linkedinPosts)
      .values({
        userId,
        postedBy: row.postedBy,
        postedByUrl: row.postedByUrl,
        postedDate: row.postedDate,
        postedContent: row.postedContent,
        postUrl: row.postUrl,
        emailsJson: JSON.stringify(row.emails),
        createdAt: timestamp
      })
      .onConflictDoUpdate({
        target: [linkedinPosts.userId, linkedinPosts.postedByUrl, linkedinPosts.postedContent],
        set: {
          postedDate: row.postedDate,
          postUrl: row.postUrl,
          emailsJson: JSON.stringify(row.emails)
        }
      });
  }
}

export async function exportDraftRows(userId: string) {
  const rows = await getDb()
    .select({
      posted_by: linkedinPosts.postedBy,
      posted_by_url: linkedinPosts.postedByUrl,
      posted_date: linkedinPosts.postedDate,
      posted_content: linkedinPosts.postedContent,
      post_url: linkedinPosts.postUrl,
      recipient_email: emailDrafts.recipientEmail,
      subject: emailDrafts.subject,
      body: emailDrafts.body,
      status: emailDrafts.status,
      created_at: emailDrafts.createdAt
    })
    .from(emailDrafts)
    .innerJoin(linkedinPosts, eq(linkedinPosts.id, emailDrafts.postId))
    .where(eq(emailDrafts.userId, userId))
    .orderBy(desc(emailDrafts.id));
  return rows;
}
