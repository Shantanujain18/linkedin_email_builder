"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "signup", name, email, password })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Sign up failed.");
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="card auth-card">
        <p className="eyebrow" style={{ marginBottom: 10 }}>Email Drafter</p>
        <h1>Create account</h1>
        <p className="subtitle">Each account keeps its own resume, posts, drafts, and SMTP settings.</p>
        <form onSubmit={onSubmit}>
          <label htmlFor="name">Name</label>
          <input
            id="name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Optional"
          />
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
          <p className="hint">At least 8 characters.</p>
          <button disabled={busy} type="submit">{busy ? "Creating…" : "Sign up"}</button>
        </form>
        {error ? <p className="hint error">{error}</p> : null}
        <p className="auth-switch">
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </section>
    </main>
  );
}
