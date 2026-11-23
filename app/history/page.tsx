"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/ui";

type Trends = {
  source: string;
  sessions: { session_id: string; company: string; buys: string | number; result: string; turns: string | number; created_at: string; claims_failed?: string }[];
  objections: { objection_type: string; times_raised: string | number; sessions?: string | number; avg_conviction_delta: number; loss_rate?: number }[];
  claims: { status: string; n: string | number }[];
};

export default function HistoryPage() {
  const [t, setT] = useState<Trends | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api<Trends>("/api/history").then(setT).catch((e) => setErr(String(e)));
  }, []);
  if (err) return <p className="p-10 text-red-600">{err}</p>;
  if (!t) return <p className="p-10 text-muted">Loading…</p>;
  const worst = Math.max(1, ...t.objections.map((o) => Math.abs(Number(o.avg_conviction_delta))));
  const total = t.sessions.length;
  const wins = t.sessions.filter((s) => s.result === "won").length;
  const claimCount = (status: string) => Number(t.claims.find((c) => c.status === status)?.n ?? 0);

  return (
    <main className="glow min-h-screen w-full">
      <div className="mx-auto max-w-5xl px-8 py-10">
        <nav className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="h-2.5 w-2.5 rounded-full bg-accent" /> Deal Room
          </Link>
          <Link href="/new" className="pill-dark text-sm">
            New rehearsal <span className="arrow">→</span>
          </Link>
        </nav>

        <header className="mt-12">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Across every rehearsal</p>
          <h1 className="mt-2 text-5xl font-semibold tracking-[-0.03em]">Where you keep losing them.</h1>
          <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-line bg-white/70 px-3 py-1 text-xs text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" /> {t.source}
          </p>
        </header>

        <section className="mt-8 grid gap-5 sm:grid-cols-3">
          {[
            { k: "Rehearsals", v: total },
            { k: "Deals won", v: `${wins} of ${total}` },
            { k: "Claims that held up", v: `${claimCount("verified")} of ${claimCount("verified") + claimCount("unsupported") + claimCount("contradicted")}` },
          ].map((x) => (
            <div key={x.k} className="card p-5">
              <p className="text-xs uppercase tracking-[0.14em] text-muted">{x.k}</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight">{x.v}</p>
            </div>
          ))}
        </section>

        <section className="card mt-5 p-6">
          <h2 className="font-semibold">Objections that cost you the most conviction</h2>
          <p className="text-sm text-muted">Average conviction change when this objection came up, and how often those calls were lost.</p>
          <div className="mt-5 space-y-4">
            {t.objections.length === 0 && <p className="text-sm text-muted">No finished rehearsals yet.</p>}
            {t.objections.map((o) => {
              const d = Number(o.avg_conviction_delta);
              return (
                <div key={o.objection_type} className="grid grid-cols-[120px_1fr_auto] items-center gap-4 text-sm">
                  <span className="font-medium capitalize">{o.objection_type.replace("_", " ")}</span>
                  <div className="h-2.5 rounded-full bg-black/[0.06]">
                    <div className="h-2.5 rounded-full bg-accent" style={{ width: `${(Math.abs(Math.min(0, d)) / worst) * 100}%` }} />
                  </div>
                  <span className="w-64 text-right tabular-nums text-muted">
                    {d > 0 ? "+" : ""}
                    {d} avg · raised {o.times_raised}×{o.loss_rate !== undefined ? ` · ${Math.round(Number(o.loss_rate) * 100)}% lost` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-5">
          <h2 className="font-semibold">Rehearsals</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {t.sessions.map((s) => (
              <li key={s.session_id}>
                <Link href={`/score/${s.session_id}`} className="card flex items-center justify-between px-5 py-3 transition hover:-translate-y-0.5">
                  <span className="font-medium">{s.company}</span>
                  <span className="text-muted">
                    {new Date(s.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {s.turns} turns ·{" "}
                    <span className={s.result === "won" ? "font-semibold text-emerald-700" : "font-semibold text-ink"}>
                      {s.result} {s.buys}–{3 - Number(s.buys)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
