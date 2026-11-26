"use client";
// Step 0 of onboarding: your website + your account. The agent starts reading the site the moment you submit.
import { useEffect, useState } from "react";
import Link from "next/link";

export default function Start() {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const u = new URLSearchParams(window.location.search).get("url");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- prefill from the landing page's website box
    if (u) setUrl(u);
  }, []);

  return (
    <main className="grid min-h-screen bg-paper lg:grid-cols-2">
      <section className="flex flex-col justify-between p-8 lg:p-14">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold">
          <span className="h-2.5 w-2.5 rounded-full bg-accent" /> Deal Room
        </Link>
        <div className="max-w-md">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">Launch your AI sales agent</h1>
          <p className="mt-3 text-muted">Enter your website. While you create your account, Maya reads it to learn what you sell, who buys it and who you compete with.</p>
          <ol className="mt-8 space-y-4 text-sm">
            {[
              ["Your website", "We learn your product, customers and pricing."],
              ["Confirm your buyers", "Approve the personas the agent will look for."],
              ["Connect your mailbox", "Emails go out from your address, with safe daily limits."],
              ["Launch", "Review every email, or let it run on autopilot."],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-xs font-semibold shadow-sm">{i + 1}</span>
                <span>
                  <b className="font-medium">{t}</b>
                  <span className="block text-muted">{d}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <p className="text-xs text-muted">14-day free trial · 50 verified contacts · no card needed</p>
      </section>
      <section className="grid place-items-center p-6 lg:p-14">
        <form
          className="card w-full max-w-md space-y-4 p-8"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            const r = await fetch("/api/auth/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, name, email, password }) });
            const j = await r.json();
            if (!r.ok) {
              setBusy(false);
              return setError(j.error);
            }
            // Start reading the website now; the setup wizard shows progress.
            void fetch("/api/team", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ setupUrl: url, player: name.split(" ")[0] || "there", quick: true }) });
            window.location.href = "/app/setup";
          }}
        >
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Company website</span>
            <input required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="yourcompany.com" className="w-full rounded-xl border border-line bg-white px-3 py-2.5 outline-none focus:border-ink" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Your name</span>
            <input required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-line bg-white px-3 py-2.5 outline-none focus:border-ink" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Work email</span>
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-line bg-white px-3 py-2.5 outline-none focus:border-ink" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Password</span>
            <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-line bg-white px-3 py-2.5 outline-none focus:border-ink" />
            <span className="mt-1 block text-xs text-muted">At least 8 characters.</span>
          </label>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <button disabled={busy} className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Creating your agent…" : "Launch my agent"}
          </button>
          <p className="text-center text-xs text-muted">
            By continuing you agree to the <Link href="/terms" className="underline">Terms</Link> and <Link href="/privacy" className="underline">Privacy</Link> policy.
          </p>
          <p className="text-center text-sm text-muted">
            Already have an account? <Link href="/login" className="text-ink underline">Log in</Link>
          </p>
        </form>
      </section>
    </main>
  );
}
