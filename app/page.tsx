"use client";

import { useEffect, useState } from "react";

type Draft = { id: number; recipient_email: string; recipient_name: string; subject: string; body: string; status: string };
type Stats = { profile: Record<string, string> | null; posts: Array<Record<string, string | number>>; drafts: Draft[] };

export default function Home() {
  const [stats, setStats] = useState<Stats>({ profile: null, posts: [], drafts: [] });
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const response = await fetch("/api/status", { cache: "no-store" });
    setStats(await response.json());
  }
  useEffect(() => { refresh().catch(() => {}); }, []);

  async function uploadResume(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setStatus("Reading resume and extracting profile…");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/resume", { method: "POST", body: form });
    const data = await response.json(); setBusy(false); setStatus(data.error || "Candidate profile saved.");
    if (response.ok) refresh();
  }

  async function importCsv(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setStatus("Importing LinkedIn posts and detecting emails…");
    const response = await fetch("/api/linkedin/import", { method: "POST", body: new FormData(event.currentTarget) });
    const data = await response.json(); setBusy(false); setStatus(data.error || `Imported ${data.imported || 0} posts.`);
    if (response.ok) refresh();
  }

  async function generate() {
    setBusy(true); setStatus("Generating personalized email drafts…");
    const response = await fetch("/api/drafts", { method: "POST" });
    const data = await response.json(); setBusy(false); setStatus(data.error || `Created ${data.created || 0} drafts.`);
    if (response.ok) refresh();
  }

  return <main>
    <h1>LinkedIn Email Drafter</h1>
    <p className="subtitle">Upload a resume, import the LinkedIn post CSV, and create reviewable outreach drafts with SQLite and OpenAI. Nothing is sent automatically.</p>
    <div className="grid">
      <section className="card">
        <h2>1. Candidate resume</h2>
        <form onSubmit={uploadResume}>
          <label htmlFor="resume">PDF, DOCX, or TXT</label>
          <input id="resume" name="resume" type="file" accept=".pdf,.docx,.txt" required />
          <button disabled={busy}>Extract profile</button>
        </form>
        {stats.profile && <p>{stats.profile.name || "Candidate"} · {stats.profile.current_role || "Role not detected"}<br />{stats.profile.top_skills || "Skills not detected"}</p>}
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
        <p>Only posts containing an email address are drafted. Review the subject and body before sending from your mail client.</p>
        <button onClick={generate} disabled={busy || !stats.profile || !stats.posts.length}>Generate drafts</button>
        <a href="/api/export" download><button className="secondary" type="button">Download final CSV</button></a>
        <p className="status">{status}</p>
      </section>
      {stats.drafts.length > 0 && <section className="card wide">
        <h2>Draft preview ({stats.drafts.length})</h2>
        <table><thead><tr><th>To</th><th>Subject</th><th>Body</th></tr></thead><tbody>
          {stats.drafts.map((draft) => <tr key={draft.id}><td>{draft.recipient_email}</td><td>{draft.subject}</td><td className="body-cell">{draft.body}</td></tr>)}
        </tbody></table>
      </section>}
    </div>
  </main>;
}
