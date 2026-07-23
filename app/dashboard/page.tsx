"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type DraftNote = {
  id: number;
  draft_id: number;
  note: string;
  created_at: string;
};

type Draft = {
  id: number;
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

type Stats = {
  profile: Record<string, string | boolean | number> | null;
  posts: Array<Record<string, string | number>>;
  drafts: Draft[];
  smtp: Smtp;
  quota: QuotaBundle | null;
};

type PageId = "profile" | "leads" | "send";
type StatusFilter = "all" | "unsent" | "draft" | "sent" | "skipped";
type PageSize = 25 | 50 | 100;

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

function statusBadge(status: string) {
  if (status === "sent") return <span className="badge sent">Sent</span>;
  if (status === "skipped") return <span className="badge skipped">Skipped</span>;
  if (status === "failed") return <span className="badge failed">Failed</span>;
  if (status === "draft") return <span className="badge draft">Draft</span>;
  return <span className="badge applied">{status}</span>;
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
    quota: null
  });
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ recipient_email: "", subject: "", body: "" });
  const [noteText, setNoteText] = useState("");
  const [pageSize, setPageSize] = useState<PageSize>(25);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const emailSetupInit = useRef(false);

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
    setStats({
      profile: data.profile || null,
      posts: data.posts || [],
      drafts: data.drafts || [],
      smtp,
      quota: data.quota || null
    });
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
    setSelectedIds((prev) => {
      const existing = new Set((data.drafts || []).map((draft: Draft) => draft.id));
      return prev.filter((id) => existing.has(id));
    });
    setAuthReady(true);
  }
  useEffect(() => { refresh().catch(() => { setAuthReady(true); router.replace("/login"); }); }, []);

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

  useEffect(() => { setPage(1); }, [statusFilter, pageSize, searchQuery]);

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
    if (response.ok) refresh();
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
    if (response.ok) refresh();
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
    if (response.ok) refresh();
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
    refresh();
  }

  async function generate() {
    setBusy(true); showStatus("Writing personalized emails… Please wait.");
    const response = await fetch("/api/drafts", { method: "POST" });
    const data = await response.json(); setBusy(false);
    if (!response.ok) {
      showStatus(data.error || "Draft generation failed.");
      return;
    }
    const parts = [`Created ${data.created || 0} drafts`];
    if (data.skipped) parts.push(`${data.skipped} skipped (weak/no skill match)`);
    showStatus(parts.join(" · ") + ".");
    refresh();
  }

  async function clearAllDrafts() {
    if (!window.confirm("Clear all drafts? This cannot be undone.")) return;
    setBusy(true); showStatus("Clearing drafts…");
    const response = await fetch("/api/drafts", { method: "DELETE" });
    const data = await response.json(); setBusy(false);
    showStatus(data.error || `Cleared ${data.deleted || 0} drafts.`);
    if (response.ok) {
      setSelectedIds([]);
      refresh();
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
      refresh();
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
      refresh();
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
    refresh();
  }

  async function toggleCalled(draft: Draft, called: boolean) {
    setBusy(true); showStatus(called ? "Marking as called…" : "Clearing called mark…");
    const response = await fetch("/api/drafts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: draft.id, called })
    });
    const data = await response.json(); setBusy(false);
    showStatus(data.error || (called ? "Marked as called." : "Call mark cleared."));
    if (response.ok) refresh();
  }

  async function toggleReplied(draft: Draft, replied: boolean) {
    setBusy(true); showStatus(replied ? "Marking as replied…" : "Clearing replied mark…");
    const response = await fetch("/api/drafts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: draft.id, replied })
    });
    const data = await response.json(); setBusy(false);
    showStatus(
      data.error ||
        (replied
          ? "Marked as replied. Automation will not email this address again."
          : "Replied mark cleared.")
    );
    if (response.ok) refresh();
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
    refresh();
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
    if (response.ok) refresh();
  }

  function toggleSelected(id: number, checked: boolean) {
    setSelectedIds((prev) => checked ? Array.from(new Set([...prev, id])) : prev.filter((value) => value !== id));
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
    if (!window.confirm(`Send ${label}${withResume}?`)) return;
    setBusy(true);
    showStatus(count === 1 ? "Sending email…" : `Sending ${count} emails… Please wait.`);
    const response = await fetch("/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...options,
        attach_resume: bulkAttachResume
      })
    });
    const data = await response.json(); setBusy(false);
    if (!response.ok) {
      showStatus(data.error || "Send failed.");
      return;
    }
    const parts = [`Sent ${data.sent || 0}`];
    if (data.skipped) parts.push(`${data.skipped} skipped (already emailed today)`);
    if (data.limited) parts.push(`${data.limited} held (daily send limit)`);
    if (data.failed) parts.push(`${data.failed} failed`);
    if (data.attached_resume) parts.push("resume attached");
    if (data.quota) parts.push(`${data.quota.remaining} sends left today`);
    showStatus(parts.join(" · ") + ".");
    setSelectedIds([]);
    refresh();
  }

  const postsWithEmail = stats.posts.filter((post) => String(post.emails_json || "[]") !== "[]").length;
  const unsentCount = stats.drafts.filter(isUnsent).length;
  const sentCount = stats.drafts.filter((draft) => draft.status === "sent").length;
  const importRemaining = stats.quota?.import?.remaining ?? null;
  const sendRemaining = stats.quota?.send?.remaining ?? null;
  const dailyLimit = stats.quota?.daily_post_limit ?? 50;
  const importUsed = stats.quota?.import?.used ?? 0;
  const sendUsed = stats.quota?.send?.used ?? 0;
  const selectedUnsentIds = selectedIds.filter((id) => {
    const draft = stats.drafts.find((item) => item.id === id);
    return draft && isUnsent(draft);
  });
  const selectedUnsent = selectedUnsentIds.length;
  const hasResumeFile = Boolean(stats.profile?.has_resume_file);
  const detailDraft = detailId == null ? null : stats.drafts.find((draft) => draft.id === detailId) || null;

  const filteredDrafts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return stats.drafts.filter((draft) => {
      if (statusFilter === "unsent" && !isUnsent(draft)) return false;
      if (statusFilter === "draft" && draft.status !== "draft") return false;
      if (statusFilter === "sent" && draft.status !== "sent") return false;
      if (statusFilter === "skipped" && draft.status !== "skipped") return false;
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
  }, [stats.drafts, statusFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredDrafts.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageStart = filteredDrafts.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const pageEnd = Math.min(safePage * pageSize, filteredDrafts.length);
  const pageDrafts = filteredDrafts.slice((safePage - 1) * pageSize, safePage * pageSize);
  const pageIds = pageDrafts.map((draft) => draft.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
  const somePageSelected = pageIds.some((id) => selectedIds.includes(id)) && !allPageSelected;

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    const node = document.getElementById("select-all-drafts") as HTMLInputElement | null;
    if (node) node.indeterminate = somePageSelected;
  }, [somePageSelected, allPageSelected]);

  function selectPageRecords(checked: boolean) {
    setSelectedIds((prev) => {
      if (checked) return Array.from(new Set([...prev, ...pageIds]));
      const remove = new Set(pageIds);
      return prev.filter((id) => !remove.has(id));
    });
  }

  function navMeta(id: PageId): { dot: "done" | "pending" | "empty"; badge?: string } {
    if (id === "profile") return { dot: stats.profile ? "done" : "empty" };
    if (id === "leads") {
      const ready = stats.posts.length > 0 && stats.drafts.length > 0;
      return {
        dot: ready ? "done" : stats.posts.length ? "pending" : "empty",
        badge: stats.posts.length ? String(stats.posts.length) : undefined
      };
    }
    return {
      dot: stats.smtp.configured && stats.drafts.length ? "done" : stats.smtp.configured ? "pending" : "empty",
      badge: unsentCount ? String(unsentCount) : undefined
    };
  }

  const profileReady = Boolean(stats.profile);
  const leadsImported = stats.posts.length > 0;
  const draftsReady = stats.drafts.length > 0;
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
          <div className="sidebar-logo">RP</div>
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
        <div className={`main-inner${currentPage === "send" ? " fluid" : ""}`}>
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
                      <div><strong>{String(stats.profile.name || "Candidate")}</strong> · {String(stats.profile.current_role || "Role not detected")}</div>
                      <div>Immediate joiner: {immediateJoiner ? "yes" : "no"}</div>
                      <div>Skills: {skillList.length ? skillList.join(", ") : "—"}</div>
                      <div>
                        Resume file: {hasResumeFile
                          ? String(stats.profile.resume_filename || "saved")
                          : "missing — re-upload if you want to attach it to emails"}
                      </div>
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
                    ? "Collect LinkedIn hiring posts, then write skill-matched emails."
                    : `Collect LinkedIn hiring posts, then write emails. Today: ${importUsed}/${dailyLimit} imported · ${importRemaining} left.`
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
                      <strong>Get leads from LinkedIn</strong>
                      <p className="hint">Install the free Chrome extension, export posts, then upload the file here.</p>
                    </div>
                  </li>
                  <li className={draftsReady ? "done" : leadsImported ? "current" : ""}>
                    <span className="substep-num">B</span>
                    <div>
                      <strong>Write personalized emails</strong>
                      <p className="hint">We’ll draft emails only when your skills match the job.</p>
                    </div>
                  </li>
                </ol>

                <div className="extension-guide">
                  <h3 className="extension-guide-title">How to get your leads file</h3>
                  <ol className="extension-steps">
                    <li>
                      Download{" "}
                      <a
                        href="https://github.com/Shantanujain18/linkedin_post_scrapper/blob/main/dist.zip"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        the Chrome extension
                      </a>{" "}
                      and unzip it.
                    </li>
                    <li>
                      Open{" "}
                      <a
                        href="chrome://extensions"
                        onClick={(e) => {
                          e.preventDefault();
                          navigator.clipboard?.writeText("chrome://extensions").then(
                            () => showStatus("Copied chrome://extensions — paste it in Chrome’s address bar."),
                            () => showStatus("Open chrome://extensions in Chrome’s address bar.")
                          );
                        }}
                      >
                        chrome://extensions
                      </a>
                      , turn on <strong>Developer mode</strong>, click{" "}
                      <strong>Load unpacked</strong>, and select the unzipped folder.
                    </li>
                    <li>
                      On LinkedIn, use the extension to search and export posts — then upload that file below.
                    </li>
                  </ol>
                </div>

                <form onSubmit={importCsv}>
                  <FileDropzone
                    id="linkedin-csv"
                    name="csv"
                    accept=".csv,text/csv"
                    required
                    label="Drop your leads file here, or click to browse"
                    hint="CSV exported from the Chrome extension · emails are detected automatically"
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

                <div className="stat-chips">
                  <div className="stat-chip">
                    <span className="val">{stats.posts.length}</span>
                    <span className="lbl">Leads imported</span>
                  </div>
                  <div className="stat-chip">
                    <span className="val">{postsWithEmail}</span>
                    <span className="lbl">With email</span>
                  </div>
                  <div className="stat-chip">
                    <span className="val">{stats.drafts.length}</span>
                    <span className="lbl">Email drafts</span>
                  </div>
                </div>
              </div>

              {leadsImported ? (
                <div className="card" style={{ marginTop: 16 }}>
                  <h3 className="section-title">Write personalized emails</h3>
                  <p className="hint" style={{ marginTop: 0 }}>
                    Creates drafts only when your skills match the job post. You can review and edit before sending.
                  </p>
                  <div className="actions-row">
                    <button onClick={generate} disabled={busy || !stats.profile || !stats.posts.length} type="button">
                      Write my emails
                    </button>
                    <a href="/api/export" download>
                      <button className="btn-secondary" type="button">Download drafts</button>
                    </a>
                  </div>
                  {!draftsReady ? (
                    <div className="info-note">After importing, click <strong>Write my emails</strong> to create drafts.</div>
                  ) : null}
                </div>
              ) : (
                <div className="info-note">Import leads above to unlock email writing.</div>
              )}

              {draftsReady ? (
                <div className="step-next-bar">
                  <p>{stats.drafts.length} draft{stats.drafts.length === 1 ? "" : "s"} ready. Next: connect your email and send.</p>
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
                    ? `${stats.drafts.length} drafts · ${unsentCount} ready to send · ${sentCount} sent`
                    : `${stats.drafts.length} drafts · ${unsentCount} ready · ${sentCount} sent · today ${sendUsed}/${dailyLimit} · ${sendRemaining} left`
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
                    disabled={busy || !stats.drafts.length}
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
                    <option value="skipped">Skipped</option>
                  </select>
                  <select
                    className="toolbar-select"
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value) as PageSize)}
                    aria-label="Rows per page"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>

              {filteredDrafts.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">∅</div>
                  <p>
                    {searchQuery.trim() || statusFilter !== "all"
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
                  <div className="table-wrap">
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
                          <th style={{ width: 140 }}>Company</th>
                          <th style={{ width: 110 }}>Location</th>
                          <th style={{ width: 120 }}>Contact</th>
                          <th style={{ width: 110 }}>Mobile</th>
                          <th style={{ width: 160 }}>Email</th>
                          <th style={{ width: 180 }}>Subject</th>
                          <th>Body</th>
                          <th style={{ width: 80 }}>Status</th>
                          <th style={{ width: 64 }}>Called</th>
                          <th style={{ width: 72 }}>Replied</th>
                          <th style={{ width: 72 }}></th>
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
                              <td className="col-company" title={company}>{company}</td>
                              <td className="col-location" title={location}>{location}</td>
                              <td className="col-contact" title={contact}>{contact}</td>
                              <td className="col-mobile" title={phone}>{phone}</td>
                              <td className="col-email" title={draft.recipient_email}>{draft.recipient_email}</td>
                              <td className="col-subject" title={draft.subject}>{draft.subject}</td>
                              <td className="col-body">{draft.body || "—"}</td>
                              <td>{statusBadge(draft.status)}</td>
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
                              <td className="actions-cell">
                                <button className="link-btn" type="button" disabled={busy} onClick={() => openDetails(draft)}>
                                  Details
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="pagination">
                    <span className="pagination-meta">
                      Showing {pageStart}–{pageEnd} of {filteredDrafts.length} results
                    </span>
                    <div className="pagination-controls">
                      <button
                        type="button"
                        className="page-btn"
                        disabled={safePage <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        ‹ Prev
                      </button>
                      <span className="page-pill current">{safePage}</span>
                      <button
                        type="button"
                        className="page-btn"
                        disabled={safePage >= totalPages}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      >
                        Next ›
                      </button>
                    </div>
                  </div>
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
              {statusBadge(detailDraft.status)}
              {detailDraft.replied && <span className="badge replied">Replied</span>}
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
          {!busy ? (
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
