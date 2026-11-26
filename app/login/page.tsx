"use client";
import { useState } from "react";
import Link from "next/link";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-6">
      <form
        className="card w-full max-w-sm space-y-4 p-8"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          const r = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
          const j = await r.json();
          setBusy(false);
          if (!r.ok) return setError(j.error);
          window.location.href = new URLSearchParams(window.location.search).get("next") || "/app";
        }}
      >
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold">
          <span className="h-2.5 w-2.5 rounded-full bg-accent" /> Deal Room
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Log in</h1>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Work email</span>
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-line bg-white px-3 py-2.5 outline-none focus:border-ink" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Password</span>
          <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-line bg-white px-3 py-2.5 outline-none focus:border-ink" />
        </label>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button disabled={busy} className="w-full rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">
          {busy ? "Logging in…" : "Log in"}
        </button>
        <p className="text-center text-sm text-muted">
          New here? <Link href="/start" className="text-ink underline">Start free</Link>
        </p>
      </form>
    </main>
  );
}
