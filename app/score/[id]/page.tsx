"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, EXEC_COLOR, EXEC_LABEL, initials } from "@/lib/ui";
import type { SessionState } from "@/lib/types";

type Bruin = {
  scorecard: Record<string, string>;
  timeline: { turn: string; actor: string; conviction_after: string; delta: string; objection_type: string | null; reason: string }[];
  claims: { turn: string; claim: string; status: string; note: string; source_url: string }[];
  objections: { objection_type: string; times_raised: string; avg_conviction_delta: number }[];
};
type Data = { session: SessionState; bruin: Bruin | null; bruinRun: { ok: boolean; output: string; ms?: number } | null };

export default function ScorePage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [waited, setWaited] = useState(0);

  useEffect(() => {
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const load = () =>
      api<Data>(`/api/score?id=${id}`)
        .then((d) => {
          setData(d);
          setWaited(tries);
          // The Bruin pipeline runs after the verdict; poll until its tables include this session.
          if (!d.bruin && d.session.status === "finished" && tries++ < 20) timer = setTimeout(load, 2000);
        })
        .catch((e) => setErr(String(e)));
    load();
    return () => clearTimeout(timer);
  }, [id]);

  if (err) return <p className="p-10 text-red-600">{err}</p>;
  if (!data) return <p className="p-10 text-muted">Scoring…</p>;
  const s = data.session;
  const b = data.bruin;
  const votes = s.votes ?? [];
  const buys = b ? Number(b.scorecard.buys) : votes.filter((v) => v.vote === "buy").length;
  const won = buys >= 2;
  const claims = b ? b.claims : s.claimChecks.map((c) => ({ turn: String(c.turn), claim: c.claim, status: c.status, note: c.note, source_url: c.sourceUrl }));

  return (
    <main className="glow min-h-screen w-full">
      <div className="mx-auto max-w-6xl px-8 py-10">
        <nav className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="h-2.5 w-2.5 rounded-full bg-accent" /> Deal Room
          </Link>
          <Link href="/history" className="text-sm text-muted hover:text-ink">
            History
          </Link>
        </nav>

        <header className="mt-12">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Scorecard · {s.brief.company}</p>
          <h1 className={`mt-2 text-5xl font-semibold tracking-[-0.03em] ${won ? "text-emerald-700" : "text-ink"}`}>
            {votes.length ? (won ? `Deal won, ${buys} to ${3 - buys}.` : `Deal lost, ${buys} to ${3 - buys}.`) : "Call not finished."}
          </h1>
          <p className="mt-3 text-muted">
            {s.turn} turns · pitching {s.offering}
          </p>
          <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-line bg-white/70 px-3 py-1 text-xs text-muted">
            <span className={`h-1.5 w-1.5 rounded-full ${b ? "bg-emerald-600" : "bg-amber-500"}`} />
            {b
              ? "Built by the Bruin pipeline: mart.session_scorecard, mart.conviction_timeline, mart.claim_outcomes"
              : waited >= 20 || data.bruinRun?.ok === false
                ? "Bruin tables unavailable; showing raw session data"
                : "Bruin pipeline is building this scorecard…"}
          </p>
        </header>

        <section className="mt-10 grid gap-5 md:grid-cols-3">
          {s.personas.map((p) => {
            const v = votes.find((x) => x.id === p.id);
            const timeline = b
              ? b.timeline.filter((t) => t.actor === p.id).map((t) => Number(t.conviction_after))
              : [];
            const portrait = s.portraits?.[p.id];
            return (
              <div key={p.id} className="card overflow-hidden">
                <div className="relative aspect-[16/10]" style={{ background: `${EXEC_COLOR[p.id]}14` }}>
                  {portrait ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/image?url=${encodeURIComponent(portrait)}`} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full place-items-center">
                      <span className="grid h-16 w-16 place-items-center rounded-full text-xl font-semibold text-white" style={{ background: EXEC_COLOR[p.id] }}>
                        {initials(p.name)}
                      </span>
                    </div>
                  )}
                  <span
                    className={`absolute right-3 top-3 rounded-full px-3 py-1 text-xs font-bold ${
                      v?.vote === "buy" ? "bg-emerald-600 text-white" : v ? "bg-ink text-white" : "bg-white text-muted"
                    }`}
                  >
                    {v ? (v.vote === "buy" ? "BUY" : "PASS") : "—"}
                  </span>
                  <span className="absolute bottom-3 left-3 rounded-full bg-white/90 px-3 py-1 text-sm font-medium">{p.name}</span>
                </div>
                <div className="p-5">
                  <p className="text-xs text-muted">
                    {EXEC_LABEL[p.id]} · ended at {p.conviction}/100
                  </p>
                  <Sparkline values={timeline} color={EXEC_COLOR[p.id]} />
                  {v && (
                    <>
                      <p className="mt-3 text-[15px] leading-snug">“{v.reason}”</p>
                      <p className="mt-4 text-xs font-medium uppercase tracking-[0.14em] text-muted">The line that decided it · turn {v.decisiveTurn}</p>
                      <p className="mt-1 text-sm italic text-ink/75">“{v.decisiveLine || "—"}”</p>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </section>

        <section className="mt-6 grid gap-5 md:grid-cols-2">
          <div className="card p-6">
            <h2 className="font-semibold">Claims the analyst checked</h2>
            {claims.length === 0 && <p className="mt-2 text-sm text-muted">You made no checkable claims. Numbers persuade, so bring some with sources.</p>}
            <ul className="mt-3 space-y-3 text-sm">
              {claims.map((c, i) => (
                <li key={i} className="flex gap-3">
                  <span
                    className={`mt-0.5 h-fit shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                      c.status === "verified" ? "bg-emerald-100 text-emerald-700" : c.status === "contradicted" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {c.status === "contradicted" ? "BUSTED" : c.status.toUpperCase()}
                  </span>
                  <div>
                    <p>{c.claim}</p>
                    <p className="text-xs text-muted">
                      {c.note}{" "}
                      {c.source_url && (
                        <a className="underline" href={c.source_url} target="_blank">
                          source
                        </a>
                      )}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="card p-6">
            <h2 className="font-semibold">Whispers, revealed</h2>
            {s.whispers.length === 0 && <p className="mt-2 text-sm text-muted">Nobody passed notes.</p>}
            <ul className="mt-3 space-y-3 text-sm">
              {s.whispers.map((w, i) => (
                <li key={i}>
                  <span className="font-semibold" style={{ color: EXEC_COLOR[w.from] }}>
                    {s.personas.find((p) => p.id === w.from)?.name ?? w.from}
                  </span>
                  <span className="text-muted"> to {s.personas.find((p) => p.id === w.to)?.name ?? w.to} · turn {w.turn}</span>
                  <p className="mt-0.5">“{w.text}”</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mt-6 grid gap-5 md:grid-cols-[1.4fr_1fr]">
          <div className="card p-6">
            <h2 className="font-semibold">Three things to fix</h2>
            <ol className="mt-3 space-y-3">
              {(s.fixes ?? []).map((f, i) => (
                <li key={i} className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-white">{i + 1}</span>
                  <span className="leading-snug">{f}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="card p-6">
            <h2 className="font-semibold">Objections that cost you</h2>
            {!b?.objections.length && <p className="mt-2 text-sm text-muted">Waiting on mart.objections_by_type…</p>}
            <ul className="mt-3 space-y-2 text-sm">
              {b?.objections.map((o) => (
                <li key={o.objection_type} className="flex items-center justify-between">
                  <span className="capitalize">{o.objection_type.replace("_", " ")}</span>
                  <span className="tabular-nums text-muted">
                    raised {o.times_raised}× · <span className={o.avg_conviction_delta < 0 ? "text-red-600" : "text-emerald-700"}>{o.avg_conviction_delta}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <div className="mt-10 flex gap-3">
          <Link href="/new" className="pill-dark">
            Rehearse again <span className="arrow">→</span>
          </Link>
          <Link href="/history" className="rounded-full border border-line bg-white px-5 py-2.5">
            Your trends
          </Link>
        </div>
      </div>
    </main>
  );
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <div className="mt-3 h-10" />;
  const w = 220;
  const h = 40;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / 100) * h}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 h-10 w-full" preserveAspectRatio="none">
      <line x1="0" x2={w} y1={h * 0.4} y2={h * 0.4} stroke="#d6cfc3" strokeDasharray="3 3" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
