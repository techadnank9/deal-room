"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, EXEC_COLOR, EXEC_LABEL } from "@/lib/ui";
import type { SessionState } from "@/lib/types";

type Ev = { turn: number; actor: string; event_type: string; conviction_after: number | null };

export default function ScorePage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<{ session: SessionState; events: Ev[]; bruin: Record<string, unknown> | null } | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api<{ session: SessionState; events: Ev[]; bruin: Record<string, unknown> | null }>(`/api/score?id=${id}`)
      .then(setData)
      .catch((e) => setErr(String(e)));
  }, [id]);

  if (err) return <p className="p-10 text-red-600">{err}</p>;
  if (!data) return <p className="p-10 text-muted">Scoring…</p>;
  const s = data.session;
  const votes = s.votes ?? [];
  const buys = votes.filter((v) => v.vote === "buy").length;
  const won = buys >= 2;

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <p className="text-sm uppercase tracking-[0.18em] text-accent">Scorecard · {s.brief.company}</p>
      <h1 className={`mt-2 text-4xl font-semibold ${won ? "text-emerald-700" : "text-red-600"}`}>
        {votes.length ? (won ? `Deal won ${buys}–${3 - buys}` : `Deal lost ${buys}–${3 - buys}`) : "Call not finished"}
      </h1>
      <p className="mt-2 text-muted">
        {s.turn} turns · pitching {s.offering}
      </p>

      <section className="mt-10 grid gap-4 md:grid-cols-3">
        {s.personas.map((p) => {
          const v = votes.find((x) => x.id === p.id);
          const timeline = data.events
            .filter((e) => e.actor === p.id && e.event_type === "conviction_change" && e.conviction_after != null)
            .map((e) => e.conviction_after as number);
          return (
            <div key={p.id} className="card p-5">
              <div className="flex items-center justify-between">
                <span className="font-semibold" style={{ color: EXEC_COLOR[p.id] }}>
                  {p.name}
                </span>
                <span className={v?.vote === "buy" ? "text-emerald-700" : "text-red-600"}>{v ? v.vote.toUpperCase() : "—"}</span>
              </div>
              <p className="text-xs text-muted">{EXEC_LABEL[p.id]} · ended at {p.conviction}/100</p>
              <Sparkline values={timeline} color={EXEC_COLOR[p.id]} />
              {v && (
                <>
                  <p className="mt-3 text-sm text-ink/80">“{v.reason}”</p>
                  <p className="mt-3 text-xs uppercase tracking-wider text-muted">Line that decided it (turn {v.decisiveTurn})</p>
                  <p className="mt-1 text-sm italic text-muted">“{v.decisiveLine || "—"}”</p>
                </>
              )}
            </div>
          );
        })}
      </section>

      <section className="mt-10 grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="text-lg font-semibold">Claims checked</h2>
          {s.claimChecks.length === 0 && <p className="mt-2 text-sm text-muted">You made no checkable claims. Numbers persuade — bring some.</p>}
          <ul className="mt-3 space-y-2 text-sm">
            {s.claimChecks.map((c, i) => (
              <li key={i} className="rounded-xl border border-line bg-white px-3 py-2">
                <span className={c.status === "verified" ? "text-emerald-700" : "text-red-600"}>
                  {c.status === "verified" ? "VERIFIED" : c.status === "contradicted" ? "BUSTED" : "UNSUPPORTED"}
                </span>{" "}
                <span className="text-ink/80">{c.claim}</span>
                <p className="text-xs text-muted">
                  {c.note}{" "}
                  {c.sourceUrl && (
                    <a className="underline" href={c.sourceUrl} target="_blank">
                      source
                    </a>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-lg font-semibold">Whispers, revealed</h2>
          {s.whispers.length === 0 && <p className="mt-2 text-sm text-muted">Nobody passed notes.</p>}
          <ul className="mt-3 space-y-2 text-sm">
            {s.whispers.map((w, i) => (
              <li key={i} className="rounded-xl border border-line bg-white px-3 py-2">
                <span style={{ color: EXEC_COLOR[w.from] }}>{w.from}</span> → <span className="text-muted">{w.to}</span>{" "}
                <span className="text-xs text-muted">turn {w.turn}</span>
                <p className="text-ink/80">“{w.text}”</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Three things to fix</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-ink/80">
          {(s.fixes ?? []).map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ol>
      </section>

      <p className="mt-8 text-xs text-muted">
        {data.bruin ? "Scorecard tables produced by the Bruin pipeline." : "Bruin tables not available yet; showing raw session data."}
      </p>
      <div className="mt-6 flex gap-4">
        <Link href="/" className="pill-dark">
          New rehearsal
        </Link>
        <Link href="/history" className="rounded-lg border border-line px-5 py-2.5">
          History
        </Link>
      </div>
    </main>
  );
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <div className="mt-3 h-10" />;
  const w = 200;
  const h = 40;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / 100) * h}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 h-10 w-full">
      <line x1="0" x2={w} y1={h * 0.4} y2={h * 0.4} stroke="#d6cfc3" strokeDasharray="3 3" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" />
    </svg>
  );
}
