"use client";

import { useEffect, useState } from "react";

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

type Stats = {
  profile: Record<string, string | boolean | number> | null;
  posts: Array<Record<string, string | number>>;
  drafts: Draft[];
  smtp: Smtp;
};

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

export default function Home() {
  const [stats, setStats] = useState<Stats>({ profile: null, posts: [], drafts: [], smtp: defaultSmtp });
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [immediateJoiner, setImmediateJoiner] = useState(false);
  const [skillList, setSkillList] = useState<string[]>([]);
  const [newSkill, setNewSkill] = useState("");
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

  async function refresh() {
    const response = await fetch("/api/status", { cache: "no-store" });
    const data = await response.json();
    const smtp = data.smtp || defaultSmtp;
    setStats({ profile: data.profile || null, posts: data.posts || [], drafts: data.drafts || [], smtp });
    setImmediateJoiner(Boolean(data.profile?.immediate_joiner));
    setSkillList(parseSkills(String(data.profile?.top_skills || "")));
    setBulkAttachResume(smtp.attach_resume !== false);
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
  }
  useEffect(() => { refresh().catch(() => {}); }, []);

  useEffect(() => {
    if (detailId == null) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeDetails();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [detailId]);

  async function uploadResume(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setStatus("Reading resume and extracting profile…");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/resume", { method: "POST", body: form });
    const data = await response.json(); setBusy(false); setStatus(data.error || "Candidate profile saved.");
    if (response.ok) refresh();
  }

  async function persistSkills(nextSkills: string[]) {
    setSkillList(nextSkills);
    if (!stats.profile) return;
    setBusy(true); setStatus("Saving skills…");
    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ top_skills: nextSkills.join(", ") })
    });
    const data = await response.json(); setBusy(false);
    setStatus(data.error || "Skills updated. Regenerate drafts to use them in new emails.");
    if (response.ok) refresh();
    else setSkillList(parseSkills(String(stats.profile.top_skills || "")));
  }

  function addSkill(event: React.FormEvent) {
    event.preventDefault();
    const skill = newSkill.trim().replace(/,+/g, " ").replace(/\s+/g, " ");
    if (!skill) return;
    const exists = skillList.some((item) => item.toLowerCase() === skill.toLowerCase());
    if (exists) {
      setStatus(`"${skill}" is already in your skills list.`);
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
    setBusy(true); setStatus("Saving joining availability…");
    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ immediate_joiner: checked })
    });
    const data = await response.json(); setBusy(false);
    setStatus(
      data.error ||
        (checked
          ? "Marked as immediate joiner. Regenerate drafts to include it in emails."
          : "Immediate joiner turned off. Regenerate drafts if needed.")
    );
    if (response.ok) refresh();
    else setImmediateJoiner(!checked);
  }

  async function importCsv(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setStatus("Importing LinkedIn posts and detecting emails…");
    const response = await fetch("/api/linkedin/import", { method: "POST", body: new FormData(event.currentTarget) });
    const data = await response.json(); setBusy(false); setStatus(data.error || `Imported ${data.imported || 0} posts.`);
    if (response.ok) refresh();
  }

  async function generate() {
    setBusy(true); setStatus("Generating skill-matched email drafts…");
    const response = await fetch("/api/drafts", { method: "POST" });
    const data = await response.json(); setBusy(false);
    if (!response.ok) {
      setStatus(data.error || "Draft generation failed.");
      return;
    }
    const parts = [`Created ${data.created || 0} drafts`];
    if (data.skipped) parts.push(`${data.skipped} skipped (weak/no skill match)`);
    setStatus(parts.join(" · ") + ".");
    refresh();
  }

  async function enrichDrafts(options: { ids?: number[]; all?: boolean } = {}) {
    const ids = options.ids || [];
    const label = options.all
      ? "all drafts missing details"
      : `${ids.length} selected draft(s)`;
    if (!options.all && !ids.length) return;
    setBusy(true); setStatus(`Extracting recruiter/job details for ${label}…`);
    const response = await fetch("/api/drafts/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options.all ? { only_missing: true } : { ids, only_missing: false })
    });
    const data = await response.json(); setBusy(false);
    if (!response.ok) {
      setStatus(data.error || "Enrichment failed.");
      return;
    }
    setStatus(data.message || `Enriched ${data.enriched || 0} of ${data.processed || 0} draft(s). Email text was left unchanged.`);
    refresh();
  }

  async function clearAllDrafts() {
    if (!window.confirm("Clear all drafts? This cannot be undone.")) return;
    setBusy(true); setStatus("Clearing drafts…");
    const response = await fetch("/api/drafts", { method: "DELETE" });
    const data = await response.json(); setBusy(false);
    setStatus(data.error || `Cleared ${data.deleted || 0} drafts.`);
    if (response.ok) {
      setSelectedIds([]);
      refresh();
    }
  }

  async function deleteSelectedDrafts() {
    if (!selectedIds.length) return;
    if (!window.confirm(`Delete ${selectedIds.length} selected draft(s)? This cannot be undone.`)) return;
    setBusy(true); setStatus("Deleting selected drafts…");
    const response = await fetch("/api/drafts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selectedIds })
    });
    const data = await response.json(); setBusy(false);
    setStatus(data.error || `Deleted ${data.deleted || 0} draft(s).`);
    if (response.ok) {
      setSelectedIds([]);
      cancelEdit();
      refresh();
    }
  }

  async function saveSmtp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setStatus("Saving SMTP settings…");
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
    setStatus(data.error || "SMTP settings saved.");
    if (response.ok) {
      setSmtpForm((prev) => ({ ...prev, pass: "" }));
      setBulkAttachResume(smtpForm.attach_resume);
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
    setBusy(true); setStatus("Saving draft…");
    const response = await fetch("/api/drafts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editingId, ...editForm })
    });
    const data = await response.json(); setBusy(false);
    if (!response.ok) {
      setStatus(data.error || "Failed to save draft.");
      return;
    }
    setStatus("Draft updated.");
    cancelEdit();
    refresh();
  }

  async function toggleCalled(draft: Draft, called: boolean) {
    setBusy(true); setStatus(called ? "Marking as called…" : "Clearing called mark…");
    const response = await fetch("/api/drafts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: draft.id, called })
    });
    const data = await response.json(); setBusy(false);
    setStatus(data.error || (called ? "Marked as called." : "Call mark cleared."));
    if (response.ok) refresh();
  }

  async function toggleReplied(draft: Draft, replied: boolean) {
    setBusy(true); setStatus(replied ? "Marking as replied…" : "Clearing replied mark…");
    const response = await fetch("/api/drafts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: draft.id, replied })
    });
    const data = await response.json(); setBusy(false);
    setStatus(
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
    setBusy(true); setStatus("Saving note…");
    const response = await fetch("/api/drafts/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draftId: detailId, note: noteText })
    });
    const data = await response.json(); setBusy(false);
    if (!response.ok) {
      setStatus(data.error || "Failed to save note.");
      return;
    }
    setNoteText("");
    setStatus("Note added.");
    refresh();
  }

  async function removeNote(noteId: number) {
    if (!window.confirm("Delete this note?")) return;
    setBusy(true); setStatus("Deleting note…");
    const response = await fetch("/api/drafts/notes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: noteId })
    });
    const data = await response.json(); setBusy(false);
    setStatus(data.error || "Note deleted.");
    if (response.ok) refresh();
  }

  function toggleSelected(id: number, checked: boolean) {
    setSelectedIds((prev) => checked ? Array.from(new Set([...prev, id])) : prev.filter((value) => value !== id));
  }

  function selectAllRecords(checked: boolean) {
    setSelectedIds(checked ? stats.drafts.map((draft) => draft.id) : []);
  }

  function selectAllUnsent(checked: boolean) {
    const unsentIds = stats.drafts
      .filter((draft) => draft.status !== "sent" && draft.status !== "skipped" && !draft.replied)
      .map((draft) => draft.id);
    setSelectedIds((prev) => {
      if (checked) return Array.from(new Set([...prev, ...unsentIds]));
      const remove = new Set(unsentIds);
      return prev.filter((id) => !remove.has(id));
    });
  }

  function clearSelection() {
    setSelectedIds([]);
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
    if (!window.confirm(`Send ${label} via SMTP${withResume}?`)) return;
    setBusy(true); setStatus(`Bulk sending ${count} email(s)…`);
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
      setStatus(data.error || "Send failed.");
      return;
    }
    const parts = [`Sent ${data.sent || 0}`];
    if (data.skipped) parts.push(`${data.skipped} skipped (already emailed today)`);
    if (data.failed) parts.push(`${data.failed} failed`);
    if (data.attached_resume) parts.push("resume attached");
    setStatus(parts.join(" · ") + ".");
    setSelectedIds([]);
    refresh();
  }

  const unsentCount = stats.drafts.filter((draft) => draft.status !== "sent" && draft.status !== "skipped" && !draft.replied).length;
  const selectedUnsentIds = selectedIds.filter((id) => {
    const draft = stats.drafts.find((item) => item.id === id);
    return draft && draft.status !== "sent" && draft.status !== "skipped" && !draft.replied;
  });
  const selectedUnsent = selectedUnsentIds.length;
  const allSelected = stats.drafts.length > 0 && selectedIds.length === stats.drafts.length;
  const someSelected = selectedIds.length > 0 && !allSelected;
  const allUnsentSelected = unsentCount > 0 && selectedUnsent === unsentCount;
  const hasResumeFile = Boolean(stats.profile?.has_resume_file);

  const detailDraft = detailId == null ? null : stats.drafts.find((draft) => draft.id === detailId) || null;

  useEffect(() => {
    const node = document.getElementById("select-all-drafts") as HTMLInputElement | null;
    if (node) node.indeterminate = someSelected;
  }, [someSelected, allSelected]);

  return <main>
    <h1>LinkedIn Email Drafter</h1>
    <p className="subtitle">Upload a resume, import the LinkedIn post CSV, generate outreach drafts, then bulk-send them with Gmail App Password SMTP and an optional resume attachment.</p>
    <div className="grid">
      <section className="card">
        <h2>1. Candidate resume</h2>
        <form onSubmit={uploadResume}>
          <label htmlFor="resume">PDF, DOCX, or TXT</label>
          <input id="resume" name="resume" type="file" accept=".pdf,.docx,.txt" required />
          <button disabled={busy}>Extract profile</button>
        </form>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={immediateJoiner}
            disabled={busy || !stats.profile}
            onChange={(e) => toggleImmediateJoiner(e.target.checked)}
          />
          Immediate joiner (mention availability in generated emails)
        </label>
        {stats.profile && (
          <>
            <div className="skills-panel">
              <label>Skills</label>
              {skillList.length === 0 ? (
                <p className="hint">No skills yet. Add one below.</p>
              ) : (
                <ul className="skill-list">
                  {skillList.map((skill) => (
                    <li key={skill}>
                      <span>{skill}</span>
                      <button
                        type="button"
                        className="secondary compact danger"
                        disabled={busy}
                        onClick={() => removeSkill(skill)}
                        aria-label={`Remove ${skill}`}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <form className="skill-add" onSubmit={addSkill}>
                <label htmlFor="new-skill">Add skill</label>
                <div className="skill-add-row">
                  <input
                    id="new-skill"
                    value={newSkill}
                    disabled={busy}
                    onChange={(e) => setNewSkill(e.target.value)}
                    placeholder="e.g. TypeScript"
                    autoComplete="off"
                  />
                  <button type="submit" disabled={busy || !newSkill.trim()}>Add</button>
                </div>
              </form>
            </div>
            <p>
              {String(stats.profile.name || "Candidate")} · {String(stats.profile.current_role || "Role not detected")}<br />
              {immediateJoiner ? "Immediate joiner: yes" : "Immediate joiner: no"}<br />
              {hasResumeFile
                ? `Resume file ready to attach: ${String(stats.profile.resume_filename || "stored file")}`
                : "Re-upload resume to enable email attachments."}
            </p>
          </>
        )}
      </section>
      <section className="card">
        <h2>2. LinkedIn posts CSV</h2>
        <form onSubmit={importCsv}>
          <label htmlFor="linkedin-csv">CSV exported from LinkedIn</label>
          <input id="linkedin-csv" name="csv" type="file" accept=".csv,text/csv" required />
          <button disabled={busy}>Import posts</button>
        </form>
        <p>{stats.posts.length} posts stored · {stats.posts.filter((post) => String(post.emails_json || "[]") !== "[]").length} with email matches</p>
      </section>
      <section className="card wide">
        <h2>3. Generate email drafts</h2>
        <p>Only posts containing an email address are drafted, and only when your skills meaningfully match the job. Mismatched stacks (for example Angular vs React/Python) are skipped. Use <strong>Enrich older drafts</strong> to extract phone/company/summary/talking points for drafts that were created or sent before this feature existed — email subject/body stay unchanged.</p>
        <button onClick={generate} disabled={busy || !stats.profile || !stats.posts.length}>Generate drafts</button>
        <button
          className="secondary"
          onClick={() => enrichDrafts({ all: true })}
          disabled={busy || !stats.profile || !stats.drafts.length}
          type="button"
        >
          Enrich older drafts
        </button>
        <button className="secondary danger" onClick={clearAllDrafts} disabled={busy || !stats.drafts.length} type="button">Clear all drafts</button>
        <a href="/api/export" download><button className="secondary" type="button">Download final CSV</button></a>
        <p className="status">{status}</p>
      </section>
      <section className="card wide">
        <h2>4. SMTP details (App Password)</h2>
        <p>Use your Gmail address and a Google App Password (not your normal password). Defaults to <code>smtp.gmail.com:587</code>.</p>
        <form onSubmit={saveSmtp} className="smtp-form">
          <div className="fields">
            <div>
              <label htmlFor="smtp-host">SMTP host</label>
              <input id="smtp-host" value={smtpForm.host} onChange={(e) => setSmtpForm({ ...smtpForm, host: e.target.value })} required />
            </div>
            <div>
              <label htmlFor="smtp-port">Port</label>
              <input id="smtp-port" type="number" min={1} max={65535} value={smtpForm.port} onChange={(e) => setSmtpForm({ ...smtpForm, port: e.target.value })} required />
            </div>
            <div>
              <label htmlFor="smtp-user">Email / SMTP user</label>
              <input id="smtp-user" type="email" autoComplete="username" value={smtpForm.user} onChange={(e) => setSmtpForm({ ...smtpForm, user: e.target.value })} required />
            </div>
            <div>
              <label htmlFor="smtp-pass">App Password {stats.smtp.has_password ? "(saved — leave blank to keep)" : ""}</label>
              <input id="smtp-pass" type="password" autoComplete="current-password" value={smtpForm.pass} onChange={(e) => setSmtpForm({ ...smtpForm, pass: e.target.value })} placeholder={stats.smtp.has_password ? "••••••••••••••••" : "16-character App Password"} />
            </div>
            <div>
              <label htmlFor="smtp-from-email">From email</label>
              <input id="smtp-from-email" type="email" value={smtpForm.from_email} onChange={(e) => setSmtpForm({ ...smtpForm, from_email: e.target.value })} placeholder="Defaults to SMTP user" />
            </div>
            <div>
              <label htmlFor="smtp-from-name">From name</label>
              <input id="smtp-from-name" value={smtpForm.from_name} onChange={(e) => setSmtpForm({ ...smtpForm, from_name: e.target.value })} placeholder="Your name" />
            </div>
          </div>
          <label className="checkbox">
            <input type="checkbox" checked={smtpForm.attach_resume} onChange={(e) => setSmtpForm({ ...smtpForm, attach_resume: e.target.checked })} />
            Default: attach uploaded resume when sending emails
          </label>
          <button disabled={busy}>Save SMTP settings</button>
          <p className="hint">{stats.smtp.configured ? "SMTP is configured and ready to send." : "SMTP is not fully configured yet."}</p>
        </form>
      </section>
      {stats.drafts.length > 0 && <section className="card wide">
        <h2>5. Bulk send & draft preview ({stats.drafts.length})</h2>
        <div className="bulk-bar">
          <label className="checkbox tight">
            <input
              type="checkbox"
              checked={bulkAttachResume}
              onChange={(e) => setBulkAttachResume(e.target.checked)}
            />
            Attach resume on send {hasResumeFile ? `(${String(stats.profile?.resume_filename || "file ready")})` : "(re-upload resume first)"}
          </label>
          <label className="checkbox tight">
            <input
              type="checkbox"
              checked={allSelected}
              disabled={!stats.drafts.length}
              onChange={(e) => selectAllRecords(e.target.checked)}
            />
            Select all ({stats.drafts.length})
          </label>
          <label className="checkbox tight">
            <input
              type="checkbox"
              checked={allUnsentSelected}
              disabled={!unsentCount}
              onChange={(e) => selectAllUnsent(e.target.checked)}
            />
            Select all unsent ({unsentCount})
          </label>
          <button className="secondary compact" type="button" disabled={!selectedIds.length} onClick={clearSelection}>
            Clear selection ({selectedIds.length})
          </button>
        </div>
        <button
          onClick={() => sendDrafts({ all: true })}
          disabled={busy || !stats.smtp.configured || !unsentCount || (bulkAttachResume && !hasResumeFile)}
          type="button"
        >
          Bulk send all unsent ({unsentCount})
        </button>
        <button
          className="secondary"
          onClick={() => sendDrafts({ draftIds: selectedUnsentIds })}
          disabled={busy || !stats.smtp.configured || !selectedUnsent || (bulkAttachResume && !hasResumeFile)}
          type="button"
        >
          Send selected ({selectedUnsent})
        </button>
        <button
          className="secondary"
          onClick={() => enrichDrafts({ ids: selectedIds })}
          disabled={busy || !stats.profile || !selectedIds.length}
          type="button"
        >
          Enrich selected ({selectedIds.length})
        </button>
        <button
          className="secondary danger"
          onClick={deleteSelectedDrafts}
          disabled={busy || !selectedIds.length}
          type="button"
        >
          Delete selected ({selectedIds.length})
        </button>
        <button className="secondary danger" onClick={clearAllDrafts} disabled={busy} type="button">Clear all drafts</button>
        <div className="table-wrap">
          <table className="draft-table">
            <thead>
              <tr>
                <th>
                  <input
                    id="select-all-drafts"
                    type="checkbox"
                    checked={allSelected}
                    disabled={!stats.drafts.length}
                    onChange={(e) => selectAllRecords(e.target.checked)}
                    aria-label="Select all drafts"
                  />
                </th>
                <th>Company</th>
                <th>Location</th>
                <th>Contact</th>
                <th>Mobile</th>
                <th>Email</th>
                <th>Subject</th>
                <th>Status</th>
                <th>Called</th>
                <th>Replied</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {stats.drafts.map((draft) => (
                <tr key={draft.id} className={draft.replied ? "row-replied" : draft.called ? "row-called" : undefined}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(draft.id)}
                      onChange={(e) => toggleSelected(draft.id, e.target.checked)}
                      aria-label={`Select draft to ${draft.recipient_email}`}
                    />
                  </td>
                  <td>{draft.company || "—"}</td>
                  <td>{draft.location || "—"}</td>
                  <td>{draft.contact_name || draft.recipient_name || "—"}</td>
                  <td>{draft.phone || "—"}</td>
                  <td className="ellipsis">{draft.recipient_email}</td>
                  <td className="ellipsis">{draft.subject}</td>
                  <td><span className={`badge ${draft.status}`}>{draft.status === "skipped" ? "skipped today" : draft.status}</span></td>
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
                    <button className="secondary compact" type="button" disabled={busy} onClick={() => openDetails(draft)}>
                      View details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {detailDraft && (
          <div className="modal-backdrop" role="presentation" onClick={closeDetails}>
            <div
              className={`modal-card draft-card ${detailDraft.replied ? "replied" : detailDraft.called ? "called" : ""}`}
              role="dialog"
              aria-modal="true"
              aria-label="Draft details"
              onClick={(event) => event.stopPropagation()}
            >
              <header className="draft-card-head">
                <h3>Draft details</h3>
                <span className={`badge ${detailDraft.status}`}>{detailDraft.status === "skipped" ? "skipped today" : detailDraft.status}</span>
                {detailDraft.replied && <span className="badge replied">replied</span>}
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
                <button className="secondary compact" type="button" onClick={closeDetails}>Close</button>
              </header>

              {editingId === detailDraft.id ? (
                <form className="draft-edit" onSubmit={saveDraft}>
                  <div className="fields">
                    <div>
                      <label htmlFor={`edit-to-${detailDraft.id}`}>To</label>
                      <input
                        id={`edit-to-${detailDraft.id}`}
                        type="email"
                        required
                        value={editForm.recipient_email}
                        onChange={(e) => setEditForm({ ...editForm, recipient_email: e.target.value })}
                      />
                    </div>
                    <div>
                      <label htmlFor={`edit-subject-${detailDraft.id}`}>Subject</label>
                      <input
                        id={`edit-subject-${detailDraft.id}`}
                        required
                        value={editForm.subject}
                        onChange={(e) => setEditForm({ ...editForm, subject: e.target.value })}
                      />
                    </div>
                  </div>
                  <label htmlFor={`edit-body-${detailDraft.id}`}>Body</label>
                  <textarea
                    id={`edit-body-${detailDraft.id}`}
                    required
                    rows={8}
                    value={editForm.body}
                    onChange={(e) => setEditForm({ ...editForm, body: e.target.value })}
                  />
                  <div className="row-actions">
                    <button disabled={busy} type="submit">Save draft</button>
                    <button className="secondary" type="button" disabled={busy} onClick={cancelEdit}>Cancel</button>
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
                    <p>{detailDraft.hiring_summary || "Not extracted yet. Use Enrich older drafts / Enrich selected."}</p>
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
                    <p><strong>Subject:</strong> {detailDraft.subject}</p>
                    <pre className="email-body">{detailDraft.body}</pre>
                  </div>

                  <details className="job-post">
                    <summary>Original job post</summary>
                    <pre>{detailDraft.job_post || "Original post not stored for this draft. Enrich or regenerate to capture it."}</pre>
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
                      <p>No notes yet.</p>
                    ) : (
                      <ul className="notes-list">
                        {(detailDraft.notes || []).map((note) => (
                          <li key={note.id}>
                            <div className="note-meta">
                              <time dateTime={note.created_at}>{new Date(note.created_at).toLocaleString()}</time>
                              <button
                                type="button"
                                className="secondary compact danger"
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
                    <button className="secondary compact" type="button" disabled={busy} onClick={() => startEdit(detailDraft)}>
                      Edit email
                    </button>
                    <button
                      className="secondary compact"
                      type="button"
                      disabled={busy || !stats.smtp.configured || detailDraft.status === "sent" || detailDraft.status === "skipped" || Boolean(detailDraft.replied) || (bulkAttachResume && !hasResumeFile)}
                      onClick={() => sendDrafts({ draftId: detailDraft.id })}
                    >
                      Send
                    </button>
                    <button className="secondary compact" type="button" onClick={closeDetails}>Close</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </section>}
    </div>
  </main>;
}
