"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { EXEC_COLOR } from "@/lib/ui";
import type { Lead, TeamState } from "@/lib/agents/team";

const NAMES: Record<string, string> = { cfo: "Maya", tech: "Arjun", procurement: "Elena" };
const COLS: { key: Lead["status"]; label: string; tone: string }[] = [
  { key: "new", label: "New lead", tone: "bg-sky-100 text-sky-800" },
  { key: "contacted", label: "Email drafted", tone: "bg-amber-100 text-amber-800" },
  { key: "meeting", label: "Meeting booked", tone: "bg-emerald-100 text-emerald-800" },
];

function ago(iso: string) {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`;
}

/** The full CRM. It updates live as you talk to the team in the room. */
export default function Crm() {
  const [t, setT] = useState<TeamState | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [flash, setFlash] = useState<string[]>([]);
  const prev = useRef<Record<string, string>>({});

  useEffect(() => {
    let stop = false;
    async function load() {
      const r = await fetch("/api/team", { cache: "no-store" });
      if (!r.ok || stop) return;
      const next = (await r.json()) as TeamState;
      const sig: Record<string, string> = {};
      const changed: string[] = [];
      for (const l of next.leads) {
        sig[l.id] = `${l.status}|${l.email ? 1 : 0}|${l.meeting ? 1 : 0}`;
        if (Object.keys(prev.current).length && prev.current[l.id] !== sig[l.id]) changed.push(l.id);
      }
      prev.current = sig;
      if (changed.length) {
        setFlash(changed);
        setTimeout(() => setFlash([]), 4000);
      }
      setT(next);
    }
    void load();
    const i = setInterval(() => void load(), 2000);
    return () => {
      stop = true;
      clearInterval(i);
    };
  }, []);

  if (!t) return <p className="p-10 text-muted">Loading CRM…</p>;
  const sel = t.leads.find((l) => l.id === pick) ?? null;
  const feed = [...t.chat].reverse().slice(0, 40);

  return (
    <main className="min-h-screen bg-paper">
      <header className="sticky top-0 z-10 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            <h1 className="text-lg font-semibold">CRM</h1>
            <span className="text-sm text-muted">{t.company ? `${t.company} · ` : ""}live from the team room</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            {[
              ["Leads", t.leads.length],
              ["Emails", t.leads.filter((l) => l.email).length],
              ["Meetings", t.leads.filter((l) => l.meeting).length],
            ].map(([k, v]) => (
              <span key={k} className="card px-3 py-1.5">
                <span className="font-semibold">{v}</span> <span className="text-muted">{k}</span>
              </span>
            ))}
            <Link href="/team" className="pill-dark px-4 py-1.5">
              Team room
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1400px] gap-5 px-6 py-6 lg:grid-cols-[1fr_340px]">
        <section className="grid gap-4 md:grid-cols-3">
          {COLS.map((c) => {
            const items = t.leads.filter((l) => l.status === c.key);
            return (
              <div key={c.key} className="min-w-0">
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.tone}`}>{c.label}</span>
                  <span className="text-xs text-muted">{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.length === 0 && <p className="rounded-xl border border-dashed border-line p-4 text-xs text-muted">Nothing here yet.</p>}
                  {items.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => setPick(l.id === pick ? null : l.id)}
                      className={`rise block w-full rounded-xl border bg-white p-3 text-left text-sm transition hover:border-ink ${flash.includes(l.id) ? "border-accent shadow-[0_0_0_3px_rgba(255,74,28,0.15)]" : pick === l.id ? "border-ink" : "border-line"}`}
                    >
                      <p className="truncate font-semibold">{l.company}</p>
                      <p className="truncate text-xs text-muted">
                        {l.domain}
                        {l.size ? ` · ${l.size} people` : ""}
                        {l.funding ? ` · ${l.funding}` : ""}
                      </p>
                      <p className="mt-1.5 line-clamp-2 text-xs text-ink/80">{l.why}</p>
                      <p className="mt-1.5 text-[11px] text-muted">
                        {l.meeting ? `Meeting ${l.meeting.when}` : l.email ? "Email ready" : `Found by ${l.foundBy}`} · {ago(l.at)}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </section>

        <aside className="space-y-4">
          {sel && (
            <div className="card p-4 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{sel.company}</p>
                  <a href={`https://${sel.domain}`} target="_blank" className="text-xs text-muted underline">
                    {sel.domain}
                  </a>
                </div>
                <button onClick={() => setPick(null)} className="text-xs text-muted hover:text-ink">
                  Close
                </button>
              </div>
              <p className="mt-2 text-xs text-ink/80">{sel.why}</p>
              {sel.sourceUrl && (
                <a href={sel.sourceUrl} target="_blank" className="mt-1 inline-block text-[11px] text-muted underline">
                  Source (Telem)
                </a>
              )}
              {sel.email && (
                <div className="mt-3 rounded-lg bg-black/[0.03] p-2.5 text-xs">
                  <p className="text-[11px] uppercase tracking-wide text-muted">Email by Arjun</p>
                  <p className="mt-1 font-semibold">{sel.email.subject}</p>
                  <p className="mt-1 whitespace-pre-line text-ink/85">{sel.email.body}</p>
                </div>
              )}
              {sel.meeting && (
                <div className="mt-3 rounded-lg bg-emerald-50 p-2.5 text-xs">
                  <p className="text-[11px] uppercase tracking-wide text-muted">Meeting by Elena</p>
                  <p className="mt-1 font-semibold">
                    {sel.meeting.subject} · {sel.meeting.when}
                  </p>
                  <p className="mt-1 whitespace-pre-line text-ink/85">{sel.meeting.invite}</p>
                </div>
              )}
            </div>
          )}
          <div className="card p-4">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Activity</p>
            <div className="mt-3 max-h-[70vh] space-y-3 overflow-y-auto">
              {feed.length === 0 && <p className="text-xs text-muted">Talk to the team and it shows up here.</p>}
              {feed.map((c, i) => {
                const agent = NAMES[c.who];
                return (
                  <div key={`${c.at}-${i}`} className="flex gap-2.5 text-xs">
                    <span
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold text-white"
                      style={{ background: agent ? EXEC_COLOR[c.who as keyof typeof EXEC_COLOR] : "#111" }}
                    >
                      {(agent ?? c.who).slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p>
                        <span className="font-semibold">{agent ?? c.who}</span> <span className="text-muted">· {ago(c.at)}</span>
                      </p>
                      <p className="text-ink/85">{c.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
