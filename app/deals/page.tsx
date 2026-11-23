"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, EXEC_COLOR, initials } from "@/lib/ui";

type Deal = {
  id: string;
  domain: string;
  company: string;
  offering: string;
  stage: string;
  risk: "Low" | "Medium" | "High";
  avgConviction: number;
  committee: { id: string; name: string; title: string; conviction: number; backs: string | null; vote: string | null }[];
  players: string[];
  worldEvent: string | null;
  checks: { key: string; label: string; met: boolean }[];
  score: number;
  meetings: number;
  record: { won: number; lost: number };
  turns: number;
  lastActivity: string;
};
type Data = { deals: Deal[]; totals: { accounts: number; won: number; lost: number; open: number; highRisk: number; meetingsWon: number; meetingsLost: number } };

const STAGE_STYLE: Record<string, string> = {
  Won: "bg-emerald-100 text-emerald-800",
  Lost: "bg-black/[0.07] text-ink",
  "In meeting": "bg-amber-100 text-amber-800",
  "Meeting scheduled": "bg-sky-100 text-sky-800",
};
const RISK_STYLE: Record<string, string> = { Low: "text-emerald-700", Medium: "text-amber-700", High: "text-red-600" };

export default function DealsPage() {
  const [d, setD] = useState<Data | null>(null);
  const [filter, setFilter] = useState("All");
  const [err, setErr] = useState("");
  useEffect(() => {
    const load = () => api<Data>("/api/deals").then(setD).catch((e) => setErr(String(e)));
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);
  if (err) return <p className="p-10 text-red-600">{err}</p>;
  if (!d) return <p className="p-10 text-muted">Loading pipeline…</p>;
  const rows = d.deals.filter((x) => filter === "All" || x.stage === filter || (filter === "At risk" && x.risk === "High" && x.stage !== "Lost"));

  return (
    <main className="glow min-h-screen w-full">
      <div className="mx-auto max-w-6xl px-8 py-10">
        <nav className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="h-2.5 w-2.5 rounded-full bg-accent" /> Deal Room
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/history" className="text-muted hover:text-ink">
              Trends
            </Link>
            <Link href="/new" className="pill-dark">
              New meeting <span className="arrow">→</span>
            </Link>
          </div>
        </nav>

        <header className="mt-10">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Pipeline</p>
          <h1 className="mt-2 text-5xl font-semibold tracking-[-0.03em]">Every account, every committee.</h1>
        </header>

        <section className="mt-8 grid gap-4 sm:grid-cols-5">
          {[
            { k: "Accounts", v: d.totals.accounts, f: "All" },
            { k: "Open", v: d.totals.open, f: "In meeting" },
            { k: "Meetings won", v: d.totals.meetingsWon, f: "Won" },
            { k: "Meetings lost", v: d.totals.meetingsLost, f: "Lost" },
            { k: "At risk", v: d.totals.highRisk, f: "At risk" },
          ].map((x) => (
            <button
              key={x.k}
              onClick={() => setFilter(filter === x.f ? "All" : x.f)}
              className={`card p-4 text-left transition ${filter === x.f ? "ring-2 ring-ink" : ""}`}
            >
              <p className="text-xs uppercase tracking-[0.14em] text-muted">{x.k}</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight">{x.v}</p>
            </button>
          ))}
        </section>

        <section className="card mt-5 overflow-hidden">
          <div className="grid grid-cols-[1.6fr_0.9fr_0.7fr_1.6fr_1.2fr_0.7fr] gap-4 border-b border-line px-5 py-3 text-xs font-medium uppercase tracking-[0.12em] text-muted">
            <span>Account</span>
            <span>Stage</span>
            <span>Risk</span>
            <span>Committee</span>
            <span>Qualification</span>
            <span className="text-right">Next</span>
          </div>
          {rows.length === 0 && <p className="px-5 py-6 text-sm text-muted">No accounts here yet.</p>}
          {rows.map((x) => (
            <div key={x.id} className="grid grid-cols-[1.6fr_0.9fr_0.7fr_1.6fr_1.2fr_0.7fr] items-center gap-4 border-b border-line/70 px-5 py-4 text-sm last:border-0 hover:bg-white/60">
              <div className="min-w-0">
                <p className="truncate font-semibold">{x.company}</p>
                <p className="truncate text-xs text-muted">
                  {x.domain} · {x.meetings} meeting{x.meetings > 1 ? "s" : ""} ({x.record.won}W {x.record.lost}L) · {new Date(x.lastActivity).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </p>
                {x.players.length > 0 && <p className="truncate text-xs text-muted">Team: {x.players.join(", ")}</p>}
              </div>
              <div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STAGE_STYLE[x.stage]}`}>{x.stage}</span>
                {x.worldEvent && <p className="mt-1 text-[11px] text-accent">{x.worldEvent.replace(/_/g, " ")}</p>}
              </div>
              <div>
                <span className={`font-semibold ${RISK_STYLE[x.risk]}`}>{x.risk}</span>
                <p className="text-xs text-muted">room {x.avgConviction}</p>
              </div>
              <div className="flex flex-col gap-1">
                {x.committee.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 text-xs">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[9px] font-bold text-white" style={{ background: EXEC_COLOR[c.id as keyof typeof EXEC_COLOR] }}>
                      {initials(c.name)}
                    </span>
                    <span className="truncate">{c.name}</span>
                    <span className="tabular-nums text-muted">{c.conviction}</span>
                    {c.vote && <span className={c.vote === "buy" ? "font-semibold text-emerald-700" : "text-muted"}>{c.vote.toUpperCase()}</span>}
                    {c.backs && <span className="truncate text-emerald-700">backs {c.backs}</span>}
                  </div>
                ))}
              </div>
              <div>
                <div className="flex gap-1">
                  {x.checks.map((c) => (
                    <span
                      key={c.key}
                      title={`${c.label}: ${c.met ? "met" : "not yet"}`}
                      className={`grid h-6 w-6 place-items-center rounded-md text-[11px] font-bold ${c.met ? "bg-ink text-white" : "bg-black/[0.06] text-muted"}`}
                    >
                      {c.key}
                    </span>
                  ))}
                </div>
                <p className="mt-1 text-xs text-muted">{x.score}% qualified</p>
              </div>
              <div className="text-right">
                <Link href={x.stage === "Won" || x.stage === "Lost" ? `/score/${x.id}` : `/room/${x.id}`} className="font-medium underline-offset-4 hover:underline">
                  {x.stage === "Won" || x.stage === "Lost" ? "Scorecard" : "Join room"} →
                </Link>
              </div>
            </div>
          ))}
        </section>
        <p className="mt-3 text-xs text-muted">Qualification letters: M metrics, E economic buyer, D decision criteria, P paper process, C champion, X competition. Hover for detail.</p>
      </div>
    </main>
  );
}
