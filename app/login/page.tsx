"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function LoginPage() {
  const router = useRouter();
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
        body: JSON.stringify({ action: "signin", email, password })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Sign in failed.");
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="card auth-card">
        <p className="eyebrow" style={{ marginBottom: 10 }}>Email Drafter</p>
        <h1>Sign in</h1>
        <p className="subtitle">Access your LinkedIn outreach workspace.</p>
        <form onSubmit={onSubmit}>
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
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button disabled={busy} type="submit">{busy ? "Signing in…" : "Sign in"}</button>
        </form>
        {error ? <p className="hint error">{error}</p> : null}
        <p className="auth-switch">
          No account? <Link href="/signup">Create one</Link>
        </p>
      </section>
    </main>
  );
}
