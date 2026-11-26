"use client";
import Link from "next/link";
import { useState } from "react";

export default function Reset() {
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-6">
      <form
        className="card w-full max-w-sm space-y-4 p-8"
        onSubmit={async (e) => {
          e.preventDefault();
          if (password !== again) return setError("The two passwords don't match.");
          setBusy(true);
          setError(null);
          const token = new URLSearchParams(window.location.search).get("token") ?? "";
          const r = await fetch("/api/auth/reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, password }) });
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          setBusy(false);
          if (!r.ok) return setError(j.error ?? "Something went wrong.");
          setDone(true);
        }}
      >
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold">
          <span className="h-2.5 w-2.5 rounded-full bg-accent" /> Deal Room
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Set a new password</h1>
        {done ? (
          <p role="status" className="text-sm">
            Password changed, and you&apos;re signed out on other devices.{" "}
            <Link href="/login" className="underline">
              Log in
            </Link>
          </p>
        ) : (
          <>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">New password</span>
              <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-line bg-white px-3 py-2.5 outline-none focus:border-ink" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Type it again</span>
              <input type="password" required minLength={8} autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} className="w-full rounded-xl border border-line bg-white px-3 py-2.5 outline-none focus:border-ink" />
            </label>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <button disabled={busy} className="w-full rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">
              {busy ? "Saving…" : "Save new password"}
            </button>
          </>
        )}
      </form>
    </main>
  );
}
