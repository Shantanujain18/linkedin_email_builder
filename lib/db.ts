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
import { postDraftStatus, postSortRank, toLocalDay, type PostFilter } from "@/lib/post-draft-status";

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

export async function wasEmailMarkedReplied(userId: string, email: string) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const rows = await getDb()
    .select({ id: emailDrafts.id })
    .from(emailDrafts)
    .where(
      and(
        eq(emailDrafts.userId, userId),
        eq(emailDrafts.replied, true),
        sql`lower(trim(${emailDrafts.recipientEmail})) = ${normalized}`
      )
    )
    .limit(1);
  return Boolean(rows.length);
}

/** Mark unreplied drafts as replied when that recipient was replied on any earlier draft. */
export async function syncDraftsRepliedFromHistory(userId: string) {
  const repliedEmails = await repliedEmailSet(userId);
  if (!repliedEmails.size) return 0;

  const unreplied = await getDb()
    .select({ id: emailDrafts.id, recipientEmail: emailDrafts.recipientEmail })
    .from(emailDrafts)
    .where(and(eq(emailDrafts.userId, userId), eq(emailDrafts.replied, false)));

  const ids = unreplied
    .filter((row) => repliedEmails.has(normalizeEmail(row.recipientEmail)))
    .map((row) => row.id);
  if (!ids.length) return 0;

  const timestamp = now();
  await getDb()
    .update(emailDrafts)
    .set({ replied: true, repliedAt: timestamp, updatedAt: timestamp })
    .where(and(eq(emailDrafts.userId, userId), inArray(emailDrafts.id, ids)));
  return ids.length;
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
    post_id: draft.postId,
    created_at: draft.createdAt,
    updated_at: draft.updatedAt
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

function mapPostRow(row: typeof linkedinPosts.$inferSelect) {
  return {
    id: row.id,
    posted_by: row.postedBy,
    posted_by_url: row.postedByUrl,
    posted_date: row.postedDate,
    posted_content: row.postedContent,
    post_url: row.postUrl,
    emails_json: row.emailsJson,
    phones_json: row.phonesJson || "[]",
    draft_skip_reason: row.draftSkipReason || "",
    created_at: row.createdAt
  };
}

export async function getPosts(userId: string) {
  const rows = await getDb()
    .select()
    .from(linkedinPosts)
    .where(eq(linkedinPosts.userId, userId))
    .orderBy(desc(linkedinPosts.id));
  return rows.map(mapPostRow);
}

export async function deletePostsByIds(userId: string, ids: number[]) {
  const unique = Array.from(new Set(ids.filter((id) => Number.isFinite(id) && id > 0)));
  if (!unique.length) return 0;
  const deleted = await getDb()
    .delete(linkedinPosts)
    .where(and(eq(linkedinPosts.userId, userId), inArray(linkedinPosts.id, unique)))
    .returning({ id: linkedinPosts.id });
  return deleted.length;
}

export type DraftStatusFilter = "all" | "unsent" | "draft" | "sent" | "skipped" | "replied";

function draftMatchesStatusFilter(
  draft: { status: string; replied: boolean },
  status: DraftStatusFilter
) {
  if (status === "all") return true;
  if (status === "unsent") return draft.status !== "sent" && draft.status !== "skipped" && !draft.replied;
  if (status === "draft") return draft.status === "draft" && !draft.replied;
  if (status === "sent") return draft.status === "sent";
  if (status === "skipped") return draft.status === "skipped";
  if (status === "replied") return Boolean(draft.replied);
  return true;
}

export async function getDraftCounts(userId: string) {
  const rows = await getDb()
    .select({
      status: emailDrafts.status,
      replied: emailDrafts.replied
    })
    .from(emailDrafts)
    .where(eq(emailDrafts.userId, userId));

  let unsent = 0;
  let draft = 0;
  let sent = 0;
  let skipped = 0;
  let replied = 0;
  for (const row of rows) {
    const item = { status: row.status, replied: Boolean(row.replied) };
    if (draftMatchesStatusFilter(item, "unsent")) unsent += 1;
    if (draftMatchesStatusFilter(item, "draft")) draft += 1;
    if (draftMatchesStatusFilter(item, "sent")) sent += 1;
    if (draftMatchesStatusFilter(item, "skipped")) skipped += 1;
    if (draftMatchesStatusFilter(item, "replied")) replied += 1;
  }
  return { total: rows.length, unsent, draft, sent, skipped, replied };
}

export async function listDraftsPage(
  userId: string,
  options: {
    page: number;
    pageSize: number;
    status?: DraftStatusFilter;
    q?: string;
    date?: string;
  }
) {
  await syncDraftsRepliedFromHistory(userId);

  const status = options.status || "all";
  const q = String(options.q || "").trim().toLowerCase();
  const date = String(options.date || "").trim();
  const pageSize = options.pageSize;
  const page = options.page;

  const rows = await getDb()
    .select()
    .from(emailDrafts)
    .where(eq(emailDrafts.userId, userId))
    .orderBy(desc(emailDrafts.id));

  const mapped = rows.map(mapDraftRow);
  const filtered = mapped.filter((draft) => {
    if (!draftMatchesStatusFilter({ status: draft.status, replied: Boolean(draft.replied) }, status)) {
      return false;
    }
    if (date) {
      const day = (() => {
        if (!draft.created_at) return "";
        const d = new Date(draft.created_at);
        if (Number.isNaN(d.getTime())) return "";
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const dayNum = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${dayNum}`;
      })();
      if (day !== date) return false;
    }
    if (!q) return true;
    const contact = `${draft.contact_name || ""} ${draft.recipient_name || ""}`.toLowerCase();
    return (
      String(draft.company || "").toLowerCase().includes(q) ||
      String(draft.recipient_email || "").toLowerCase().includes(q) ||
      contact.includes(q) ||
      String(draft.subject || "").toLowerCase().includes(q) ||
      String(draft.phone || "").toLowerCase().includes(q)
    );
  });

  const filteredIds = filtered.map((row) => row.id);
  const sentAtByDraft = new Map<number, string>();
  if (filteredIds.length) {
    const logs = await getDb()
      .select({
        draftId: emailSendLog.draftId,
        sentAt: emailSendLog.sentAt
      })
      .from(emailSendLog)
      .where(and(eq(emailSendLog.userId, userId), inArray(emailSendLog.draftId, filteredIds)));
    for (const log of logs) {
      if (!log.draftId) continue;
      const prev = sentAtByDraft.get(log.draftId);
      if (!prev || log.sentAt > prev) sentAtByDraft.set(log.draftId, log.sentAt);
    }
  }

  const enriched = filtered.map((draft) => ({
    ...draft,
    sent_at: sentAtByDraft.get(draft.id) || (draft.status === "sent" ? draft.updated_at : "")
  }));

  enriched.sort((a, b) => {
    const aSent = String(a.sent_at || "");
    const bSent = String(b.sent_at || "");
    if (aSent !== bSent) {
      if (!aSent) return 1;
      if (!bSent) return -1;
      return bSent.localeCompare(aSent);
    }
    return String(b.created_at || "").localeCompare(String(a.created_at || ""));
  });

  const total = enriched.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  const pageRows = enriched.slice(start, start + pageSize);

  const ids = pageRows.map((row) => row.id);
  const notesByDraft = await getNotesByDraftIds(ids);

  const dates = Array.from(
    new Set(
      mapped
        .map((draft) => {
          if (!draft.created_at) return "";
          const d = new Date(draft.created_at);
          if (Number.isNaN(d.getTime())) return "";
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, "0");
          const dayNum = String(d.getDate()).padStart(2, "0");
          return `${y}-${m}-${dayNum}`;
        })
        .filter(Boolean)
    )
  ).sort((a, b) => b.localeCompare(a));

  const items = pageRows.map((draft) => ({
    ...draft,
    called: Boolean(draft.called),
    replied: Boolean(draft.replied),
    notes: notesByDraft[Number(draft.id)] || [],
    sent_at: draft.sent_at || ""
  }));

  return { items, total, page: safePage, pageSize, dates };
}

export async function listPostsPage(
  userId: string,
  options: {
    page: number;
    pageSize: number;
    filter?: PostFilter;
    q?: string;
    date?: string;
    topSkills: string;
  }
) {
  const filter = options.filter || "all";
  const q = String(options.q || "").trim().toLowerCase();
  const date = String(options.date || "").trim();
  const posts = await getPosts(userId);
  const draftedPostIds = await existingDraftPostIds(userId);

  const enriched = posts.map((post) => {
    const emails = (() => {
      try {
        const parsed = JSON.parse(String(post.emails_json || "[]"));
        if (!Array.isArray(parsed)) return [] as string[];
        return parsed.map((email) => String(email || "").trim()).filter(Boolean);
      } catch {
        return [] as string[];
      }
    })();
    const phones = (() => {
      try {
        const parsed = JSON.parse(String(post.phones_json || "[]"));
        if (!Array.isArray(parsed)) return [] as string[];
        return parsed.map((phone) => String(phone || "").trim()).filter(Boolean);
      } catch {
        return [] as string[];
      }
    })();
    const outcome = postDraftStatus(post, draftedPostIds, options.topSkills);
    return { post, emails, phones, outcome, valid: emails.length > 0 };
  });

  const counts = {
    total: enriched.length,
    valid: enriched.filter((row) => row.valid).length,
    invalid: enriched.filter((row) => !row.valid).length,
    pending: enriched.filter((row) => row.outcome.kind === "pending").length,
    drafted: enriched.filter((row) => row.outcome.kind === "drafted").length,
    skipped: enriched.filter((row) => row.outcome.kind === "skipped").length
  };

  const filtered = enriched.filter((row) => {
    if (filter === "valid" && !row.valid) return false;
    if (filter === "invalid" && row.valid) return false;
    if (filter === "drafted" && row.outcome.kind !== "drafted") return false;
    if (filter === "skipped" && row.outcome.kind !== "skipped") return false;
    if (filter === "pending" && row.outcome.kind !== "pending") return false;
    if (date && toLocalDay(String(row.post.created_at || "")) !== date) return false;
    if (!q) return true;
    const haystack = [
      row.post.posted_by,
      row.post.posted_content,
      row.post.posted_by_url,
      row.post.post_url,
      row.emails.join(" "),
      row.phones.join(" "),
      row.outcome.label,
      row.outcome.reason
    ]
      .map((value) => String(value || "").toLowerCase())
      .join(" ");
    return haystack.includes(q);
  });

  filtered.sort((a, b) => {
    const rank = postSortRank(a.outcome, a.valid) - postSortRank(b.outcome, b.valid);
    if (rank !== 0) return rank;
    return Number(b.post.id) - Number(a.post.id);
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / options.pageSize) || 1);
  const safePage = Math.min(Math.max(1, options.page), totalPages);
  const start = (safePage - 1) * options.pageSize;
  const pageRows = filtered.slice(start, start + options.pageSize);

  const dates = Array.from(
    new Set(enriched.map((row) => toLocalDay(String(row.post.created_at || ""))).filter(Boolean))
  ).sort((a, b) => b.localeCompare(a));

  const pendingIds = enriched
    .filter((row) => row.outcome.kind === "pending")
    .map((row) => Number(row.post.id));

  return {
    items: pageRows.map((row) => ({
      ...row.post,
      draft_status: row.outcome
    })),
    total,
    page: safePage,
    pageSize: options.pageSize,
    counts,
    dates,
    pendingIds
  };
}

export async function getWorkspaceCounts(userId: string, topSkills: string) {
  const [postPage, draftCounts] = await Promise.all([
    listPostsPage(userId, { page: 1, pageSize: 1, topSkills }),
    getDraftCounts(userId)
  ]);
  return {
    posts: postPage.counts,
    drafts: draftCounts
  };
}

export async function setPostDraftSkipReason(userId: string, postId: number, reason: string) {
  await getDb()
    .update(linkedinPosts)
    .set({ draftSkipReason: String(reason || "").trim().slice(0, 500) })
    .where(and(eq(linkedinPosts.userId, userId), eq(linkedinPosts.id, postId)));
}

export async function clearPostDraftSkipReason(userId: string, postId: number) {
  await getDb()
    .update(linkedinPosts)
    .set({ draftSkipReason: "" })
    .where(and(eq(linkedinPosts.userId, userId), eq(linkedinPosts.id, postId)));
}

/** After a draft is removed, keep the post out of Step 2 "Pending" (Retry write still works). */
export function skipReasonAfterDraftDelete(status: string) {
  return status === "sent" ? "Previously sent" : "Draft deleted";
}

async function stampPostsAfterDraftRemoval(
  userId: string,
  rows: Array<{ postId: number; status: string }>
) {
  for (const row of rows) {
    const postId = Number(row.postId);
    if (!Number.isFinite(postId) || postId < 1) continue;
    await setPostDraftSkipReason(userId, postId, skipReasonAfterDraftDelete(row.status));
  }
}

export async function clearDrafts(userId: string) {
  const db = getDb();
  const rows = await db
    .select({ id: emailDrafts.id, postId: emailDrafts.postId, status: emailDrafts.status })
    .from(emailDrafts)
    .where(eq(emailDrafts.userId, userId));
  const draftIds = rows.map((row) => row.id);
  if (draftIds.length) {
    await stampPostsAfterDraftRemoval(userId, rows);
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
    .select({ id: emailDrafts.id, postId: emailDrafts.postId, status: emailDrafts.status })
    .from(emailDrafts)
    .where(and(eq(emailDrafts.userId, userId), inArray(emailDrafts.id, unique)));
  const ownedIds = owned.map((row) => row.id);
  if (!ownedIds.length) return 0;
  await stampPostsAfterDraftRemoval(userId, owned);
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
  await syncDraftsRepliedFromHistory(userId);

  const rows = await getDb()
    .select()
    .from(emailDrafts)
    .where(eq(emailDrafts.userId, userId))
    .orderBy(desc(emailDrafts.id));

  const ids = rows.map((row) => row.id);
  const sentAtByDraft = new Map<number, string>();
  if (ids.length) {
    const logs = await getDb()
      .select({
        draftId: emailSendLog.draftId,
        sentAt: emailSendLog.sentAt
      })
      .from(emailSendLog)
      .where(and(eq(emailSendLog.userId, userId), inArray(emailSendLog.draftId, ids)));
    for (const log of logs) {
      if (!log.draftId) continue;
      const prev = sentAtByDraft.get(log.draftId);
      if (!prev || log.sentAt > prev) sentAtByDraft.set(log.draftId, log.sentAt);
    }
  }

  return rows.map((row) => ({
    ...mapDraftRow(row),
    sent_at: sentAtByDraft.get(row.id) || (row.status === "sent" ? row.updatedAt : "")
  }));
}

export async function getDraftsForSend(
  userId: string,
  options: { all?: boolean; draftIds?: number[]; draftId?: number | null }
) {
  const db = getDb();
  if (options.all) {
    // Match dashboard "ready to send": not sent, not skipped, not replied.
    // Including skipped caused Send-all to reprocess the same rows forever (0 sent, rising skipped).
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
          ne(emailDrafts.status, "sent"),
          ne(emailDrafts.status, "skipped"),
          eq(emailDrafts.replied, false)
        )
      )
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
  const alreadyReplied = await wasEmailMarkedReplied(userId, values.recipientEmail);
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
    replied: alreadyReplied,
    repliedAt: alreadyReplied ? timestamp : "",
    createdAt: timestamp,
    updatedAt: timestamp
  });
  await clearPostDraftSkipReason(userId, values.postId);
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
    phones?: string[];
  }>
) {
  const db = getDb();
  const timestamp = now();
  for (const row of rows) {
    const phones = Array.isArray(row.phones) ? row.phones : [];
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
        phonesJson: JSON.stringify(phones),
        createdAt: timestamp
      })
      .onConflictDoUpdate({
        target: [linkedinPosts.userId, linkedinPosts.postedByUrl, linkedinPosts.postedContent],
        set: {
          postedDate: row.postedDate,
          postUrl: row.postUrl,
          emailsJson: JSON.stringify(row.emails),
          phonesJson: JSON.stringify(phones)
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
