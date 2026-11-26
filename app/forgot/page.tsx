"use client";
import Link from "next/link";
import { useState } from "react";

export default function Forgot() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-6">
      <form
        className="card w-full max-w-sm space-y-4 p-8"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await fetch("/api/auth/forgot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) }).catch(() => {});
          setBusy(false);
          setSent(true);
        }}
      >
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold">
          <span className="h-2.5 w-2.5 rounded-full bg-accent" /> Deal Room
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
        {sent ? (
          <p role="status" className="text-sm">
            If an account exists for <b>{email}</b>, we sent it a link to set a new password. It works for 1 hour. Check spam if it isn&apos;t there in a minute.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted">Enter the email you log in with and we&apos;ll send you a link.</p>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Work email</span>
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-line bg-white px-3 py-2.5 outline-none focus:border-ink" />
            </label>
            <button disabled={busy} className="w-full rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">
              {busy ? "Sending…" : "Send reset link"}
            </button>
          </>
        )}
        <p className="text-center text-sm text-muted">
          <Link href="/login" className="text-ink underline">
            Back to log in
          </Link>
        </p>
      </form>
    </main>
  );
}
