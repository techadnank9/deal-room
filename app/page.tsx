"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/ui";

const DEMOS = [
  { url: "https://linear.app", offering: "An AI QA agent that writes and runs end-to-end tests on every pull request" },
  { url: "https://www.notion.com", offering: "Usage-based cloud cost monitoring that cuts AWS spend 20-30%" },
];

export default function Setup() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [offering, setOffering] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const { id } = await api<{ id: string }>("/api/session", { url, offering });
      router.push(`/brief/${id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-10 px-6 py-16">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-amber-400">Deal Room</p>
        <h1 className="mt-3 text-4xl font-semibold leading-tight">Rehearse the call before it costs you the deal.</h1>
        <p className="mt-4 text-zinc-400">
          Three executives, built from real data about your prospect, hear your pitch, push back, whisper to each other, and vote.
        </p>
      </div>

      <form onSubmit={start} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="text-sm text-zinc-400">Prospect company URL</span>
          <input
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://acme.com"
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-amber-400"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm text-zinc-400">What you sell, in one line</span>
          <input
            required
            value={offering}
            onChange={(e) => setOffering(e.target.value)}
            placeholder="An AI agent that handles tier-1 support tickets"
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-amber-400"
          />
        </label>
        <button
          disabled={busy}
          className="mt-2 rounded-lg bg-amber-400 px-5 py-3 font-medium text-black transition hover:bg-amber-300 disabled:opacity-60"
        >
          {busy ? "Researching the account…" : "Build the room"}
        </button>
        {err && <p className="text-sm text-red-400">{err}</p>}
      </form>

      <div className="flex flex-col gap-2 text-sm text-zinc-500">
        <span>Try a demo account:</span>
        {DEMOS.map((d) => (
          <button
            key={d.url}
            type="button"
            onClick={() => {
              setUrl(d.url);
              setOffering(d.offering);
            }}
            className="text-left text-zinc-300 underline-offset-4 hover:underline"
          >
            {d.url} — {d.offering}
          </button>
        ))}
        <Link href="/history" className="mt-4 text-zinc-400 underline-offset-4 hover:underline">
          View history across sessions →
        </Link>
      </div>
    </main>
  );
}
