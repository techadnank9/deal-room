"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/ui";

type Trends = {
  source: string;
  sessions: { session_id: string; company: string; buys: number; result: string; turns: number; created_at: string }[];
  objections: { objection_type: string; times_raised: number; avg_conviction_delta: number }[];
  claims: { status: string; n: number }[];
};

export default function HistoryPage() {
  const [t, setT] = useState<Trends | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api<Trends>("/api/history").then(setT).catch((e) => setErr(String(e)));
  }, []);
  if (err) return <p className="p-10 text-red-400">{err}</p>;
  if (!t) return <p className="p-10 text-zinc-400">Loading…</p>;
  const maxRaised = Math.max(1, ...t.objections.map((o) => o.times_raised));
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <p className="text-sm uppercase tracking-[0.2em] text-amber-400">History</p>
      <h1 className="mt-2 text-3xl font-semibold">Where you keep losing them</h1>
      <p className="mt-1 text-xs text-zinc-600">Source: {t.source}</p>

      <h2 className="mt-10 text-lg font-semibold">Weakest objection types</h2>
      <div className="mt-3 space-y-2">
        {t.objections.length === 0 && <p className="text-sm text-zinc-500">No sessions yet.</p>}
        {t.objections.map((o) => (
          <div key={o.objection_type} className="flex items-center gap-3 text-sm">
            <span className="w-28 text-zinc-300">{o.objection_type}</span>
            <div className="h-3 flex-1 rounded bg-zinc-800">
              <div className="h-3 rounded bg-red-400/80" style={{ width: `${(o.times_raised / maxRaised) * 100}%` }} />
            </div>
            <span className="w-40 text-right text-xs text-zinc-500">
              raised {o.times_raised}× · avg Δ {Number(o.avg_conviction_delta).toFixed(1)}
            </span>
          </div>
        ))}
      </div>

      <h2 className="mt-10 text-lg font-semibold">Claims</h2>
      <p className="mt-2 text-sm text-zinc-400">
        {t.claims.map((c) => `${c.n} ${c.status}`).join(" · ") || "No claims checked yet."}
      </p>

      <h2 className="mt-10 text-lg font-semibold">Sessions</h2>
      <ul className="mt-3 space-y-2 text-sm">
        {t.sessions.map((s) => (
          <li key={s.session_id}>
            <Link href={`/score/${s.session_id}`} className="flex justify-between rounded-md border border-zinc-800 px-3 py-2 hover:bg-zinc-900">
              <span>{s.company}</span>
              <span className={s.result === "won" ? "text-emerald-400" : "text-red-400"}>
                {s.result} {s.buys}–{3 - s.buys} · {s.turns} turns
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/" className="mt-8 inline-block text-zinc-400 underline">
        ← New rehearsal
      </Link>
    </main>
  );
}
