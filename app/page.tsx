"use client";

import { useEffect, useState } from "react";

type Draft = {
  id: number;
  recipient_email: string;
  recipient_name: string;
  subject: string;
  body: string;
  status: string;
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

export default function Home() {
  const [stats, setStats] = useState<Stats>({ profile: null, posts: [], drafts: [], smtp: defaultSmtp });
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [immediateJoiner, setImmediateJoiner] = useState(false);
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
  const [editForm, setEditForm] = useState({ recipient_email: "", subject: "", body: "" });

  async function refresh() {
    const response = await fetch("/api/status", { cache: "no-store" });
    const data = await response.json();
    const smtp = data.smtp || defaultSmtp;
    setStats({ profile: data.profile || null, posts: data.posts || [], drafts: data.drafts || [], smtp });
    setImmediateJoiner(Boolean(data.profile?.immediate_joiner));
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
      const eligible = new Set(
        (data.drafts || [])
          .filter((draft: Draft) => draft.status !== "sent" && draft.status !== "skipped")
          .map((draft: Draft) => draft.id)
      );
      return prev.filter((id) => eligible.has(id));
    });
  }
  useEffect(() => { refresh().catch(() => {}); }, []);

  async function uploadResume(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setStatus("Reading resume and extracting profile…");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/resume", { method: "POST", body: form });
    const data = await response.json(); setBusy(false); setStatus(data.error || "Candidate profile saved.");
    if (response.ok) refresh();
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
    setBusy(true); setStatus("Generating personalized email drafts in parallel…");
    const response = await fetch("/api/drafts", { method: "POST" });
    const data = await response.json(); setBusy(false); setStatus(data.error || `Created ${data.created || 0} drafts.`);
    if (response.ok) refresh();
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

  function toggleSelected(id: number, checked: boolean) {
    setSelectedIds((prev) => checked ? Array.from(new Set([...prev, id])) : prev.filter((value) => value !== id));
  }

  function selectAllUnsent(checked: boolean) {
    if (!checked) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(stats.drafts.filter((draft) => draft.status !== "sent" && draft.status !== "skipped").map((draft) => draft.id));
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

  const unsentCount = stats.drafts.filter((draft) => draft.status !== "sent" && draft.status !== "skipped").length;
  const selectedUnsent = selectedIds.length;
  const allUnsentSelected = unsentCount > 0 && selectedUnsent === unsentCount;
  const hasResumeFile = Boolean(stats.profile?.has_resume_file);

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
        {stats.profile && <p>
          {String(stats.profile.name || "Candidate")} · {String(stats.profile.current_role || "Role not detected")}<br />
          {String(stats.profile.top_skills || "Skills not detected")}<br />
          {immediateJoiner ? "Immediate joiner: yes" : "Immediate joiner: no"}<br />
          {hasResumeFile
            ? `Resume file ready to attach: ${String(stats.profile.resume_filename || "stored file")}`
            : "Re-upload resume to enable email attachments."}
        </p>}
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
        <p>Only posts containing an email address are drafted. If immediate joiner is checked, new drafts will mention you can join immediately. Clear and regenerate to refresh existing drafts.</p>
        <button onClick={generate} disabled={busy || !stats.profile || !stats.posts.length}>Generate drafts</button>
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
              checked={allUnsentSelected}
              disabled={!unsentCount}
              onChange={(e) => selectAllUnsent(e.target.checked)}
            />
            Select all unsent ({unsentCount})
          </label>
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
          onClick={() => sendDrafts({ draftIds: selectedIds })}
          disabled={busy || !stats.smtp.configured || !selectedUnsent || (bulkAttachResume && !hasResumeFile)}
          type="button"
        >
          Send selected ({selectedUnsent})
        </button>
        <button className="secondary danger" onClick={clearAllDrafts} disabled={busy} type="button">Clear all drafts</button>
        <table><thead><tr><th></th><th>To</th><th>Subject</th><th>Body</th><th>Status</th><th></th></tr></thead><tbody>
          {stats.drafts.map((draft) => (
            editingId === draft.id ? (
              <tr key={draft.id} className="editing-row">
                <td colSpan={6}>
                  <form className="draft-edit" onSubmit={saveDraft}>
                    <div className="fields">
                      <div>
                        <label htmlFor={`edit-to-${draft.id}`}>To</label>
                        <input
                          id={`edit-to-${draft.id}`}
                          type="email"
                          required
                          value={editForm.recipient_email}
                          onChange={(e) => setEditForm({ ...editForm, recipient_email: e.target.value })}
                        />
                      </div>
                      <div>
                        <label htmlFor={`edit-subject-${draft.id}`}>Subject</label>
                        <input
                          id={`edit-subject-${draft.id}`}
                          required
                          value={editForm.subject}
                          onChange={(e) => setEditForm({ ...editForm, subject: e.target.value })}
                        />
                      </div>
                    </div>
                    <label htmlFor={`edit-body-${draft.id}`}>Body</label>
                    <textarea
                      id={`edit-body-${draft.id}`}
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
                </td>
              </tr>
            ) : (
              <tr key={draft.id}>
                <td>
                  <input
                    type="checkbox"
                    disabled={draft.status === "sent" || draft.status === "skipped"}
                    checked={selectedIds.includes(draft.id)}
                    onChange={(e) => toggleSelected(draft.id, e.target.checked)}
                    aria-label={`Select draft to ${draft.recipient_email}`}
                  />
                </td>
                <td>{draft.recipient_email}</td>
                <td>{draft.subject}</td>
                <td className="body-cell">{draft.body}</td>
                <td><span className={`badge ${draft.status}`}>{draft.status === "skipped" ? "skipped today" : draft.status}</span></td>
                <td className="actions-cell">
                  <button className="secondary compact" type="button" disabled={busy || editingId != null} onClick={() => startEdit(draft)}>
                    Edit
                  </button>
                  <button
                    className="secondary compact"
                    type="button"
                    disabled={busy || editingId != null || !stats.smtp.configured || draft.status === "sent" || draft.status === "skipped" || (bulkAttachResume && !hasResumeFile)}
                    onClick={() => sendDrafts({ draftId: draft.id })}
                  >
                    Send
                  </button>
                </td>
              </tr>
            )
          ))}
        </tbody></table>
      </section>}
    </div>
  </main>;
}
