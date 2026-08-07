"use client";

import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { EXTENSION } from "@/lib/constants";
import type { PostDraftOutcome, PostFilter } from "@/lib/post-draft-status";

type DraftNote = {
  id: number;
  draft_id: number;
  note: string;
  created_at: string;
};

type Draft = {
  id: number;
  post_id?: number;
  recipient_email: string;
  recipient_name: string;
  subject: string;
  body: string;
  status: string;
  phone?: string;
  location?: string;
  company?: string;
  contact_name?: string;
  hiring_summary?: string;
  talking_points?: string;
  job_post?: string;
  matched_skills?: string;
  called?: boolean;
  called_at?: string;
  replied?: boolean;
  replied_at?: string;
  created_at?: string;
  sent_at?: string;
  notes?: DraftNote[];
};

type Smtp = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from_email: string;
  from_name: string;
  attach_resume: boolean;
  configured: boolean;
  has_password: boolean;
};

type DailyQuota = {
  plan: string;
  daily_post_limit: number;
  used: number;
  remaining: number;
  day: string;
};

type QuotaBundle = {
  plan: string;
  daily_post_limit: number;
  scrape?: {
    plan: string;
    daily_post_limit: number;
    posts_fetched_today: number;
    remaining: number;
  };
  import: DailyQuota;
  send: DailyQuota;
};

type PostRow = Record<string, string | number> & {
  draft_status?: PostDraftOutcome;
};

type WorkspaceCounts = {
  posts: {
    total: number;
    valid: number;
    invalid: number;
    pending: number;
    drafted: number;
    skipped: number;
  };
  drafts: {
    total: number;
    unsent: number;
    draft: number;
    sent: number;
    skipped: number;
    replied: number;
  };
};

type ExtensionInfo = {
  required_version: string;
  update_url: string;
  message: string;
};

type Stats = {
  profile: Record<string, string | boolean | number> | null;
  posts: PostRow[];
  drafts: Draft[];
  smtp: Smtp;
  quota: QuotaBundle | null;
  counts: WorkspaceCounts;
  extension: ExtensionInfo | null;
};

type PageId = "profile" | "leads" | "send";
type StatusFilter = "all" | "unsent" | "draft" | "sent" | "skipped" | "replied";
type PageSize = 10 | 25 | 50 | 100;

type PostsPageData = {
  items: PostRow[];
  total: number;
  page: number;
  dates: string[];
  counts?: WorkspaceCounts["posts"];
};

type DraftsPageData = {
  items: Draft[];
  total: number;
  page: number;
  dates: string[];
};

const emptyCounts: WorkspaceCounts = {
  posts: { total: 0, valid: 0, invalid: 0, pending: 0, drafted: 0, skipped: 0 },
  drafts: { total: 0, unsent: 0, draft: 0, sent: 0, skipped: 0, replied: 0 }
};

const EMPTY_POSTS: PostRow[] = [];
const EMPTY_DRAFTS: Draft[] = [];
const EMPTY_DATES: string[] = [];

const PAGES: Array<{ id: PageId; label: string; step: number }> = [
  { id: "profile", label: "Your profile", step: 1 },
  { id: "leads", label: "Find people", step: 2 },
  { id: "send", label: "Send emails", step: 3 }
];

const defaultSmtp: Smtp = {
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

function parseSkills(raw: string) {
  return raw
    .split(/[,|\n]/)
    .map((skill) => skill.trim())
    .filter(Boolean)
    .filter((skill, index, list) => list.findIndex((item) => item.toLowerCase() === skill.toLowerCase()) === index);
}

function initials(name: string, email: string) {
  const source = (name || email || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function statusBadge(status: string, replied?: boolean) {
  if (replied) return <span className="badge replied">Replied</span>;
  if (status === "sent") return <span className="badge sent">Sent</span>;
  if (status === "skipped") return <span className="badge skipped">Skipped</span>;
  if (status === "failed") return <span className="badge failed">Failed</span>;
  if (status === "draft") return <span className="badge draft">Draft</span>;
  return <span className="badge applied">{status}</span>;
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function toLocalDay(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDayLabel(day: string) {
  const date = new Date(`${day}T12:00:00`);
  if (Number.isNaN(date.getTime())) return day;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function parsePostEmails(emailsJson: unknown): string[] {
  try {
    const parsed = JSON.parse(String(emailsJson || "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed.map((email) => String(email || "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function parsePostPhones(phonesJson: unknown): string[] {
  try {
    const parsed = JSON.parse(String(phonesJson || "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed.map((phone) => String(phone || "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function truncateText(value: string, max = 120) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text || "—";
  return `${text.slice(0, max - 1)}…`;
}

/** Compact page window for enterprise pagination: 1 … 4 5 6 … 20 */
function paginationItems(current: number, total: number): Array<number | "gap"> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set<number>([1, total, current, current - 1, current + 1]);
  if (current <= 3) {
    set.add(2);
    set.add(3);
    set.add(4);
  }
  if (current >= total - 2) {
    set.add(total - 1);
    set.add(total - 2);
    set.add(total - 3);
  }
  const sorted = [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out: Array<number | "gap"> = [];
  for (let i = 0; i < sorted.length; i += 1) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push("gap");
    out.push(sorted[i]);
  }
  return out;
}

function TablePagination({
  page,
  totalPages,
  pageStart,
  pageEnd,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
  noun = "results"
}: {
  page: number;
  totalPages: number;
  pageStart: number;
  pageEnd: number;
  total: number;
  pageSize: PageSize;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: PageSize) => void;
  noun?: string;
}) {
  const items = paginationItems(page, totalPages);
  return (
    <div className="pagination pagination-enterprise">
      <div className="pagination-left">
        <span className="pagination-meta">
          {total === 0 ? `0 ${noun}` : `${pageStart}–${pageEnd} of ${total.toLocaleString()} ${noun}`}
        </span>
        <label className="pagination-size">
          <span>Rows per page</span>
          <select
            className="toolbar-select pagination-size-select"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value) as PageSize)}
            aria-label="Rows per page"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
      </div>
      <div className="pagination-controls" role="navigation" aria-label="Pagination">
        <button
          type="button"
          className="page-btn"
          disabled={page <= 1}
          onClick={() => onPageChange(1)}
          aria-label="First page"
        >
          «
        </button>
        <button
          type="button"
          className="page-btn"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          aria-label="Previous page"
        >
          ‹
        </button>
        {items.map((item, index) =>
          item === "gap" ? (
            <span key={`gap-${index}`} className="page-ellipsis" aria-hidden>
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              className={`page-btn page-num${item === page ? " current" : ""}`}
              aria-current={item === page ? "page" : undefined}
              aria-label={`Page ${item}`}
              onClick={() => onPageChange(item)}
            >
              {item}
            </button>
          )
        )}
        <button
          type="button"
          className="page-btn"
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          aria-label="Next page"
        >
          ›
        </button>
        <button
          type="button"
          className="page-btn"
          disabled={page >= totalPages}
          onClick={() => onPageChange(totalPages)}
          aria-label="Last page"
        >
          »
        </button>
      </div>
    </div>
  );
}

function QuotaMeter({
  label,
  used,
  limit,
  remaining
}: {
  label: string;
  used: number;
  limit: number;
  remaining: number | null;
}) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const left = remaining == null ? "—" : String(remaining);
  return (
    <div className="quota-meter">
      <div className="quota-meter-row">
        <span>{label}</span>
        <strong>
          {used}/{limit}
        </strong>
      </div>
      <div className="quota-meter-bar" aria-hidden>
        <div className="quota-meter-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="quota-meter-left">{left} left today</div>
    </div>
  );
}

function isUnsent(draft: Draft) {
  return draft.status !== "sent" && draft.status !== "skipped" && !draft.replied;
}

function FileDropzone({
  id,
  name,
  accept,
  required,
  label,
  hint,
  fileName,
  onFile
}: {
  id: string;
  name: string;
  accept: string;
  required?: boolean;
  label: string;
  hint: string;
  fileName: string;
  onFile: (file: File | null) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <div
        className={`dropzone${dragOver ? " dragover" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0] || null;
          if (file && inputRef.current) {
            const dt = new DataTransfer();
            dt.items.add(file);
            inputRef.current.files = dt.files;
            onFile(file);
          }
        }}
      >
        <input
          ref={inputRef}
          id={id}
          name={name}
          type="file"
          accept={accept}
          required={required}
          onChange={(e) => onFile(e.target.files?.[0] || null)}
        />
        <div className="dropzone-title">{label}</div>
        <div className="dropzone-hint">{hint}</div>
      </div>
      {fileName ? <div className="file-pill">{fileName}</div> : null}
    </div>
  );
}

function PageHeader({
  title,
  subtitle,
  actions
}: {
  title: string;
  subtitle: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      {actions ? <div className="page-header-actions">{actions}</div> : null}
    </header>
  );
}

export default function Home() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<{ id: string; email: string; name: string } | null>(null);
  const [currentPage, setCurrentPage] = useState<PageId>("profile");
  const [smtpAdvanced, setSmtpAdvanced] = useState(false);
  const [emailSetupOpen, setEmailSetupOpen] = useState(true);
  const [stats, setStats] = useState<Stats>({
    profile: null,
    posts: [],
    drafts: [],
    smtp: defaultSmtp,
    quota: null,
    counts: emptyCounts,
    extension: null
  });
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [immediateJoiner, setImmediateJoiner] = useState(false);
  const [skillList, setSkillList] = useState<string[]>([]);
  const [newSkill, setNewSkill] = useState("");
  const [resumeFileName, setResumeFileName] = useState("");
  const [csvFileName, setCsvFileName] = useState("");
  const [smtpForm, setSmtpForm] = useState({
    host: defaultSmtp.host,
    port: String(defaultSmtp.port),
    user: "",
    pass: "",
    from_email: "",
    from_name: "",
    attach_resume: true
  });
  const [bulkAttachResume, setBulkAttachResume] = useState(true);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [selectedPostIds, setSelectedPostIds] = useState<number[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ recipient_email: "", subject: "", body: "" });
  const [noteText, setNoteText] = useState("");
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [postFilter, setPostFilter] = useState<PostFilter>("all");
  const [postSearch, setPostSearch] = useState("");
  const [debouncedPostSearch, setDebouncedPostSearch] = useState("");
  const [postDateFilter, setPostDateFilter] = useState("");
  const [draftDateFilter, setDraftDateFilter] = useState("");
  const [postPage, setPostPage] = useState(1);
  const [postPageSize, setPostPageSize] = useState<PageSize>(25);
  const emailSetupInit = useRef(false);
  const knownPostTotal = useRef(0);
  const knownDraftTotal = useRef(0);
  const sendingRef = useRef(false);
  const sendAbortRef = useRef<AbortController | null>(null);

  const postsQueryKey = [
    "posts",
    {
      page: postPage,
      pageSize: postPageSize,
      filter: postFilter,
      q: debouncedPostSearch,
      date: postDateFilter
    }
  ] as const;

  const draftsQueryKey = [
    "drafts",
    {
      page,
      pageSize,
      status: statusFilter,
      q: debouncedSearch,
      date: draftDateFilter
    }
  ] as const;

  const postsQuery = useQuery({
    queryKey: postsQueryKey,
    enabled: authReady,
    queryFn: async (): Promise<PostsPageData> => {
      const params = new URLSearchParams({
        page: String(postPage),
        pageSize: String(postPageSize),
        filter: postFilter,
        q: debouncedPostSearch,
        date: postDateFilter
      });
      const response = await fetch(`/api/posts?${params}`, { cache: "no-store" });
      if (response.status === 401) {
        setUser(null);
        setAuthReady(true);
        router.replace("/login");
        throw new Error("Sign in required.");
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load posts.");
      return {
        items: (data.items || []) as PostRow[],
        total: Number(data.total) || 0,
        page: Number(data.page) || postPage,
        dates: Array.isArray(data.dates) ? data.dates : [],
        counts: data.counts
      };
    }
  });

  const draftsQuery = useQuery({
    queryKey: draftsQueryKey,
    enabled: authReady,
    queryFn: async (): Promise<DraftsPageData> => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        status: statusFilter,
        q: debouncedSearch,
        date: draftDateFilter
      });
      const response = await fetch(`/api/drafts?${params}`, { cache: "no-store" });
      if (response.status === 401) {
        setUser(null);
        setAuthReady(true);
        router.replace("/login");
        throw new Error("Sign in required.");
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load drafts.");
      return {
        items: (data.items || []) as Draft[],
        total: Number(data.total) || 0,
        page: Number(data.page) || page,
        dates: Array.isArray(data.dates) ? data.dates : []
      };
    }
  });

  const pagePosts = postsQuery.data?.items ?? EMPTY_POSTS;
  const postDateOptions = postsQuery.data?.dates ?? EMPTY_DATES;
  const postsLoading = postsQuery.isPending;
  if (postsQuery.data && typeof postsQuery.data.total === "number") {
    knownPostTotal.current = postsQuery.data.total;
  }
  const postTotal = postsQuery.data?.total ?? knownPostTotal.current;

  const pageDrafts = draftsQuery.data?.items ?? EMPTY_DRAFTS;
  const draftDateOptions = draftsQuery.data?.dates ?? EMPTY_DATES;
  const draftsLoading = draftsQuery.isPending;
  if (draftsQuery.data && typeof draftsQuery.data.total === "number") {
    knownDraftTotal.current = draftsQuery.data.total;
  }
  const draftTotal = draftsQuery.data?.total ?? knownDraftTotal.current;

  async function refresh() {
    const response = await fetch("/api/status", { cache: "no-store" });
    if (response.status === 401) {
      setUser(null);
      setAuthReady(true);
      router.replace("/login");
      return;
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to load workspace.");
    if (data.user) setUser(data.user);
    const smtp = data.smtp || defaultSmtp;
    const nextCounts: WorkspaceCounts = {
      posts: data.counts?.posts || emptyCounts.posts,
      drafts: data.counts?.drafts || emptyCounts.drafts
    };
    setStats((prev) => ({
      ...prev,
      profile: data.profile || null,
      smtp,
      quota: data.quota || null,
      counts: nextCounts,
      extension: data.extension
        ? {
            required_version: String(data.extension.required_version || ""),
            update_url: String(data.extension.update_url || ""),
            message: String(data.extension.message || "")
          }
        : null
    }));
    setImmediateJoiner(Boolean(data.profile?.immediate_joiner));
    setSkillList(parseSkills(String(data.profile?.top_skills || "")));
    setBulkAttachResume(smtp.attach_resume !== false);
    if (!emailSetupInit.current) {
      setEmailSetupOpen(!smtp.configured);
      emailSetupInit.current = true;
    }
    setSmtpForm((prev) => ({
      host: smtp.host || "smtp.gmail.com",
      port: String(smtp.port || 587),
      user: smtp.user || "",
      pass: prev.pass,
      from_email: smtp.from_email || "",
      from_name: smtp.from_name || "",
      attach_resume: smtp.attach_resume !== false
    }));
    setAuthReady(true);
  }

  async function refreshAll() {
    await refresh();
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["posts"] }),
      queryClient.invalidateQueries({ queryKey: ["drafts"] })
    ]);
  }

  useEffect(() => { refresh().catch(() => { setAuthReady(true); router.replace("/login"); }); }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedPostSearch(postSearch), 300);
    return () => clearTimeout(timer);
  }, [postSearch]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (postsQuery.error) {
      setStatus(postsQuery.error instanceof Error ? postsQuery.error.message : "Failed to load posts.");
    }
  }, [postsQuery.error]);

  useEffect(() => {
    if (draftsQuery.error) {
      setStatus(draftsQuery.error instanceof Error ? draftsQuery.error.message : "Failed to load drafts.");
    }
  }, [draftsQuery.error]);

  useEffect(() => {
    const counts = postsQuery.data?.counts;
    if (!counts) return;
    setStats((prev) => ({
      ...prev,
      counts: { ...prev.counts, posts: counts }
    }));
  }, [postsQuery.data?.counts]);

  // Only apply server page correction after a successful load (e.g. out-of-range clamp).
  useEffect(() => {
    if (postsLoading || !postsQuery.data) return;
    const apiPage = postsQuery.data.page;
    if (apiPage && apiPage !== postPage) setPostPage(apiPage);
  }, [postsLoading, postsQuery.data, postPage]);

  useEffect(() => {
    if (draftsLoading || !draftsQuery.data) return;
    const apiPage = draftsQuery.data.page;
    if (apiPage && apiPage !== page) setPage(apiPage);
  }, [draftsLoading, draftsQuery.data, page]);

  useEffect(() => {
    const existing = new Set(pagePosts.map((post) => Number(post.id)));
    setSelectedPostIds((prev) => prev.filter((id) => existing.has(id)));
  }, [pagePosts]);

  useEffect(() => {
    const existing = new Set(pageDrafts.map((draft) => draft.id));
    setSelectedIds((prev) => prev.filter((id) => existing.has(id)));
  }, [pageDrafts]);

  useEffect(() => {
    const pageParam = new URLSearchParams(window.location.search).get("page");
    if (pageParam === "profile" || pageParam === "leads" || pageParam === "send") setCurrentPage(pageParam);
  }, []);

  async function signOut() {
    setBusy(true);
    try {
      const { createClient } = await import("@/utils/supabase/client");
      const supabase = createClient();
      await supabase.auth.signOut();
      router.replace("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (detailId == null) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeDetails();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [detailId]);

  useEffect(() => { setPage(1); }, [statusFilter, pageSize, searchQuery, draftDateFilter]);
  useEffect(() => { setPostPage(1); }, [postFilter, postPageSize, postSearch, postDateFilter]);

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!sendingRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  function showStatus(message: string) {
    if (statusTimer.current) {
      clearTimeout(statusTimer.current);
      statusTimer.current = null;
    }
    setStatus(message);
  }

  useEffect(() => {
    if (!status || busy) return;
    const isError = /fail|error|required|invalid|expired/i.test(status);
    statusTimer.current = setTimeout(() => setStatus(""), isError ? 8000 : 4500);
    return () => {
      if (statusTimer.current) clearTimeout(statusTimer.current);
    };
  }, [status, busy]);

  useEffect(() => {
    return () => {
      if (statusTimer.current) clearTimeout(statusTimer.current);
    };
  }, []);

  async function uploadResume(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); showStatus("Reading resume and extracting profile…");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/resume", { method: "POST", body: form });
    const data = await response.json(); setBusy(false); showStatus(data.error || "Candidate profile saved.");
    if (response.ok) refreshAll();
  }

  async function persistSkills(nextSkills: string[]) {
    setSkillList(nextSkills);
    if (!stats.profile) return;
    setBusy(true); showStatus("Saving skills…");
    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ top_skills: nextSkills.join(", ") })
    });
    const data = await response.json(); setBusy(false);
    showStatus(data.error || "Skills updated. Regenerate drafts to use them in new emails.");
    if (response.ok) refreshAll();
    else setSkillList(parseSkills(String(stats.profile.top_skills || "")));
  }

  function addSkill(event: React.FormEvent) {
    event.preventDefault();
    const skill = newSkill.trim().replace(/,+/g, " ").replace(/\s+/g, " ");
    if (!skill) return;
    const exists = skillList.some((item) => item.toLowerCase() === skill.toLowerCase());
    if (exists) {
      showStatus(`"${skill}" is already in your skills list.`);
      setNewSkill("");
      return;
    }
    setNewSkill("");
    persistSkills([...skillList, skill]);
  }

  function removeSkill(skill: string) {
    persistSkills(skillList.filter((item) => item !== skill));
  }

  async function toggleImmediateJoiner(checked: boolean) {
    setImmediateJoiner(checked);
    if (!stats.profile) return;
    setBusy(true); showStatus("Saving joining availability…");
    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ immediate_joiner: checked })
    });
    const data = await response.json(); setBusy(false);
    showStatus(
      data.error ||
        (checked
          ? "Marked as immediate joiner. Regenerate drafts to include it in emails."
          : "Immediate joiner turned off. Regenerate drafts if needed.")
    );
    if (response.ok) refreshAll();
    else setImmediateJoiner(!checked);
  }

  async function importCsv(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); showStatus("Importing leads from your file… Please wait.");
    const response = await fetch("/api/linkedin/import", { method: "POST", body: new FormData(event.currentTarget) });
    const data = await response.json(); setBusy(false);
    if (!response.ok) {
      showStatus(data.error || "CSV import failed.");
      return;
    }
    const parts = [`Imported ${data.imported || 0} posts`];
    if (data.truncated) parts.push(`${data.truncated} skipped (daily import limit)`);
    if (data.quota) parts.push(`${data.quota.remaining} import slots left today`);
    showStatus(parts.join(" · ") + ".");
    refreshAll();
  }

  async function generate(postIds?: number[]) {
    const ids = (postIds || []).filter((id) => Number.isFinite(id) && id > 0);
    setBusy(true);
    let createdTotal = 0;
    let skippedTotal = 0;
    let lastSkipReason = "";

    try {
      if (ids.length) {
        const queue = [...ids];
        const total = ids.length;
        while (queue.length) {
          const chunkIds = queue.splice(0, 20);
          const waiting = queue.length;
          const writing = chunkIds.length;
          showStatus(
            `Writing emails… ${createdTotal} created · writing ${writing} now · ${waiting} waiting (${total} total)`
          );
          const response = await fetch("/api/drafts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ postIds: chunkIds })
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            showStatus(data.error || "Draft generation failed.");
            return;
          }
          createdTotal += Number(data.created) || 0;
          skippedTotal += Number(data.skipped) || 0;
          const reasons = Array.isArray(data.skip_reasons) ? data.skip_reasons : [];
          if (reasons[0]?.reason) lastSkipReason = String(reasons[0].reason);
        }
      } else {
        let guard = 0;
        let remaining = 1;
        while (remaining > 0 && guard < 50) {
          guard += 1;
          showStatus(
            remaining > 1
              ? `Writing emails… ${createdTotal} created · ~${remaining} still pending`
              : `Writing emails… ${createdTotal} created · finishing…`
          );
          const response = await fetch("/api/drafts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({})
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            showStatus(data.error || "Draft generation failed.");
            return;
          }
          createdTotal += Number(data.created) || 0;
          skippedTotal += Number(data.skipped) || 0;
          remaining = Number(data.remaining) || 0;
          if (!(Number(data.pending) > 0) && remaining <= 0) break;
        }
      }

      if (ids.length === 1 && !createdTotal && skippedTotal) {
        showStatus(lastSkipReason || "No draft created — marked as skipped (no skill match).");
      } else {
        const parts = [`Created ${createdTotal} draft${createdTotal === 1 ? "" : "s"}`];
        if (skippedTotal) parts.push(`${skippedTotal} skipped`);
        showStatus(parts.join(" · ") + ".");
      }
      await refreshAll();
    } catch (error) {
      showStatus(error instanceof Error ? error.message : "Draft generation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function clearAllDrafts() {
    if (!window.confirm("Clear all drafts? This cannot be undone.")) return;
    setBusy(true); showStatus("Clearing drafts…");
    const response = await fetch("/api/drafts", { method: "DELETE" });
    const data = await response.json(); setBusy(false);
    showStatus(data.error || `Cleared ${data.deleted || 0} drafts.`);
    if (response.ok) {
      setSelectedIds([]);
      refreshAll();
    }
  }

  async function deleteSelectedDrafts() {
    if (!selectedIds.length) return;
    if (!window.confirm(`Delete ${selectedIds.length} selected draft(s)? This cannot be undone.`)) return;
    setBusy(true); showStatus("Deleting selected drafts…");
    const response = await fetch("/api/drafts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selectedIds })
    });
    const data = await response.json(); setBusy(false);
    showStatus(data.error || `Deleted ${data.deleted || 0} draft(s).`);
    if (response.ok) {
      setSelectedIds([]);
      cancelEdit();
      refreshAll();
    }
  }

  async function saveSmtp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); showStatus("Connecting your email…");
    const response = await fetch("/api/smtp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        host: smtpForm.host,
        port: Number(smtpForm.port) || 587,
        secure: Number(smtpForm.port) === 465,
        user: smtpForm.user,
        pass: smtpForm.pass,
        from_email: smtpForm.from_email || smtpForm.user,
        from_name: smtpForm.from_name,
        attach_resume: smtpForm.attach_resume
      })
    });
    const data = await response.json(); setBusy(false);
    showStatus(data.error || "Email connected. You can send now.");
    if (response.ok) {
      setSmtpForm((prev) => ({ ...prev, pass: "" }));
      setBulkAttachResume(smtpForm.attach_resume);
      setEmailSetupOpen(false);
      refreshAll();
    }
  }

  function startEdit(draft: Draft) {
    setEditingId(draft.id);
    setEditForm({
      recipient_email: draft.recipient_email,
      subject: draft.subject,
      body: draft.body
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({ recipient_email: "", subject: "", body: "" });
  }

  function openDetails(draft: Draft) {
    setDetailId(draft.id);
    setNoteText("");
    cancelEdit();
  }

  function closeDetails() {
    setDetailId(null);
    setNoteText("");
    cancelEdit();
  }

  async function saveDraft(event: React.FormEvent) {
    event.preventDefault();
    if (editingId == null) return;
    setBusy(true); showStatus("Saving draft…");
    const response = await fetch("/api/drafts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editingId, ...editForm })
    });
    const data = await response.json(); setBusy(false);
    if (!response.ok) {
      showStatus(data.error || "Failed to save draft.");
      return;
    }
    showStatus("Draft updated.");
    cancelEdit();
    refreshAll();
  }

  function patchDraftLocal(draftId: number, patch: Partial<Draft>) {
    queryClient.setQueryData<DraftsPageData>(draftsQueryKey, (prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map((item) => (item.id === draftId ? { ...item, ...patch } : item))
      };
    });
  }

  function applyDraftFlagCounts(before: Draft, after: Partial<Draft>) {
    const wasReplied = Boolean(before.replied);
    const nowReplied = after.replied == null ? wasReplied : Boolean(after.replied);
    if (wasReplied === nowReplied) return;

    setStats((prev) => {
      const drafts = { ...prev.counts.drafts };
      const wasUnsent =
        before.status !== "sent" && before.status !== "skipped" && !wasReplied;
      const nowUnsent =
        (after.status ?? before.status) !== "sent" &&
        (after.status ?? before.status) !== "skipped" &&
        !nowReplied;

      if (wasReplied && !nowReplied) drafts.replied = Math.max(0, drafts.replied - 1);
      if (!wasReplied && nowReplied) drafts.replied += 1;
      if (wasUnsent && !nowUnsent) drafts.unsent = Math.max(0, drafts.unsent - 1);
      if (!wasUnsent && nowUnsent) drafts.unsent += 1;

      return { ...prev, counts: { ...prev.counts, drafts } };
    });
  }

  async function toggleCalled(draft: Draft, called: boolean) {
    const previous = { called: Boolean(draft.called), called_at: draft.called_at || "" };
    const optimistic = {
      called,
      called_at: called ? new Date().toISOString() : ""
    };
    patchDraftLocal(draft.id, optimistic);

    try {
      const response = await fetch("/api/drafts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: draft.id, called })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to update called mark.");
      if (data.draft) {
        patchDraftLocal(draft.id, {
          called: Boolean(data.draft.called),
          called_at: String(data.draft.called_at || "")
        });
      }
      showStatus(called ? "Marked as called." : "Call mark cleared.");
    } catch (error) {
      patchDraftLocal(draft.id, previous);
      showStatus(error instanceof Error ? error.message : "Failed to update called mark.");
    }
  }

  async function toggleReplied(draft: Draft, replied: boolean) {
    const previous = {
      replied: Boolean(draft.replied),
      replied_at: draft.replied_at || ""
    };
    const optimistic = {
      replied,
      replied_at: replied ? new Date().toISOString() : ""
    };
    patchDraftLocal(draft.id, optimistic);
    applyDraftFlagCounts(draft, optimistic);

    try {
      const response = await fetch("/api/drafts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: draft.id, replied })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to update replied mark.");
      if (data.draft) {
        patchDraftLocal(draft.id, {
          replied: Boolean(data.draft.replied),
          replied_at: String(data.draft.replied_at || "")
        });
      }
      showStatus(
        replied
          ? "Marked as replied. Automation will not email this address again."
          : "Replied mark cleared."
      );
    } catch (error) {
      patchDraftLocal(draft.id, previous);
      applyDraftFlagCounts({ ...draft, ...optimistic }, previous);
      showStatus(error instanceof Error ? error.message : "Failed to update replied mark.");
    }
  }

  async function addNote(event: React.FormEvent) {
    event.preventDefault();
    if (detailId == null || !noteText.trim()) return;
    setBusy(true); showStatus("Saving note…");
    const response = await fetch("/api/drafts/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draftId: detailId, note: noteText })
    });
    const data = await response.json(); setBusy(false);
    if (!response.ok) {
      showStatus(data.error || "Failed to save note.");
      return;
    }
    setNoteText("");
    showStatus("Note added.");
    refreshAll();
  }

  async function removeNote(noteId: number) {
    if (!window.confirm("Delete this note?")) return;
    setBusy(true); showStatus("Deleting note…");
    const response = await fetch("/api/drafts/notes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: noteId })
    });
    const data = await response.json(); setBusy(false);
    showStatus(data.error || "Note deleted.");
    if (response.ok) refreshAll();
  }

  function toggleSelected(id: number, checked: boolean) {
    setSelectedIds((prev) => checked ? Array.from(new Set([...prev, id])) : prev.filter((value) => value !== id));
  }

  function stopSending() {
    sendAbortRef.current?.abort();
  }

  async function sendDrafts(options: { draftId?: number; draftIds?: number[]; all?: boolean }) {
    const count = options.all
      ? unsentCount
      : options.draftIds?.length || (options.draftId ? 1 : 0);
    const label = options.all
      ? `all ${count} unsent drafts`
      : options.draftIds?.length
        ? `${options.draftIds.length} selected draft(s)`
        : "this draft";
    const withResume = bulkAttachResume ? " with resume attached" : " without resume";
    if (!window.confirm(
      `Send ${label}${withResume}?\n\nPlease don’t refresh or close this page until sending finishes.`
    )) return;

    // Small batches so each request stays under Vercel Hobby timeouts (~10s).
    const BATCH = 5;
    const abort = new AbortController();
    sendAbortRef.current = abort;
    sendingRef.current = true;
    setSending(true);
    setBusy(true);

    let sentTotal = 0;
    let skippedTotal = 0;
    let limitedTotal = 0;
    let failedTotal = 0;
    let attachedResume = false;
    let stopped = false;
    let lastQuota = stats.quota?.send || null;

    const applyBatchResults = (
      results: Array<{ id: number; status: string }> | undefined,
      quota: DailyQuota | undefined
    ) => {
      if (quota) {
        lastQuota = quota;
        setStats((prev) =>
          prev.quota
            ? { ...prev, quota: { ...prev.quota, send: quota } }
            : prev
        );
      }
      if (!results?.length) return;
      const byId = new Map(results.map((row) => [row.id, row.status]));
      const sentAt = new Date().toISOString();
      queryClient.setQueryData<DraftsPageData>(draftsQueryKey, (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map((draft) => {
            const status = byId.get(draft.id);
            if (!status || status === "limited") return draft;
            return {
              ...draft,
              status: status === "sent" || status === "skipped" || status === "failed" ? status : draft.status,
              sent_at: status === "sent" ? sentAt : draft.sent_at
            };
          })
        };
      });
      setSelectedIds((prev) => prev.filter((id) => {
        const status = byId.get(id);
        return !status || status === "limited";
      }));
    };

    try {
      if (options.all) {
        let guard = 0;
        let remaining = Math.max(1, count);
        let prevRemaining = Infinity;
        while (remaining > 0 && guard < 500) {
          if (abort.signal.aborted) {
            stopped = true;
            break;
          }
          guard += 1;
          showStatus(
            `Sending emails… don’t refresh · ${sentTotal} sent` +
              (skippedTotal ? ` · ${skippedTotal} skipped` : "") +
              (remaining ? ` · ${remaining} left` : "")
          );
          let response: Response;
          try {
            response = await fetch("/api/send", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                all: true,
                limit: BATCH,
                attach_resume: bulkAttachResume
              }),
              signal: abort.signal
            });
          } catch (error) {
            if (abort.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
              stopped = true;
              break;
            }
            throw error;
          }
          const data = await response.json();
          if (!response.ok) {
            showStatus(data.error || "Send failed.");
            return;
          }
          const batchSent = Number(data.sent) || 0;
          const batchSkipped = Number(data.skipped) || 0;
          const batchLimited = Number(data.limited) || 0;
          const batchFailed = Number(data.failed) || 0;
          sentTotal += batchSent;
          skippedTotal += batchSkipped;
          limitedTotal += batchLimited;
          failedTotal += batchFailed;
          if (data.attached_resume) attachedResume = true;
          applyBatchResults(data.results, data.quota);
          remaining = Number(data.remaining) || 0;
          if (data.done) break;
          if (batchLimited && remaining > 0 && !batchSent) {
            // Daily quota exhausted — stop looping.
            break;
          }
          // No forward progress (same remaining, nothing sent) — avoid infinite loops.
          if (!batchSent && remaining >= prevRemaining) break;
          prevRemaining = remaining;
        }
      } else {
        const ids =
          options.draftIds?.length
            ? [...options.draftIds]
            : options.draftId
              ? [options.draftId]
              : [];
        const queue = [...ids];
        const total = queue.length;
        while (queue.length) {
          if (abort.signal.aborted) {
            stopped = true;
            break;
          }
          const chunk = queue.splice(0, BATCH);
          showStatus(
            `Sending emails… don’t refresh · ${sentTotal}/${total} sent · ${queue.length} left`
          );
          let response: Response;
          try {
            response = await fetch("/api/send", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                draftIds: chunk,
                limit: chunk.length,
                attach_resume: bulkAttachResume
              }),
              signal: abort.signal
            });
          } catch (error) {
            if (abort.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
              stopped = true;
              break;
            }
            throw error;
          }
          const data = await response.json();
          if (!response.ok) {
            showStatus(data.error || "Send failed.");
            return;
          }
          sentTotal += Number(data.sent) || 0;
          skippedTotal += Number(data.skipped) || 0;
          limitedTotal += Number(data.limited) || 0;
          failedTotal += Number(data.failed) || 0;
          if (data.attached_resume) attachedResume = true;
          applyBatchResults(data.results, data.quota);
          if (limitedTotal && !(Number(data.sent) || 0)) break;
        }
      }

      const parts = stopped
        ? [`Stopped · sent ${sentTotal}`]
        : [`Sent ${sentTotal}`];
      if (skippedTotal) parts.push(`${skippedTotal} skipped`);
      if (limitedTotal) parts.push(`${limitedTotal} held (daily send limit)`);
      if (failedTotal) parts.push(`${failedTotal} failed`);
      if (attachedResume) parts.push("resume attached");
      if (lastQuota) parts.push(`${lastQuota.remaining} sends left today`);
      showStatus(parts.join(" · ") + ".");
      await refreshAll();
    } finally {
      sendingRef.current = false;
      sendAbortRef.current = null;
      setSending(false);
      setBusy(false);
    }
  }

  const postsWithEmail = stats.counts.posts.valid;
  const postsWithoutEmail = stats.counts.posts.invalid;
  const postsDrafted = stats.counts.posts.drafted;
  const postsSkipped = stats.counts.posts.skipped;
  const postsPendingDraft = stats.counts.posts.pending;

  async function generatePending() {
    if (!postsPendingDraft) {
      showStatus("No pending posts to draft.");
      return;
    }
    setBusy(true);
    let createdTotal = 0;
    let skippedTotal = 0;
    try {
      let guard = 0;
      let remaining = 1;
      while (remaining > 0 && guard < 50) {
        guard += 1;
        showStatus(
          remaining > 1
            ? `Writing pending emails… ${createdTotal} created · ~${remaining} still pending`
            : `Writing pending emails… ${createdTotal} created · finishing…`
        );
        const response = await fetch("/api/drafts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pendingOnly: true })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          showStatus(data.error || "Draft generation failed.");
          return;
        }
        createdTotal += Number(data.created) || 0;
        skippedTotal += Number(data.skipped) || 0;
        remaining = Number(data.remaining) || 0;
        if (!(Number(data.pending) > 0) && remaining <= 0) break;
      }
      const parts = [`Created ${createdTotal} draft${createdTotal === 1 ? "" : "s"}`];
      if (skippedTotal) parts.push(`${skippedTotal} skipped`);
      showStatus(parts.join(" · ") + ".");
      await refreshAll();
    } catch (error) {
      showStatus(error instanceof Error ? error.message : "Draft generation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function generateOne(postId: number) {
    await generate([postId]);
  }

  async function deleteSelectedPosts() {
    const deletableIds = selectedPostIds.filter((id) => {
      const post = pagePosts.find((item) => Number(item.id) === id);
      return post?.draft_status?.kind !== "drafted";
    });
    if (!deletableIds.length) {
      showStatus("Drafted posts can’t be deleted. Remove the email in Step 3 first.");
      return;
    }
    const blocked = selectedPostIds.length - deletableIds.length;
    if (
      !window.confirm(
        blocked
          ? `Delete ${deletableIds.length} post(s)? ${blocked} drafted post(s) will be skipped.`
          : `Delete ${deletableIds.length} selected post(s)? This cannot be undone.`
      )
    ) {
      return;
    }
    setBusy(true);
    showStatus("Deleting selected posts…");
    const response = await fetch("/api/posts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: deletableIds })
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      showStatus(data.error || "Failed to delete posts.");
      return;
    }
    const parts = [`Deleted ${data.deleted || 0} post(s)`];
    if (data.blocked) parts.push(`${data.blocked} drafted skipped`);
    showStatus(parts.join(" · ") + ".");
    setSelectedPostIds([]);
    await refreshAll();
  }

  async function deleteOnePost(postId: number) {
    const post = pagePosts.find((item) => Number(item.id) === postId);
    if (post?.draft_status?.kind === "drafted") {
      showStatus("Drafted posts can’t be deleted. Remove the email in Step 3 first.");
      return;
    }
    if (!window.confirm("Delete this post? This cannot be undone.")) return;
    setBusy(true);
    showStatus("Deleting post…");
    const response = await fetch("/api/posts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [postId] })
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    showStatus(data.error || `Deleted ${data.deleted || 0} post(s).`);
    if (response.ok) {
      setSelectedPostIds((prev) => prev.filter((id) => id !== postId));
      await refreshAll();
    }
  }

  const postTotalPages = Math.max(1, Math.ceil(postTotal / postPageSize) || 1);
  const safePostPage = Math.min(postPage, postTotalPages);
  const postPageStart = postTotal === 0 ? 0 : (safePostPage - 1) * postPageSize + 1;
  const postPageEnd = Math.min(safePostPage * postPageSize, postTotal);

  useEffect(() => {
    if (postsLoading) return;
    if (postPage > postTotalPages) setPostPage(postTotalPages);
  }, [postPage, postTotalPages, postsLoading]);

  const postFilterOptions: Array<{ id: PostFilter; label: string; count: number }> = [
    { id: "all", label: "All", count: stats.counts.posts.total },
    { id: "valid", label: "Valid", count: postsWithEmail },
    { id: "invalid", label: "Invalid", count: postsWithoutEmail },
    { id: "pending", label: "Pending", count: postsPendingDraft },
    { id: "drafted", label: "Drafted", count: postsDrafted },
    { id: "skipped", label: "Skipped", count: postsSkipped }
  ];

  const unsentCount = stats.counts.drafts.unsent;
  const sentCount = stats.counts.drafts.sent;
  const importRemaining = stats.quota?.import?.remaining ?? null;
  const sendRemaining = stats.quota?.send?.remaining ?? null;
  const dailyLimit = stats.quota?.daily_post_limit ?? 50;
  const importUsed = stats.quota?.import?.used ?? 0;
  const sendUsed = stats.quota?.send?.used ?? 0;
  const selectedUnsentIds = selectedIds.filter((id) => {
    const draft = pageDrafts.find((item) => item.id === id);
    return draft && isUnsent(draft);
  });
  const selectedUnsent = selectedUnsentIds.length;
  const hasResumeFile = Boolean(stats.profile?.has_resume_file);
  const detailDraft = detailId == null ? null : pageDrafts.find((draft) => draft.id === detailId) || null;

  const totalPages = Math.max(1, Math.ceil(draftTotal / pageSize) || 1);
  const safePage = Math.min(page, totalPages);
  const pageStart = draftTotal === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const pageEnd = Math.min(safePage * pageSize, draftTotal);
  const pageIds = pageDrafts.map((draft) => draft.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
  const somePageSelected = pageIds.some((id) => selectedIds.includes(id)) && !allPageSelected;
  const pagePostIds = pagePosts.map((post) => Number(post.id));
  const deletablePagePostIds = pagePosts
    .filter((post) => post.draft_status?.kind !== "drafted")
    .map((post) => Number(post.id));
  const allPostsPageSelected =
    deletablePagePostIds.length > 0 &&
    deletablePagePostIds.every((id) => selectedPostIds.includes(id));
  const somePostsPageSelected =
    deletablePagePostIds.some((id) => selectedPostIds.includes(id)) && !allPostsPageSelected;

  useEffect(() => {
    if (draftsLoading) return;
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages, draftsLoading]);

  useEffect(() => {
    const node = document.getElementById("select-all-drafts") as HTMLInputElement | null;
    if (node) node.indeterminate = somePageSelected;
  }, [somePageSelected, allPageSelected]);

  useEffect(() => {
    const node = document.getElementById("select-all-posts") as HTMLInputElement | null;
    if (node) node.indeterminate = somePostsPageSelected;
  }, [somePostsPageSelected, allPostsPageSelected]);

  function selectPageRecords(checked: boolean) {
    setSelectedIds((prev) => {
      if (checked) return Array.from(new Set([...prev, ...pageIds]));
      const remove = new Set(pageIds);
      return prev.filter((id) => !remove.has(id));
    });
  }

  function selectPostPageRecords(checked: boolean) {
    setSelectedPostIds((prev) => {
      if (checked) return Array.from(new Set([...prev, ...deletablePagePostIds]));
      const remove = new Set(deletablePagePostIds);
      return prev.filter((id) => !remove.has(id));
    });
  }

  function navMeta(id: PageId): { dot: "done" | "pending" | "empty"; badge?: string } {
    if (id === "profile") return { dot: stats.profile ? "done" : "empty" };
    if (id === "leads") {
      const ready = stats.counts.posts.total > 0 && stats.counts.drafts.total > 0;
      return {
        dot: ready ? "done" : stats.counts.posts.total ? "pending" : "empty",
        badge: stats.counts.posts.total ? String(stats.counts.posts.total) : undefined
      };
    }
    return {
      dot: stats.smtp.configured && stats.counts.drafts.total ? "done" : stats.smtp.configured ? "pending" : "empty",
      badge: unsentCount ? String(unsentCount) : undefined
    };
  }

  const profileReady = Boolean(stats.profile);
  const leadsImported = stats.counts.posts.total > 0;
  const draftsReady = stats.counts.drafts.total > 0;
  const emailReady = stats.smtp.configured;

  if (!authReady || !user) {
    return <div className="auth-loading"><p>Loading workspace…</p></div>;
  }

  const displayName = user.name || user.email;
  const planName = (stats.quota?.plan || "free").replace(/_/g, " ");
  const planLabel = planName.replace(/\b\w/g, (c) => c.toUpperCase());
  const scrapeUsed = stats.quota?.scrape?.posts_fetched_today ?? 0;
  const scrapeRemaining = stats.quota?.scrape?.remaining ?? null;
  const toastError = Boolean(status && /fail|error|required|invalid|expired/i.test(status));
  const toastKind = busy ? "loading" : toastError ? "error" : status ? "success" : null;
  const upgradeHref = `/contact?${new URLSearchParams({
    name: user.name || "",
    email: user.email || "",
    plan: "pro",
    source: "dashboard-upgrade",
    message: `I'd like to upgrade from my ${planLabel} plan. Please raise my daily limits / switch me to Pro.`
  }).toString()}`;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img className="sidebar-logo" src="/brand/reachpod-logo.png" alt="" width={28} height={28} />
          <div>
            <h1>ReachPod</h1>
            <span>LinkedIn outreach</span>
          </div>
        </div>
        <nav className="sidebar-nav">
          {PAGES.map((item) => {
            const meta = navMeta(item.id);
            return (
              <button
                key={item.id}
                type="button"
                className={`nav-item${currentPage === item.id ? " active" : ""}`}
                onClick={() => setCurrentPage(item.id)}
              >
                <span className={`nav-dot ${meta.dot}`} aria-hidden />
                <span className="nav-label">
                  <span className="nav-step-num">{item.step}</span>
                  {item.label}
                </span>
                {meta.badge ? <span className="nav-badge">{meta.badge}</span> : null}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-quota" aria-label="Plan and daily quotas">
          <div className="sidebar-quota-head">
            <span className="plan-pill">{planLabel}</span>
            <span className="quota-cap">{dailyLimit}/day</span>
          </div>
          <div className="quota-meters">
            <QuotaMeter label="Scrape" used={scrapeUsed} limit={dailyLimit} remaining={scrapeRemaining} />
            <QuotaMeter label="Import leads" used={importUsed} limit={dailyLimit} remaining={importRemaining} />
            <QuotaMeter label="Emails sent" used={sendUsed} limit={dailyLimit} remaining={sendRemaining} />
          </div>
          <a className="upgrade-btn" href={upgradeHref}>
            Upgrade
          </a>
        </div>
        <div className="sidebar-footer">
          <div className="user-row">
            <div className="avatar">{initials(user.name, user.email)}</div>
            <div className="user-meta">
              <div className="name">{displayName}</div>
              <div className="hint-muted">{planLabel} plan</div>
            </div>
            <button type="button" className="btn-ghost-sm" disabled={busy} onClick={signOut}>Out</button>
          </div>
        </div>
      </aside>

      <div className="main-area">
        <div className={`main-inner${currentPage === "send" || currentPage === "leads" ? " fluid" : ""}`}>
          <div className="top-user-bar">
            <div className="top-user">
              <div className="avatar">{initials(user.name, user.email)}</div>
              <span>
                Signed in as <strong>{displayName}</strong>
              </span>
              <span className="plan-pill compact">{planLabel}</span>
              <a className="upgrade-btn upgrade-btn-top" href={upgradeHref}>Upgrade</a>
              <button type="button" className="btn-ghost-sm" disabled={busy} onClick={signOut}>Sign out</button>
            </div>
          </div>

          <div className="extension-update-banner" role="status">
            <p>
              {stats.extension?.required_version
                ? <>Chrome extension <strong>v{stats.extension.required_version}</strong> or newer is required — scrape now saves posts and drafts emails automatically.</>
                : <>Install the ReachPod Chrome extension — scrape now saves posts and drafts emails automatically.</>}
            </p>
            <a
              className="btn-secondary btn-compact"
              href={stats.extension?.update_url || EXTENSION.download_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Get it on Chrome Web Store
            </a>
          </div>

          {currentPage === "profile" && (
            <section className="page-view">
              <PageHeader
                title="Step 1 · Your profile"
                subtitle="Upload your resume once. We’ll use your skills to write personalized emails."
              />
              <div className="card">
                <form onSubmit={uploadResume}>
                  <FileDropzone
                    id="resume"
                    name="resume"
                    accept=".pdf,.docx,.txt"
                    required
                    label="Drop your resume here, or click to browse"
                    hint="PDF, DOCX, or TXT · max 10 MB"
                    fileName={resumeFileName}
                    onFile={(file) => setResumeFileName(file?.name || "")}
                  />
                  <div className="actions-row">
                    <button type="submit" disabled={busy}>Save my profile</button>
                  </div>
                </form>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={immediateJoiner}
                    disabled={busy || !stats.profile}
                    onChange={(e) => toggleImmediateJoiner(e.target.checked)}
                  />
                  I’m available to join immediately (mention this in emails)
                </label>
                {stats.profile && (
                  <>
                    <div className="skills-panel">
                      <label className="field-label">Your skills</label>
                      {skillList.length === 0 ? (
                        <p className="hint">No skills yet. Add the ones you want matched to job posts.</p>
                      ) : (
                        <ul className="skill-chips">
                          {skillList.map((skill) => (
                            <li key={skill} className="skill-chip">
                              <span>{skill}</span>
                              <button type="button" disabled={busy} onClick={() => removeSkill(skill)} aria-label={`Remove ${skill}`}>
                                ×
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      <form className="skill-add-row" onSubmit={addSkill}>
                        <input
                          id="new-skill"
                          value={newSkill}
                          disabled={busy}
                          onChange={(e) => setNewSkill(e.target.value)}
                          placeholder="Add a skill…"
                          autoComplete="off"
                        />
                        <button type="submit" className="btn-secondary btn-compact" disabled={busy || !newSkill.trim()}>Add</button>
                      </form>
                    </div>
                    <label className="field-label" style={{ marginTop: 18 }}>Profile summary</label>
                    <div className="profile-readout">
                      <dl className="profile-readout-grid">
                        <div>
                          <dt>Name</dt>
                          <dd>{String(stats.profile.name || "—")}</dd>
                        </div>
                        <div>
                          <dt>Role</dt>
                          <dd>{String(stats.profile.current_role || "—")}</dd>
                        </div>
                        <div>
                          <dt>Experience</dt>
                          <dd>{String(stats.profile.yoe || "—")}</dd>
                        </div>
                        <div>
                          <dt>Email</dt>
                          <dd>
                            {stats.profile.email ? (
                              <a href={`mailto:${String(stats.profile.email)}`}>{String(stats.profile.email)}</a>
                            ) : (
                              "—"
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Phone</dt>
                          <dd>
                            {stats.profile.phone ? (
                              <a href={`tel:${String(stats.profile.phone).replace(/\s+/g, "")}`}>
                                {String(stats.profile.phone)}
                              </a>
                            ) : (
                              "—"
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Immediate joiner</dt>
                          <dd>{immediateJoiner ? "Yes" : "No"}</dd>
                        </div>
                        <div className="profile-readout-span">
                          <dt>Skills</dt>
                          <dd>{skillList.length ? skillList.join(", ") : "—"}</dd>
                        </div>
                        <div className="profile-readout-span">
                          <dt>Resume link</dt>
                          <dd>
                            {stats.profile.resume_link ? (
                              <a href={String(stats.profile.resume_link)} target="_blank" rel="noreferrer">
                                {String(stats.profile.resume_link)}
                              </a>
                            ) : (
                              "—"
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Resume file</dt>
                          <dd>
                            {hasResumeFile
                              ? String(stats.profile.resume_filename || "Saved file")
                              : "Missing — re-upload to attach to emails"}
                          </dd>
                        </div>
                        <div>
                          <dt>File type</dt>
                          <dd>{hasResumeFile ? String(stats.profile.resume_mime || "—") : "—"}</dd>
                        </div>
                        <div className="profile-readout-span">
                          <dt>Last updated</dt>
                          <dd>
                            {stats.profile.updated_at
                              ? formatDateTime(String(stats.profile.updated_at))
                              : "—"}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </>
                )}
              </div>
              {profileReady ? (
                <div className="step-next-bar">
                  <p>Profile saved. Next: find people to email.</p>
                  <button type="button" onClick={() => setCurrentPage("leads")}>Continue to Find people →</button>
                </div>
              ) : (
                <div className="info-note">Upload a resume to unlock the next step.</div>
              )}
            </section>
          )}

          {currentPage === "leads" && (
            <section className="page-view">
              <PageHeader
                title="Step 2 · Find people"
                subtitle={
                  importRemaining == null
                    ? "Use the Chrome extension to scrape LinkedIn — posts and drafts are prepared automatically."
                    : `Use the Chrome extension to scrape LinkedIn. Manual CSV import today: ${importUsed}/${dailyLimit} · ${importRemaining} left.`
                }
              />

              {!profileReady ? (
                <div className="prereq-banner">
                  <p>Upload your resume first so we can match skills to job posts.</p>
                  <button type="button" className="btn-secondary btn-compact" onClick={() => setCurrentPage("profile")}>
                    Go to Your profile
                  </button>
                </div>
              ) : null}

              <div className="card">
                <ol className="step-substeps">
                  <li className={leadsImported ? "done" : "current"}>
                    <span className="substep-num">A</span>
                    <div>
                      <strong>Scrape with the Chrome extension</strong>
                      <p className="hint">Sign in to the extension, search LinkedIn, and it saves posts and writes drafts for you.</p>
                    </div>
                  </li>
                  <li className={draftsReady ? "done" : leadsImported ? "current" : ""}>
                    <span className="substep-num">B</span>
                    <div>
                      <strong>Review drafts here</strong>
                      <p className="hint">When the extension finishes, open Send emails to review and send. Manual tools below are optional.</p>
                    </div>
                  </li>
                </ol>

                <div className="extension-guide">
                  <h3 className="extension-guide-title">How to use the Chrome extension</h3>
                  <ol className="extension-steps">
                    <li>
                      Install{" "}
                      <a
                        href={stats.extension?.update_url || EXTENSION.download_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        ReachPod from the Chrome Web Store
                      </a>
                      {stats.extension?.required_version
                        ? ` (v${stats.extension.required_version}+)`
                        : null}
                      , then pin it.
                    </li>
                    <li>
                      On LinkedIn, open the extension, click <strong>Search and prepare emails</strong>, wait for drafts, then return here to send.
                    </li>
                  </ol>
                </div>

                <details className="optional-import">
                  <summary>Optional: import a CSV manually</summary>
                  <form onSubmit={importCsv} style={{ marginTop: 12 }}>
                    <FileDropzone
                      id="linkedin-csv"
                      name="csv"
                      accept=".csv,text/csv"
                      required
                      label="Drop a leads CSV here, or click to browse"
                      hint="Fallback if you already have a CSV · emails are detected automatically"
                      fileName={csvFileName}
                      onFile={(file) => setCsvFileName(file?.name || "")}
                    />
                    <div className="actions-row">
                      <button type="submit" disabled={busy || importRemaining === 0 || !profileReady}>
                        Import leads
                      </button>
                    </div>
                    {!profileReady ? (
                      <p className="hint" style={{ marginTop: 10 }}>
                        Finish Step 1 (Your profile) before importing.
                      </p>
                    ) : null}
                    {importRemaining === 0 ? (
                      <p className="hint" style={{ marginTop: 10 }}>
                        You’ve reached today’s import limit ({dailyLimit}/day). Try again tomorrow, or contact us to raise your plan limit.
                      </p>
                    ) : null}
                  </form>
                </details>
              </div>

              {leadsImported ? (
                <div className="card leads-posts-panel" style={{ marginTop: 16 }}>
                  <div className="leads-posts-header">
                    <div className="leads-posts-heading">
                      <h3 className="section-title">Scraped posts</h3>
                      <p className="leads-posts-meta">
                        <span>{stats.counts.posts.total.toLocaleString()} total</span>
                        <span className="meta-sep" aria-hidden>
                          ·
                        </span>
                        <span>{postsPendingDraft.toLocaleString()} pending</span>
                        <span className="meta-sep" aria-hidden>
                          ·
                        </span>
                        <span>{postsDrafted.toLocaleString()} drafted</span>
                      </p>
                    </div>
                    <div className="leads-posts-actions">
                      <button
                        type="button"
                        className="btn-compact"
                        disabled={busy || !profileReady || !postsPendingDraft}
                        onClick={generatePending}
                      >
                        Write pending
                        {postsPendingDraft ? <span className="btn-count">{postsPendingDraft}</span> : null}
                      </button>
                    </div>
                  </div>

                  <div className="leads-posts-toolbar">
                    <div className="post-filter-bar" role="tablist" aria-label="Filter scraped posts">
                      {postFilterOptions.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          role="tab"
                          aria-selected={postFilter === option.id}
                          className={`post-filter-tab${postFilter === option.id ? " active" : ""}`}
                          onClick={() => setPostFilter(option.id)}
                        >
                          <span className="post-filter-label">{option.label}</span>
                          <span className="post-filter-count">{option.count.toLocaleString()}</span>
                        </button>
                      ))}
                    </div>
                    <div className="leads-posts-toolbar-right">
                      <input
                        className="toolbar-search leads-posts-search"
                        type="search"
                        value={postSearch}
                        onChange={(e) => setPostSearch(e.target.value)}
                        placeholder="Search author, email, content…"
                        aria-label="Search scraped posts"
                      />
                      <select
                        className="toolbar-select"
                        value={postDateFilter}
                        onChange={(e) => setPostDateFilter(e.target.value)}
                        aria-label="Filter by scrape date"
                      >
                        <option value="">All dates</option>
                        {postDateOptions.map((day) => (
                          <option key={day} value={day}>
                            {formatDayLabel(day)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {postsLoading ? (
                    <div className="empty-state" style={{ marginTop: 12 }} aria-busy="true">
                      <span className="toast-spinner" aria-hidden />
                      <p>Loading posts…</p>
                    </div>
                  ) : postTotal === 0 ? (
                    <div className="info-note" style={{ marginTop: 12 }}>
                      {postSearch.trim() || postFilter !== "all" || postDateFilter
                        ? "No posts match your search or filter."
                        : "No scraped posts yet."}
                    </div>
                  ) : (
                    <>
                      <div className="leads-posts-bulk" style={{ marginTop: 12 }}>
                        <div className={`toolbar-left${selectedPostIds.length ? "" : " dimmed"}`}>
                          <label className="checkbox tight">
                            <input
                              id="select-all-posts"
                              type="checkbox"
                              checked={allPostsPageSelected}
                              disabled={!pagePosts.length}
                              onChange={(e) => selectPostPageRecords(e.target.checked)}
                              aria-label="Select all posts on page"
                            />
                            Select page
                          </label>
                          <span className="toolbar-divider" />
                          <button
                            type="button"
                            className="btn-danger btn-compact"
                            disabled={busy || !selectedPostIds.length}
                            onClick={deleteSelectedPosts}
                          >
                            Delete selected
                            {selectedPostIds.length ? <span className="btn-count">{selectedPostIds.length}</span> : null}
                          </button>
                        </div>
                        <div className="table-count" style={{ margin: 0 }}>
                          Showing {postPageStart}–{postPageEnd} of {postTotal} posts
                          {postTotal !== stats.counts.posts.total
                            ? ` · ${stats.counts.posts.total} total`
                            : null}
                        </div>
                      </div>
                      <div className="table-wrap leads-posts-wrap" style={{ marginTop: 8 }}>
                        <table className="draft-table leads-posts-table">
                          <thead>
                            <tr>
                              <th style={{ width: 36 }} aria-label="Select" />
                              <th style={{ width: 160 }}>Author</th>
                              <th style={{ width: 140 }}>Scraped</th>
                              <th style={{ width: 110 }}>Posted</th>
                              <th>Snippet</th>
                              <th style={{ width: 160 }}>Emails</th>
                              <th style={{ width: 130 }}>Phones</th>
                              <th style={{ width: 90 }}>Class</th>
                              <th style={{ width: 100 }}>Draft</th>
                              <th style={{ width: 168 }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pagePosts.map((post) => {
                              const emails = parsePostEmails(post.emails_json);
                              const phones = parsePostPhones(post.phones_json);
                              const valid = emails.length > 0;
                              const outcome = post.draft_status || {
                                kind: "none" as const,
                                label: "—",
                                reason: ""
                              };
                              const author = String(post.posted_by || "Unknown");
                              const snippet = truncateText(String(post.posted_content || ""), 180);
                              const authorUrl = String(post.posted_by_url || "");
                              const postUrl = String(post.post_url || "");
                              const postId = Number(post.id);
                              const isDrafted = outcome.kind === "drafted";
                              return (
                                <tr key={postId}>
                                  <td>
                                    <input
                                      type="checkbox"
                                      checked={selectedPostIds.includes(postId)}
                                      disabled={isDrafted}
                                      title={isDrafted ? "Drafted posts can’t be deleted" : undefined}
                                      onChange={(e) => {
                                        setSelectedPostIds((prev) =>
                                          e.target.checked
                                            ? Array.from(new Set([...prev, postId]))
                                            : prev.filter((id) => id !== postId)
                                        );
                                      }}
                                      aria-label={`Select ${author}`}
                                    />
                                  </td>
                                  <td className="col-contact" title={author}>
                                    {authorUrl ? (
                                      <a href={authorUrl} target="_blank" rel="noopener noreferrer" className="table-link">
                                        {author}
                                      </a>
                                    ) : (
                                      author
                                    )}
                                  </td>
                                  <td className="col-datetime" title={String(post.created_at || "")}>
                                    {formatDateTime(String(post.created_at || ""))}
                                  </td>
                                  <td className="col-datetime" title={String(post.posted_date || "")}>
                                    {String(post.posted_date || "—")}
                                  </td>
                                  <td className="col-snippet" title={String(post.posted_content || "")}>
                                    {postUrl ? (
                                      <a href={postUrl} target="_blank" rel="noopener noreferrer" className="table-link">
                                        {snippet}
                                      </a>
                                    ) : (
                                      snippet
                                    )}
                                  </td>
                                  <td className="col-email" title={emails.join(", ") || undefined}>
                                    {emails.length ? emails.join(", ") : "—"}
                                  </td>
                                  <td className="col-mobile" title={phones.join(", ") || undefined}>
                                    {phones.length ? phones.join(", ") : "—"}
                                  </td>
                                  <td>
                                    {valid ? (
                                      <span className="badge draft">Valid</span>
                                    ) : (
                                      <span className="badge failed">Invalid</span>
                                    )}
                                  </td>
                                  <td title={outcome.reason || undefined}>
                                    {outcome.kind === "drafted" ? (
                                      <span className="badge sent">Drafted</span>
                                    ) : outcome.kind === "skipped" ? (
                                      <span className="badge failed">Skipped</span>
                                    ) : outcome.kind === "pending" ? (
                                      <span className="badge skipped">Pending</span>
                                    ) : (
                                      <span className="badge skipped">—</span>
                                    )}
                                  </td>
                                  <td className="actions-cell">
                                    <div className="leads-posts-actions">
                                      {outcome.kind === "pending" || outcome.kind === "skipped" ? (
                                        <button
                                          type="button"
                                          className="link-btn"
                                          disabled={busy || !profileReady}
                                          onClick={() => generateOne(postId)}
                                        >
                                          {outcome.kind === "skipped" ? "Retry write" : "Write email"}
                                        </button>
                                      ) : null}
                                      {!isDrafted ? (
                                        <button
                                          type="button"
                                          className="link-btn link-btn-danger"
                                          disabled={busy}
                                          onClick={() => deleteOnePost(postId)}
                                        >
                                          Delete
                                        </button>
                                      ) : (
                                        <span className="hint" title="Delete the email draft in Step 3 first">
                                          —
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <TablePagination
                        page={safePostPage}
                        totalPages={postTotalPages}
                        pageStart={postPageStart}
                        pageEnd={postPageEnd}
                        total={postTotal}
                        pageSize={postPageSize}
                        onPageChange={setPostPage}
                        onPageSizeChange={setPostPageSize}
                        noun="posts"
                      />
                    </>
                  )}
                </div>
              ) : null}

      
              {draftsReady ? (
                <div className="step-next-bar">
                  <p>{stats.counts.drafts.total} draft{stats.counts.drafts.total === 1 ? "" : "s"} ready. Next: connect your email and send.</p>
                  <button type="button" onClick={() => setCurrentPage("send")}>Continue to Send emails →</button>
                </div>
              ) : null}
            </section>
          )}

          {currentPage === "send" && (
            <section className="page-view send-page">
              <PageHeader
                title="Step 3 · Send emails"
                subtitle={
                  sendRemaining == null
                    ? `${stats.counts.drafts.total} drafts · ${unsentCount} ready to send · ${sentCount} sent`
                    : `${stats.counts.drafts.total} drafts · ${unsentCount} ready · ${sentCount} sent · today ${sendUsed}/${dailyLimit} · ${sendRemaining} left`
                }
                actions={
                  emailReady && unsentCount ? (
                    <button
                      onClick={() => sendDrafts({ all: true })}
                      disabled={
                        busy ||
                        !stats.smtp.configured ||
                        !unsentCount ||
                        sendRemaining === 0 ||
                        (bulkAttachResume && !hasResumeFile)
                      }
                      type="button"
                    >
                      Send all ready
                      <span className="btn-count">{unsentCount}</span>
                    </button>
                  ) : null
                }
              />

              {(!draftsReady || !emailReady) ? (
                <div className="prereq-banner">
                  <div className="prereq-list">
                    {!draftsReady ? (
                      <p>
                        No email drafts yet.{" "}
                        <button type="button" className="link-btn" onClick={() => setCurrentPage("leads")}>
                          Go to Find people
                        </button>
                      </p>
                    ) : null}
                    {!emailReady ? (
                      <p>Connect your email below (Gmail App Password) so we can send from your inbox.</p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className={`connect-email-panel${emailReady ? " connected" : ""}`}>
                {emailReady && !emailSetupOpen ? (
                  <div className="connect-email-summary">
                    <div className="connect-email-identity">
                      <div className="avatar connect-avatar">
                        {initials(stats.smtp.from_name || "", stats.smtp.from_email || stats.smtp.user || "")}
                      </div>
                      <div className="connect-email-meta">
                        <div className="connect-email-row">
                          <span className="status-badge ready"><span className="dot" />Connected</span>
                          <span className="connect-email-label">Sending from your inbox</span>
                        </div>
                        <strong className="connect-email-address">
                          {stats.smtp.from_email || stats.smtp.user}
                        </strong>
                        {stats.smtp.from_name ? (
                          <span className="hint connect-email-from">{stats.smtp.from_name}</span>
                        ) : null}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn-secondary btn-compact"
                      onClick={() => setEmailSetupOpen(true)}
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="connect-email-header">
                      <div>
                        <strong>{emailReady ? "Update email settings" : "Connect your email"}</strong>
                        <p className="hint">
                          {emailReady
                            ? "Changes apply to the next emails you send."
                            : "Gmail works best. Use an App Password — not your normal password."}
                        </p>
                      </div>
                      {emailReady ? (
                        <button
                          type="button"
                          className="btn-ghost-sm"
                          onClick={() => setEmailSetupOpen(false)}
                        >
                          Cancel
                        </button>
                      ) : (
                        <span className="status-badge">
                          <span className="dot" />
                          Needed
                        </span>
                      )}
                    </div>
                    <form onSubmit={saveSmtp} className="smtp-form connect-email-body">
                      <p className="hint" style={{ marginTop: 0 }}>
                        Create an{" "}
                        <a
                          href="https://support.google.com/mail/answer/185833?hl=en"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          App Password
                        </a>{" "}
                        in Google Account → Security → App passwords.
                      </p>
                      <div className="fields">
                        <div>
                          <label className="field-label" htmlFor="smtp-user">Your Gmail address</label>
                          <input
                            id="smtp-user"
                            type="email"
                            autoComplete="username"
                            value={smtpForm.user}
                            onChange={(e) => setSmtpForm({ ...smtpForm, user: e.target.value })}
                            required
                            placeholder="you@gmail.com"
                          />
                        </div>
                        <div>
                          <label className="field-label" htmlFor="smtp-pass">
                            App Password {stats.smtp.has_password ? "(saved — leave blank to keep)" : ""}
                          </label>
                          <input
                            id="smtp-pass"
                            type="password"
                            autoComplete="current-password"
                            value={smtpForm.pass}
                            onChange={(e) => setSmtpForm({ ...smtpForm, pass: e.target.value })}
                            placeholder={stats.smtp.has_password ? "••••••••••••••••" : "16-character App Password"}
                          />
                        </div>
                        <div>
                          <label className="field-label" htmlFor="smtp-from-name">Name on emails</label>
                          <input
                            id="smtp-from-name"
                            value={smtpForm.from_name}
                            onChange={(e) => setSmtpForm({ ...smtpForm, from_name: e.target.value })}
                            placeholder="Your name"
                          />
                        </div>
                        <div>
                          <label className="field-label" htmlFor="smtp-from-email">From address (optional)</label>
                          <input
                            id="smtp-from-email"
                            type="email"
                            value={smtpForm.from_email}
                            onChange={(e) => setSmtpForm({ ...smtpForm, from_email: e.target.value })}
                            placeholder="Defaults to your Gmail"
                          />
                        </div>
                      </div>
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={smtpForm.attach_resume}
                          onChange={(e) => setSmtpForm({ ...smtpForm, attach_resume: e.target.checked })}
                        />
                        Attach my resume when sending
                      </label>
                      <details className="advanced-smtp" open={smtpAdvanced} onToggle={(e) => setSmtpAdvanced((e.target as HTMLDetailsElement).open)}>
                        <summary>Advanced (other email providers)</summary>
                        <div className="fields" style={{ marginTop: 12 }}>
                          <div>
                            <label className="field-label" htmlFor="smtp-host">Mail server host</label>
                            <input id="smtp-host" value={smtpForm.host} onChange={(e) => setSmtpForm({ ...smtpForm, host: e.target.value })} required />
                          </div>
                          <div>
                            <label className="field-label" htmlFor="smtp-port">Port</label>
                            <input id="smtp-port" type="number" min={1} max={65535} value={smtpForm.port} onChange={(e) => setSmtpForm({ ...smtpForm, port: e.target.value })} required />
                          </div>
                        </div>
                      </details>
                      <div className="actions-row">
                        <button disabled={busy} type="submit">
                          {emailReady ? "Save changes" : "Connect email"}
                        </button>
                      </div>
                    </form>
                  </>
                )}
              </div>

              {sendRemaining === 0 ? (
                <p className="hint" style={{ marginBottom: 12 }}>
                  You’ve reached today’s send limit ({dailyLimit}/day). Try again tomorrow, or contact us to raise your plan limit.
                </p>
              ) : null}

              {bulkAttachResume && !hasResumeFile ? (
                <div className="prereq-banner" style={{ marginBottom: 12 }}>
                  <p>
                    Resume attachment is on, but no resume file is saved.{" "}
                    <button type="button" className="link-btn" onClick={() => setCurrentPage("profile")}>
                      Re-upload resume
                    </button>
                    {" "}or turn off “Attach resume” below.
                  </p>
                </div>
              ) : null}

              <div className="send-toolbar">
                <div className={`toolbar-left${selectedIds.length ? "" : " dimmed"}`}>
                  <label className="checkbox tight">
                    <input
                      id="select-all-drafts"
                      type="checkbox"
                      checked={allPageSelected}
                      disabled={!pageDrafts.length}
                      onChange={(e) => selectPageRecords(e.target.checked)}
                    />
                    Select all
                  </label>
                  <span className="toolbar-divider" />
                  <button
                    className="btn-secondary btn-compact"
                    type="button"
                    onClick={() => sendDrafts({ draftIds: selectedUnsentIds })}
                    disabled={
                      busy ||
                      !stats.smtp.configured ||
                      !selectedUnsent ||
                      sendRemaining === 0 ||
                      (bulkAttachResume && !hasResumeFile)
                    }
                  >
                    Send selected
                  </button>
                  <button
                    className="btn-danger btn-compact"
                    type="button"
                    onClick={deleteSelectedDrafts}
                    disabled={busy || !selectedIds.length}
                  >
                    Delete selected
                  </button>
                  <button
                    className="btn-danger btn-compact"
                    type="button"
                    onClick={clearAllDrafts}
                    disabled={busy || !stats.counts.drafts.total}
                  >
                    Clear drafts
                  </button>
                </div>
                <div className="toolbar-right">
                  <input
                    className="toolbar-search"
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search company, email, contact…"
                    aria-label="Search drafts"
                  />
                  <label className="checkbox tight">
                    <input
                      type="checkbox"
                      checked={bulkAttachResume}
                      onChange={(e) => setBulkAttachResume(e.target.checked)}
                    />
                    Attach resume
                  </label>
                  <select
                    className="toolbar-select"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                    aria-label="Filter drafts"
                  >
                    <option value="all">All statuses</option>
                    <option value="unsent">Ready to send</option>
                    <option value="draft">Draft</option>
                    <option value="sent">Sent</option>
                    <option value="replied">Replied</option>
                    <option value="skipped">Skipped</option>
                  </select>
                  <select
                    className="toolbar-select"
                    value={draftDateFilter}
                    onChange={(e) => setDraftDateFilter(e.target.value)}
                    aria-label="Filter by draft date"
                  >
                    <option value="">All dates</option>
                    {draftDateOptions.map((day) => (
                      <option key={day} value={day}>
                        {formatDayLabel(day)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {draftsLoading ? (
                <div className="empty-state" aria-busy="true">
                  <span className="toast-spinner" aria-hidden />
                  <p>Loading drafts…</p>
                </div>
              ) : draftTotal === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">∅</div>
                  <p>
                    {searchQuery.trim() || statusFilter !== "all" || draftDateFilter
                      ? "No drafts match your search"
                      : "No drafts yet — finish Find people first"}
                  </p>
                  {!draftsReady ? (
                    <button type="button" className="btn-secondary" style={{ marginTop: 12 }} onClick={() => setCurrentPage("leads")}>
                      Go to Find people
                    </button>
                  ) : null}
                </div>
              ) : (
                <>
                  <div className="table-count">
                    Sorted by created date, then sent · Showing {pageStart}–{pageEnd} of {draftTotal}
                    {draftTotal !== stats.counts.drafts.total
                      ? ` · ${stats.counts.drafts.total} total`
                      : null}
                  </div>
                  <div className="table-wrap" style={{ marginTop: 8 }}>
                    <table className="draft-table">
                      <thead>
                        <tr>
                          <th>
                            <input
                              type="checkbox"
                              checked={allPageSelected}
                              disabled={!pageDrafts.length}
                              onChange={(e) => selectPageRecords(e.target.checked)}
                              aria-label="Select all on page"
                            />
                          </th>
                          <th style={{ width: 72 }}>Action</th>
                          <th style={{ width: 80 }}>Status</th>
                          <th style={{ width: 140 }}>Company</th>
                          <th style={{ width: 110 }}>Location</th>
                          <th style={{ width: 120 }}>Contact</th>
                          <th style={{ width: 110 }}>Mobile</th>
                          <th style={{ width: 160 }}>Email</th>
                          <th style={{ width: 180 }}>Subject</th>
                          <th>Body</th>
                          <th style={{ width: 130 }}>Created</th>
                          <th style={{ width: 130 }}>Sent</th>
                          <th style={{ width: 64 }}>Called</th>
                          <th style={{ width: 72 }}>Replied</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageDrafts.map((draft) => {
                          const contact = draft.contact_name || draft.recipient_name || "—";
                          const company = draft.company || "—";
                          const location = draft.location || "—";
                          const phone = draft.phone || "—";
                          return (
                            <tr key={draft.id}>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={selectedIds.includes(draft.id)}
                                  onChange={(e) => toggleSelected(draft.id, e.target.checked)}
                                  aria-label={`Select draft to ${draft.recipient_email}`}
                                />
                              </td>
                              <td className="actions-cell">
                                <button className="link-btn" type="button" disabled={busy} onClick={() => openDetails(draft)}>
                                  Details
                                </button>
                              </td>
                              <td>{statusBadge(draft.status, draft.replied)}</td>
                              <td className="col-company" title={company}>{company}</td>
                              <td className="col-location" title={location}>{location}</td>
                              <td className="col-contact" title={contact}>{contact}</td>
                              <td className="col-mobile" title={phone}>{phone}</td>
                              <td className="col-email" title={draft.recipient_email}>{draft.recipient_email}</td>
                              <td className="col-subject" title={draft.subject}>{draft.subject}</td>
                              <td className="col-body">{draft.body || "—"}</td>
                              <td className="col-datetime" title={draft.created_at || undefined}>
                                {formatDateTime(draft.created_at)}
                              </td>
                              <td className="col-datetime" title={draft.sent_at || undefined}>
                                {formatDateTime(draft.sent_at)}
                              </td>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={Boolean(draft.called)}
                                  disabled={busy}
                                  onChange={(e) => toggleCalled(draft, e.target.checked)}
                                  aria-label={`Mark called for ${draft.recipient_email}`}
                                />
                              </td>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={Boolean(draft.replied)}
                                  disabled={busy}
                                  onChange={(e) => toggleReplied(draft, e.target.checked)}
                                  aria-label={`Mark replied for ${draft.recipient_email}`}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <TablePagination
                    page={safePage}
                    totalPages={totalPages}
                    pageStart={pageStart}
                    pageEnd={pageEnd}
                    total={draftTotal}
                    pageSize={pageSize}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                    noun="emails"
                  />
                </>
              )}
            </section>
          )}
        </div>
      </div>

      {detailDraft && (
        <div className="modal-backdrop" role="presentation" onClick={closeDetails}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-label="Draft details"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="draft-card-head">
              <h3>Draft details</h3>
              {statusBadge(detailDraft.status, detailDraft.replied)}
              <label className="checkbox tight">
                <input
                  type="checkbox"
                  checked={Boolean(detailDraft.called)}
                  disabled={busy}
                  onChange={(e) => toggleCalled(detailDraft, e.target.checked)}
                />
                Called
              </label>
              <label className="checkbox tight">
                <input
                  type="checkbox"
                  checked={Boolean(detailDraft.replied)}
                  disabled={busy}
                  onChange={(e) => toggleReplied(detailDraft, e.target.checked)}
                />
                Got reply
              </label>
              <button className="btn-secondary btn-compact" type="button" onClick={closeDetails}>Close</button>
            </header>

            {editingId === detailDraft.id ? (
              <form className="draft-edit" onSubmit={saveDraft}>
                <div className="fields">
                  <div>
                    <label className="field-label" htmlFor={`edit-to-${detailDraft.id}`}>To</label>
                    <input
                      id={`edit-to-${detailDraft.id}`}
                      type="email"
                      required
                      value={editForm.recipient_email}
                      onChange={(e) => setEditForm({ ...editForm, recipient_email: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor={`edit-subject-${detailDraft.id}`}>Subject</label>
                    <input
                      id={`edit-subject-${detailDraft.id}`}
                      required
                      value={editForm.subject}
                      onChange={(e) => setEditForm({ ...editForm, subject: e.target.value })}
                    />
                  </div>
                </div>
                <label className="field-label" htmlFor={`edit-body-${detailDraft.id}`}>Body</label>
                <textarea
                  id={`edit-body-${detailDraft.id}`}
                  required
                  rows={8}
                  value={editForm.body}
                  onChange={(e) => setEditForm({ ...editForm, body: e.target.value })}
                />
                <div className="row-actions">
                  <button disabled={busy} type="submit">Save draft</button>
                  <button className="btn-secondary" type="button" disabled={busy} onClick={cancelEdit}>Cancel</button>
                </div>
              </form>
            ) : (
              <>
                <div className="meta-grid">
                  <div><span className="meta-label">Company</span><strong>{detailDraft.company || "—"}</strong></div>
                  <div><span className="meta-label">Location</span><strong>{detailDraft.location || "—"}</strong></div>
                  <div><span className="meta-label">Contact</span><strong>{detailDraft.contact_name || detailDraft.recipient_name || "—"}</strong></div>
                  <div><span className="meta-label">Mobile</span><strong>{detailDraft.phone || "—"}</strong></div>
                  <div><span className="meta-label">Email</span><strong>{detailDraft.recipient_email}</strong></div>
                  <div><span className="meta-label">Matched skills</span><strong>{detailDraft.matched_skills || "—"}</strong></div>
                  <div>
                    <span className="meta-label">Created</span>
                    <strong>{formatDateTime(detailDraft.created_at)}</strong>
                  </div>
                  <div>
                    <span className="meta-label">Sent</span>
                    <strong>{formatDateTime(detailDraft.sent_at)}</strong>
                  </div>
                </div>

                <div className="draft-block">
                  <h3>Hiring summary</h3>
                  <p>{detailDraft.hiring_summary || "Not extracted yet."}</p>
                </div>

                <div className="draft-block">
                  <h3>Talking points (call)</h3>
                  {detailDraft.talking_points ? (
                    <ul className="talking-points">
                      {detailDraft.talking_points.split("\n").filter(Boolean).map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>Not extracted yet.</p>
                  )}
                </div>

                <div className="draft-block">
                  <h3>Email</h3>
                  <p><strong style={{ color: "var(--white)" }}>Subject:</strong> {detailDraft.subject}</p>
                  <pre className="email-body">{detailDraft.body}</pre>
                </div>

                <details className="job-post">
                  <summary>Original job post</summary>
                  <pre>{detailDraft.job_post || "Original post not stored for this draft."}</pre>
                </details>

                <div className="draft-block notes-section">
                  <h3>Conversation notes</h3>
                  <p className="hint">Track what you discussed. Each note is saved with a timestamp.</p>
                  <form className="note-form" onSubmit={addNote}>
                    <textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="e.g. Discussed React role, asked for portfolio, follow up next week…"
                      rows={3}
                      disabled={busy}
                    />
                    <button type="submit" disabled={busy || !noteText.trim()}>Add note</button>
                  </form>
                  {(detailDraft.notes || []).length === 0 ? (
                    <p className="hint">No notes yet.</p>
                  ) : (
                    <ul className="notes-list">
                      {(detailDraft.notes || []).map((note) => (
                        <li key={note.id}>
                          <div className="note-meta">
                            <time dateTime={note.created_at}>{new Date(note.created_at).toLocaleString()}</time>
                            <button
                              type="button"
                              className="btn-danger btn-compact"
                              disabled={busy}
                              onClick={() => removeNote(note.id)}
                            >
                              Delete
                            </button>
                          </div>
                          <p>{note.note}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="row-actions">
                  <button className="btn-secondary btn-compact" type="button" disabled={busy} onClick={() => startEdit(detailDraft)}>
                    Edit email
                  </button>
                  <button
                    className="btn-compact"
                    type="button"
                    disabled={
                      busy ||
                      !stats.smtp.configured ||
                      sendRemaining === 0 ||
                      detailDraft.status === "sent" ||
                      detailDraft.status === "skipped" ||
                      Boolean(detailDraft.replied) ||
                      (bulkAttachResume && !hasResumeFile)
                    }
                    onClick={() => sendDrafts({ draftId: detailDraft.id })}
                  >
                    Send
                  </button>
                  <button className="btn-secondary btn-compact" type="button" onClick={closeDetails}>Close</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {status ? (
        <div
          className={`app-toast app-toast-${toastKind || "success"}`}
          role="status"
          aria-live="polite"
        >
          {busy ? <span className="toast-spinner" aria-hidden /> : null}
          {!busy && toastKind === "success" ? <span className="toast-icon" aria-hidden>✓</span> : null}
          {!busy && toastKind === "error" ? <span className="toast-icon" aria-hidden>!</span> : null}
          <span className="toast-message">{status}</span>
          {sending ? (
            <button
              type="button"
              className="toast-stop"
              onClick={stopSending}
            >
              Stop
            </button>
          ) : !busy ? (
            <button
              type="button"
              className="toast-dismiss"
              aria-label="Dismiss"
              onClick={() => showStatus("")}
            >
              ×
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
