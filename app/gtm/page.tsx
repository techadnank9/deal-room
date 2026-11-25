"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Lead, TeamState } from "@/lib/agents/team";
import { STAGES, type Activity, type Stage, type Touch } from "@/lib/gtm/types";

type Analytics = {
  funnel: { stage: Stage; count: number }[];
  conv: { from: Stage; to: Stage; rate: number }[];
  byIndustry: { key: string; leads: number; contacted: number; replied: number }[];
  byTier: { key: string; leads: number; contacted: number; replied: number }[];
  variants: { variant: string; channel: string; drafted: number; approved: number; replied: number }[];
  attribution: { agent: number; rep: number };
  pendingApprovals: number;
};
type Billing = { provider: string; customer: string; balance: number; counts: Record<string, number>; prices: Record<string, number>; labels: Record<string, string>; recent: { event: string; at: string; detail?: string }[] };
type GNode = { id: string; label: string; type: string; tier?: string; stage?: string };
type GEdge = { from: string; to: string; rel: string };
type Graph = { nodes: GNode[]; edges: GEdge[]; warm: { leadId: string; company: string; hops: string[]; why: string }[]; lookalikes?: { customer: string; leadId: string; company: string; score: number }[]; displacement: { company: string; competitor: string; signal: string }[]; ms: number };
type Payload = { state: TeamState; analytics: Analytics; billing: Billing; graph: Graph | null; moss: string };
type Hit = { id: string; text: string; score: number; metadata?: Record<string, string> };

const TABS = ["ICP", "Leads", "Graph", "Approvals", "Pipeline", "Analytics"] as const;
type Tab = (typeof TABS)[number];

function company() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("url") || localStorage.getItem("dealroom-company") || "";
}
async function post<T = { state: TeamState }>(body: Record<string, unknown>): Promise<T> {
  const r = await fetch("/api/gtm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: company(), ...body }) });
  return (await r.json()) as T;
}
function ago(iso?: string) {
  if (!iso) return "";
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`;
}
const stageOf = (l: Lead): Stage => l.stage ?? (l.status === "meeting" ? "meeting" : "matched");
const host = (u?: string) => {
  try {
    return new URL(u!).hostname.replace(/^www\./, "");
  } catch {
    return u ?? "";
  }
};

function Conf({ v }: { v: number }) {
  const pct = Math.round(v * 100);
  const tone = v >= 0.75 ? "bg-emerald-500" : v >= 0.5 ? "bg-amber-500" : "bg-rose-400";
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted" title={`confidence ${v.toFixed(2)}`}>
      <span className="h-1.5 w-10 overflow-hidden rounded-full bg-line">
        <span className={`block h-full ${tone}`} style={{ width: `${pct}%` }} />
      </span>
      {v.toFixed(2)}
    </span>
  );
}
function TierBadge({ tier, score }: { tier?: string; score?: number }) {
  if (!tier) return <span className="text-xs text-muted">—</span>;
  const tone = tier === "A" ? "bg-ink text-white" : tier === "B" ? "bg-accent/15 text-accent" : "bg-line text-muted";
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap pr-3">
      <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold ${tone}`}>Tier {tier}</span>
      <span className="font-mono text-sm tabular-nums">{score}</span>
    </span>
  );
}
function EmailDot({ s }: { s: string }) {
  const m: Record<string, [string, string]> = {
    "mx-valid": ["bg-emerald-500", "Email on file, domain MX valid"],
    guessed: ["bg-amber-500", "Pattern-guessed, domain MX valid"],
    "no-mx": ["bg-rose-500", "Domain has no MX record"],
    unknown: ["bg-line", "No email"],
  };
  const [c, t] = m[s] ?? m.unknown;
  return <span title={t} className={`inline-block h-2 w-2 rounded-full ${c}`} />;
}

export default function Gtm() {
  const [d, setD] = useState<Payload | null>(null);
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "ICP";
    const x = new URLSearchParams(window.location.search).get("tab");
    return (TABS.find((k) => k.toLowerCase() === x?.toLowerCase()) ?? "ICP") as Tab;
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [feedOpen, setFeedOpen] = useState(true);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ hits: Hit[]; ms: number; provider: string } | null>(null);
  const [sel, setSel] = useState<string | null>(null);

  const load = useCallback(async (withGraph = false) => {
    const c = company();
    const r = await fetch(`/api/gtm?${new URLSearchParams({ ...(c ? { url: c } : {}), ...(withGraph ? { graph: "1" } : {}) })}`, { cache: "no-store" });
    if (!r.ok) return;
    const next = (await r.json()) as Payload;
    setD((prev) => ({ ...next, graph: next.graph ?? prev?.graph ?? null }));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- polling fetch; state is set after the await
    void load();
    const i = setInterval(() => void load(), 2500);
    return () => clearInterval(i);
  }, [load]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on tab open; state is set after the await
    if (tab === "Graph") void load(true);
  }, [tab, load]);

  async function act(label: string, body: Record<string, unknown>) {
    setBusy(label);
    try {
      await post(body);
      await load(tab === "Graph");
    } finally {
      setBusy(null);
    }
  }

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setHits(await post({ action: "search", q }));
  }

  if (!d) return <p className="p-10 text-muted">Loading GTM Engine…</p>;
  const t = d.state;
  const leads = [...t.leads].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const lead = t.leads.find((l) => l.id === sel) ?? null;

  return (
    <main className="min-h-screen bg-paper text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-4 px-6 py-3">
          <div className="flex items-baseline gap-3">
            <h1 className="text-xl font-semibold tracking-tight">GTM Engine</h1>
            <span className="text-sm text-muted">{t.company ?? "No company yet"}{t.offering ? ` · ${t.offering}` : ""}</span>
          </div>
          <form onSubmit={runSearch} className="ml-auto flex items-center gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search everything the agents found…"
              className="w-72 rounded-full border border-line bg-white px-4 py-1.5 text-sm outline-none focus:border-ink"
            />
            <span className="rounded-full bg-[#5C8A5C]/15 px-2 py-1 text-[11px] font-medium text-[#3f6b3f]">Moss {d.moss === "moss" ? "live" : "local"}</span>
          </form>
          <Credits b={d.billing} onTop={() => act("topup", { action: "topup", credits: 10 })} onDrain={() => act("drain", { action: "drain" })} busy={busy} />
          <Link href="/team" className="rounded-full bg-ink px-4 py-1.5 text-sm font-medium text-white">Team room</Link>
        </div>
        {hits && (
          <div className="mx-auto max-w-[1500px] px-6 pb-3">
            <div className="card rise p-3">
              <div className="mb-2 flex items-center justify-between text-xs text-muted">
                <span>
                  {hits.hits.length} results in <b className="font-mono text-ink">{hits.ms} ms</b> via {hits.provider === "moss" ? "Moss semantic search" : "local index"}
                </span>
                <button onClick={() => setHits(null)} className="hover:text-ink">close</button>
              </div>
              <ul className="grid gap-1.5 md:grid-cols-2">
                {hits.hits.map((h) => (
                  <li key={h.id} className="flex items-start gap-2 rounded-lg px-2 py-1 text-sm hover:bg-paper">
                    <span className="mt-0.5 rounded bg-line px-1.5 text-[10px] uppercase tracking-wide text-muted">{h.metadata?.kind ?? "doc"}</span>
                    <button className="text-left" onClick={() => h.metadata?.leadId && (setSel(h.metadata.leadId), setTab("Leads"))}>{h.text.slice(0, 160)}</button>
                    <span className="ml-auto font-mono text-[11px] text-muted">{h.score.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        <nav className="mx-auto flex max-w-[1500px] gap-1 px-6">
          {TABS.map((x) => (
            <button key={x} onClick={() => setTab(x)} className={`border-b-2 px-3 pb-2 text-sm ${tab === x ? "border-ink font-semibold" : "border-transparent text-muted hover:text-ink"}`}>
              {x}
              {x === "Approvals" && d.analytics.pendingApprovals > 0 && <span className="ml-1.5 rounded-full bg-accent px-1.5 text-[10px] font-semibold text-white">{d.analytics.pendingApprovals}</span>}
              {x === "Leads" && <span className="ml-1.5 text-[11px] text-muted">{t.leads.length}</span>}
            </button>
          ))}
        </nav>
      </header>

      <div className={`mx-auto grid max-w-[1500px] gap-5 px-6 py-5 ${feedOpen ? "lg:grid-cols-[minmax(0,1fr)_320px]" : ""}`}>
        <section className="min-w-0">
          {tab === "ICP" && <IcpTab t={t} busy={busy} act={act} />}
          {tab === "Leads" && <LeadsTab leads={leads} sel={lead} setSel={setSel} busy={busy} act={act} />}
          {tab === "Graph" && <GraphTab g={d.graph} reload={() => load(true)} setSel={(id) => (setSel(id), setTab("Leads"))} />}
          {tab === "Approvals" && <ApprovalsTab leads={t.leads} busy={busy} act={act} />}
          {tab === "Pipeline" && <PipelineTab leads={t.leads} act={act} open={(id) => (setSel(id), setTab("Leads"))} />}
          {tab === "Analytics" && <AnalyticsTab a={d.analytics} b={d.billing} />}
        </section>
        {feedOpen ? (
          <Feed items={t.activity ?? []} close={() => setFeedOpen(false)} />
        ) : (
          <button onClick={() => setFeedOpen(true)} className="fixed bottom-5 right-5 rounded-full bg-ink px-4 py-2 text-sm text-white shadow-lg">Agent thinking</button>
        )}
      </div>
    </main>
  );
}

function Credits({ b, onTop, onDrain, busy }: { b: Billing; onTop: () => void; onDrain: () => void; busy: string | null }) {
  const low = b.balance < b.prices.lead_enriched;
  return (
    <div className={`flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${low ? "border-rose-300 bg-rose-50" : "border-line bg-white"}`} title={`Flexprice customer ${b.customer}`}>
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted">Flexprice</span>
      <span className={`font-mono font-semibold tabular-nums ${low ? "text-rose-600" : ""}`}>${b.balance.toFixed(2)}</span>
      <span className="text-xs text-muted">credits</span>
      <button disabled={!!busy} onClick={onTop} className="rounded-full bg-ink px-2 py-0.5 text-[11px] text-white disabled:opacity-40">+$10</button>
      <button disabled={!!busy} onClick={onDrain} className="text-[11px] text-muted underline-offset-2 hover:text-ink hover:underline disabled:opacity-40" title="Demo: spend all credits to show the gate">drain</button>
    </div>
  );
}

/* ---------------- ICP ---------------- */
function IcpTab({ t, busy, act }: { t: TeamState; busy: string | null; act: (l: string, b: Record<string, unknown>) => Promise<void> }) {
  const [f, setF] = useState(t.intake ?? { product: t.offering ?? "", customers: "", pricing: "", constraints: "" });
  const s = t.icpSpec;
  return (
    <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
      <form
        className="card space-y-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          void act("intake", { action: "intake", intake: f });
        }}
      >
        <h2 className="text-lg font-semibold">Product intake</h2>
        <p className="text-sm text-muted">Describe what you sell in plain language. Maya turns it into a structured ICP the hunters use.</p>
        {(
          [
            ["product", "Product, key features, technical constraints", 4],
            ["customers", "Existing customers / reference wins (comma separated)", 2],
            ["pricing", "Pricing model and typical contract value", 2],
            ["constraints", "Regions, deal-breakers, anything else", 2],
          ] as const
        ).map(([k, label, rows]) => (
          <label key={k} className="block text-sm">
            <span className="mb-1 block font-medium">{label}</span>
            <textarea rows={rows} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink" />
          </label>
        ))}
        <div className="flex gap-2">
          <button disabled={!!busy || !f.product.trim()} className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-40">{busy === "intake" ? "Inferring ICP…" : s ? "Regenerate ICP" : "Generate ICP"}</button>
          <button type="button" disabled={!!busy || !t.company} onClick={() => act("competitors", { action: "competitors" })} className="rounded-full border border-line px-4 py-2 text-sm disabled:opacity-40">{busy === "competitors" ? "Mapping…" : "Map competitors"}</button>
        </div>
        {!t.company && <p className="text-xs text-accent">Enter your company URL in the team room first so Maya knows who you are.</p>}
      </form>

      <div className="min-w-0 space-y-5">
        {!s ? (
          <div className="card grid place-items-center p-10 text-sm text-muted">{t.intake ? <span className="flex items-center gap-2"><span className="h-2 w-2 animate-pulse rounded-full bg-accent" />Maya is building your ICP from your website…</span> : "No ICP yet. Enter your company URL on the home page, or fill in the intake and press Generate."}</div>
        ) : (
          <>
            <div className="card p-5">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-lg font-semibold">Ideal customer profile</h2>
                <span className="text-xs text-muted">generated {ago(s.generatedAt)} ago</span>
              </div>
              <p className="mb-4 text-[15px] leading-snug">{s.summary}</p>
              <table className="w-full table-fixed text-sm">
                <tbody className="divide-y divide-line break-words">
                  {s.industries.map((x) => (
                    <Row key={x.name} k="Industry" v={<>{x.name} <span className="font-mono text-xs text-muted">NAICS {x.naics}</span></>} c={x.confidence} />
                  ))}
                  <Row k="Company size" v={`${s.companySize.headcount} employees · ${s.companySize.revenue}`} c={s.companySize.confidence} />
                  {s.personas.map((p) => (
                    <Row key={p.title} k="Buyer persona" v={<>{p.title} <span className="text-xs text-muted">{p.seniority} · {p.function}</span></>} c={p.confidence} />
                  ))}
                  {s.triggers.map((x) => (
                    <Row key={x.event} k="Trigger event" v={x.event} c={x.confidence} />
                  ))}
                  {s.regions.map((x) => (
                    <Row key={x.name} k="Region" v={x.name} c={x.confidence} />
                  ))}
                  <tr>
                    <td className="py-2 pr-3 align-top text-muted">Disqualifiers</td>
                    <td className="py-2" colSpan={2}>
                      <div className="flex flex-wrap gap-1.5">{s.negativeSignals.map((n) => <span key={n} className="rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-700">{n}</span>)}</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="card p-5">
              <h3 className="mb-1 font-semibold">Expansion segments</h3>
              <p className="mb-3 text-sm text-muted">Adjacent markets Maya thinks you are missing. Accepted segments are added to every lead hunt.</p>
              <div className="grid gap-3 md:grid-cols-2">
                {s.expansions.map((e) => (
                  <div key={e.id} className={`rounded-xl border p-3 ${e.status === "accepted" ? "border-emerald-300 bg-emerald-50/60" : e.status === "dismissed" ? "border-line opacity-50" : "border-line bg-white"}`}>
                    <div className="font-medium">{e.segment}</div>
                    <p className="mt-1 text-sm">{e.reasoning}</p>
                    <p className="mt-1 text-xs text-muted">Evidence: {e.evidence}</p>
                    <div className="mt-2 flex gap-2 text-xs">
                      <button disabled={!!busy} onClick={() => act("exp", { action: "expansion", id: e.id, status: "accepted" })} className="rounded-full bg-ink px-3 py-1 text-white">Accept</button>
                      <button disabled={!!busy} onClick={() => act("exp", { action: "expansion", id: e.id, status: "dismissed" })} className="rounded-full border border-line px-3 py-1">Dismiss</button>
                      {e.status !== "suggested" && <span className="ml-auto self-center text-muted">{e.status}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
        {!!t.competitors?.length && (
          <div className="card overflow-x-auto p-5">
            <h3 className="mb-3 font-semibold">Competitive landscape</h3>
            <table className="w-full min-w-[800px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="pb-2">Company</th>
                  <th>Type</th>
                  <th>Positioning</th>
                  <th>Pricing</th>
                  <th>Their edge</th>
                  <th>Our edge</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line align-top">
                {t.competitors.map((c) => (
                  <tr key={c.name}>
                    <td className="py-2 pr-2 font-medium">
                      {c.name}
                      {c.sourceUrl && <a href={c.sourceUrl} target="_blank" className="block text-[11px] font-normal text-muted underline">{host(c.sourceUrl)}</a>}
                    </td>
                    <td className="pr-2"><span className="rounded bg-line px-1.5 py-0.5 text-xs">{c.category}</span></td>
                    <td className="pr-2">{c.positioning}</td>
                    <td className="pr-2 text-muted">{c.pricing}</td>
                    <td className="pr-2">{c.theirEdge}</td>
                    <td>{c.ourEdge}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
function Row({ k, v, c }: { k: string; v: React.ReactNode; c: number }) {
  return (
    <tr>
      <td className="w-36 py-2 pr-3 align-top text-muted">{k}</td>
      <td className="py-2">{v}</td>
      <td className="w-28 py-2 text-right"><Conf v={c} /></td>
    </tr>
  );
}

/* ---------------- Leads grid ---------------- */
function LeadsTab({ leads, sel, setSel, busy, act }: { leads: Lead[]; sel: Lead | null; setSel: (id: string | null) => void; busy: string | null; act: (l: string, b: Record<string, unknown>) => Promise<void> }) {
  if (!leads.length) return <div className="card p-10 text-center text-sm text-muted">No leads yet. Ask Maya in the team room: “find leads that match our ICP”.</div>;
  return (
    <div className={`grid gap-5 ${sel ? "xl:grid-cols-[1fr_420px]" : ""}`}>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[1080px] text-sm [&_td]:pr-3 [&_th]:pr-3">
          <thead className="whitespace-nowrap border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2.5">Company</th>
              <th>Score</th>
              <th>Fit / Intent</th>
              <th>Industry · Size</th>
              <th>Decision-maker</th>
              <th>Top signal</th>
              <th>Stage</th>
              <th className="pr-4">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {leads.map((l) => {
              const c = l.contacts?.[0];
              return (
                <tr key={l.id} onClick={() => setSel(l.id)} className={`cursor-pointer hover:bg-paper ${sel?.id === l.id ? "bg-paper" : ""}`}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{l.company}</div>
                    <div className="text-xs text-muted">{l.domain}</div>
                  </td>
                  <td><TierBadge tier={l.tier} score={l.score} /></td>
                  <td className="font-mono text-xs tabular-nums text-muted">{l.fit !== undefined ? `${l.fit} / ${l.intent}` : l.enriched === "blocked" ? <span className="text-rose-600">no credits</span> : "—"}</td>
                  <td className="text-xs">{l.industry ?? "—"}<div className="text-muted">{l.size ?? ""}</div></td>
                  <td className="text-xs">
                    {c ? (
                      <span className="flex items-center gap-1.5"><EmailDot s={c.emailStatus} />{c.name}<span className="text-muted">· {c.title}</span></span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="max-w-[240px] truncate text-xs" title={l.signals?.[0]?.text ?? l.why}>{l.signals?.[0]?.text ?? l.why}</td>
                  <td><span className="whitespace-nowrap rounded bg-line px-1.5 py-0.5 text-xs">{STAGES.find((s) => s.key === stageOf(l))?.label}</span></td>
                  <td className="max-w-[140px] truncate pr-4 text-xs"><a onClick={(e) => e.stopPropagation()} href={l.sourceUrl} target="_blank" className="text-muted underline">{host(l.sourceUrl)}</a></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {sel && <LeadPanel l={sel} close={() => setSel(null)} busy={busy} act={act} />}
    </div>
  );
}

function LeadPanel({ l, close, busy, act }: { l: Lead; close: () => void; busy: string | null; act: (l: string, b: Record<string, unknown>) => Promise<void> }) {
  return (
    <aside className="card rise h-fit space-y-4 p-5 xl:sticky xl:top-32">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold">{l.company}</h3>
          <a href={`https://${l.domain}`} target="_blank" className="text-sm text-muted underline">{l.domain}</a>
          <div className="mt-1 text-xs text-muted">{[l.industry, l.hq, l.size && `${l.size} employees`, l.funding && `${l.funding} raised`].filter(Boolean).join(" · ")}</div>
        </div>
        <button onClick={close} className="text-sm text-muted hover:text-ink">✕</button>
      </div>
      <div className="flex items-center gap-3">
        <TierBadge tier={l.tier} score={l.score} />
        {l.scoreWhy && <span className="text-xs text-muted">{l.scoreWhy}</span>}
      </div>
      <div>
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Why this lead</div>
        <p className="text-sm">{l.why} <a href={l.sourceUrl} target="_blank" className="text-xs text-muted underline">[{host(l.sourceUrl)}]</a></p>
      </div>
      {!!l.signals?.length && (
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Buying signals</div>
          <ul className="space-y-1.5 text-sm">
            {l.signals.map((s, i) => (
              <li key={i}><span className="mr-1.5 rounded bg-accent/10 px-1.5 text-[10px] uppercase text-accent">{s.kind.replace("_", " ")}</span>{s.text} {s.sourceUrl && <a href={s.sourceUrl} target="_blank" className="text-xs text-muted underline">[{host(s.sourceUrl)}]</a>}</li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Contacts</div>
        {l.contacts?.length ? (
          <ul className="space-y-2 text-sm">
            {l.contacts.map((c) => (
              <li key={c.id} className="rounded-lg border border-line p-2">
                <div className="flex items-center gap-2"><EmailDot s={c.emailStatus} /><b>{c.name}</b><span className="text-muted">{c.title}</span><Conf v={c.confidence} /></div>
                <div className="mt-0.5 font-mono text-xs text-muted">{c.email ?? "no email"} · {c.emailStatus}{c.linkedin && <> · <a href={c.linkedin} target="_blank" className="underline">LinkedIn</a></>} · {c.source}</div>
                {!!c.previousCompanies?.length && <div className="text-xs text-muted">Previously: {c.previousCompanies.join(", ")}</div>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{l.enriched === "blocked" ? "Enrichment blocked: out of Flexprice credits." : "Not enriched yet."}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button disabled={!!busy} onClick={() => act("enrich", { action: "enrich", leadId: l.id })} className="rounded-full border border-line px-3 py-1.5 text-sm disabled:opacity-40">{busy === "enrich" ? "Enriching…" : l.enriched === "done" ? "Re-enrich ($0.50)" : "Enrich ($0.50)"}</button>
        <button disabled={!!busy} onClick={() => act("draft", { action: "draft", leadId: l.id })} className="rounded-full bg-ink px-3 py-1.5 text-sm text-white disabled:opacity-40">{busy === "draft" ? "Drafting…" : l.sequence?.length ? "Redraft sequence" : "Draft outreach"}</button>
      </div>
      {!!l.history?.length && (
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Audit trail</div>
          <ol className="space-y-1 text-xs">
            {l.history.map((h, i) => (
              <li key={i} className="flex gap-2"><span className="font-mono text-muted">{new Date(h.at).toLocaleTimeString()}</span><ActorTag a={h.actor} who={h.who} /><span>→ {h.stage}{h.note ? ` (${h.note})` : ""}</span></li>
            ))}
          </ol>
        </div>
      )}
    </aside>
  );
}
function ActorTag({ a, who }: { a: string; who: string }) {
  return <span className={`rounded px-1.5 text-[10px] font-semibold uppercase ${a === "agent" ? "bg-sky-100 text-sky-800" : "bg-amber-100 text-amber-800"}`}>{a === "agent" ? `AI · ${who}` : `Rep · ${who}`}</span>;
}

/* ---------------- Approvals (HITL) ---------------- */
function ApprovalsTab({ leads, busy, act }: { leads: Lead[]; busy: string | null; act: (l: string, b: Record<string, unknown>) => Promise<void> }) {
  const items = leads.flatMap((l) => (l.sequence ?? []).map((m) => ({ l, m })));
  const pending = items.filter((x) => x.m.approval === "pending");
  const done = items.filter((x) => x.m.approval !== "pending").sort((a, b) => (b.m.decidedAt ?? "").localeCompare(a.m.decidedAt ?? ""));
  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Approval queue</h2>
        <span className="text-sm text-muted">Nothing is sent until you approve it. Each approved message is metered in Flexprice ($0.25).</span>
      </div>
      {!pending.length && <div className="card p-8 text-center text-sm text-muted">Queue is empty. Open a lead and press “Draft outreach”, or ask Arjun in the team room.</div>}
      <div className="grid gap-4 lg:grid-cols-2">
        {pending.map(({ l, m }) => <TouchCard key={m.id} l={l} m={m} busy={busy} act={act} />)}
      </div>
      {!!done.length && (
        <div className="card overflow-x-auto p-4">
          <h3 className="mb-2 text-sm font-semibold">Decided</h3>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-line">
              {done.map(({ l, m }) => (
                <tr key={m.id}>
                  <td className="py-1.5 pr-2 font-medium">{l.company}</td>
                  <td className="pr-2 text-xs">step {m.step} · {m.channel} · v{m.variant}</td>
                  <td className="pr-2 text-xs text-muted">{m.subject ?? m.body.slice(0, 60)}</td>
                  <td className={`pr-2 text-xs font-medium ${m.approval === "approved" ? "text-emerald-700" : "text-rose-600"}`}>{m.approval}{m.edited ? " (edited)" : ""}</td>
                  <td className="font-mono text-xs text-muted">{ago(m.decidedAt)} ago</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
function TouchCard({ l, m, busy, act }: { l: Lead; m: Touch; busy: string | null; act: (l: string, b: Record<string, unknown>) => Promise<void> }) {
  const [subject, setSubject] = useState(m.subject ?? "");
  const [body, setBody] = useState(m.body);
  const dirty = subject !== (m.subject ?? "") || body !== m.body;
  return (
    <div className="card rise p-4">
      <div className="mb-2 flex items-center gap-2 text-xs">
        <span className="rounded bg-ink px-1.5 py-0.5 font-semibold uppercase text-white">{m.channel}</span>
        <span className="text-muted">Step {m.step} · day {m.dayOffset} · variant {m.variant}</span>
        <ActorTag a="agent" who={m.draftedBy} />
        <span className="ml-auto font-medium">{l.company}</span>
      </div>
      <div className="mb-2 text-xs text-muted">To: <span className="font-mono">{m.to ?? "no verified contact"}</span>{l.tier && <> · Tier {l.tier} ({l.score})</>}</div>
      {m.channel === "email" && <input value={subject} onChange={(e) => setSubject(e.target.value)} className="mb-2 w-full rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-medium outline-none focus:border-ink" />}
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={m.channel === "linkedin" ? 5 : 10} className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm leading-relaxed outline-none focus:border-ink" />
      {!!m.citations?.length && <div className="mt-1 text-[11px] text-muted">Grounded in: {m.citations.map((c) => <a key={c} href={c} target="_blank" className="mr-2 underline">{host(c)}</a>)}</div>}
      <div className="mt-3 flex gap-2">
        <button disabled={!!busy} onClick={async () => { if (dirty) await act("edit", { action: "touch", leadId: l.id, touchId: m.id, decision: "edit", edit: { subject, body } }); await act("approve", { action: "touch", leadId: l.id, touchId: m.id, decision: "approve" }); }} className="rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40">{dirty ? "Save & approve" : "Approve & send"}</button>
        {dirty && <button disabled={!!busy} onClick={() => act("edit", { action: "touch", leadId: l.id, touchId: m.id, decision: "edit", edit: { subject, body } })} className="rounded-full border border-line px-4 py-1.5 text-sm">Save edit</button>}
        <button disabled={!!busy} onClick={() => act("reject", { action: "touch", leadId: l.id, touchId: m.id, decision: "reject" })} className="rounded-full border border-rose-200 px-4 py-1.5 text-sm text-rose-600">Reject</button>
      </div>
    </div>
  );
}

/* ---------------- Pipeline (Kanban) ---------------- */
function PipelineTab({ leads, act, open }: { leads: Lead[]; act: (l: string, b: Record<string, unknown>) => Promise<void>; open: (id: string) => void }) {
  const [drag, setDrag] = useState<string | null>(null);
  return (
    <div className="grid gap-3 overflow-x-auto pb-4" style={{ gridTemplateColumns: `repeat(${STAGES.length}, minmax(150px, 1fr))` }}>
      {STAGES.map((s) => {
        const col = leads.filter((l) => stageOf(l) === s.key);
        return (
          <div key={s.key} onDragOver={(e) => e.preventDefault()} onDrop={() => drag && void act("stage", { action: "stage", leadId: drag, stage: s.key })} className="min-h-[60vh] rounded-2xl border border-line bg-white/50 p-2">
            <div className="mb-2 flex items-center justify-between px-1 text-sm"><b>{s.label}</b><span className="text-muted">{col.length}</span></div>
            <div className="space-y-2">
              {col.map((l) => {
                const last = l.history?.[l.history.length - 1];
                return (
                  <div key={l.id} draggable onDragStart={() => setDrag(l.id)} onClick={() => open(l.id)} className="cursor-grab rounded-xl border border-line bg-white p-2.5 shadow-sm hover:border-ink">
                    <div className="flex items-center justify-between"><span className="text-sm font-medium">{l.company}</span><TierBadge tier={l.tier} score={l.score} /></div>
                    <div className="mt-1 line-clamp-2 text-xs text-muted">{l.signals?.[0]?.text ?? l.why}</div>
                    {last && <div className="mt-1.5 flex items-center gap-1 text-[10px]"><ActorTag a={last.actor} who={last.who} /><span className="text-muted">{ago(last.at)} ago</span></div>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Analytics ---------------- */
function AnalyticsTab({ a, b }: { a: Analytics; b: Billing }) {
  const max = Math.max(1, ...a.funnel.map((f) => f.count));
  const spent = Object.keys(b.counts).reduce((s, k) => s + b.counts[k] * (b.prices[k] ?? 0), 0);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="card p-5">
        <h3 className="mb-3 font-semibold">Funnel</h3>
        {a.funnel.map((f, i) => (
          <div key={f.stage} className="mb-2">
            <div className="flex justify-between text-sm"><span>{STAGES.find((s) => s.key === f.stage)?.label}</span><span className="font-mono tabular-nums">{f.count}{i > 0 && <span className="ml-2 text-muted">{a.conv[i - 1].rate}%</span>}</span></div>
            <div className="mt-1 h-2 rounded-full bg-line"><div className="h-full rounded-full bg-ink" style={{ width: `${(100 * f.count) / max}%` }} /></div>
          </div>
        ))}
      </div>
      <div className="card p-5">
        <h3 className="mb-3 font-semibold">Who did the work</h3>
        <div className="flex items-end gap-6">
          <div><div className="font-mono text-3xl font-semibold">{a.attribution.agent}</div><div className="text-sm text-muted">AI agent actions</div></div>
          <div><div className="font-mono text-3xl font-semibold">{a.attribution.rep}</div><div className="text-sm text-muted">Rep actions</div></div>
          <div><div className="font-mono text-3xl font-semibold">{a.pendingApprovals}</div><div className="text-sm text-muted">Waiting for approval</div></div>
        </div>
        <h3 className="mb-2 mt-5 font-semibold">Usage billed (Flexprice)</h3>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-line">
            {Object.keys(b.counts).map((k) => (
              <tr key={k}><td className="py-1">{b.labels[k]}</td><td className="font-mono tabular-nums">{b.counts[k]}</td><td className="text-right font-mono text-muted">${(b.counts[k] * b.prices[k]).toFixed(2)}</td></tr>
            ))}
            <tr><td className="py-1 font-medium">Since server start</td><td /><td className="text-right font-mono font-medium">${spent.toFixed(2)}</td></tr>
          </tbody>
        </table>
      </div>
      <Seg title="By industry" rows={a.byIndustry} />
      <Seg title="By tier" rows={a.byTier} />
      <div className="card p-5 lg:col-span-2">
        <h3 className="mb-2 font-semibold">Split test: message variants</h3>
        <p className="mb-3 text-sm text-muted">Variant A asks for a 15-minute call, variant B offers a 2-minute teardown video.</p>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted"><tr><th className="pb-1">Variant</th><th>Channel</th><th>Drafted</th><th>Approved</th><th>Replied</th><th>Reply rate</th></tr></thead>
          <tbody className="divide-y divide-line">
            {a.variants.map((v) => (
              <tr key={v.variant + v.channel}><td className="py-1.5 font-medium">{v.variant}</td><td>{v.channel}</td><td className="font-mono">{v.drafted}</td><td className="font-mono">{v.approved}</td><td className="font-mono">{v.replied}</td><td className="font-mono">{v.approved ? Math.round((100 * v.replied) / v.approved) : 0}%</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function Seg({ title, rows }: { title: string; rows: Analytics["byTier"] }) {
  return (
    <div className="card p-5">
      <h3 className="mb-2 font-semibold">{title}</h3>
      <table className="w-full text-sm [&_td]:pr-3 [&_th]:pr-3">
        <thead className="text-left text-xs uppercase text-muted"><tr><th className="pb-1">Segment</th><th>Leads</th><th>Contacted</th><th>Replied</th><th>Contact rate</th></tr></thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.key}><td className="py-1.5">{r.key}</td><td className="font-mono">{r.leads}</td><td className="font-mono">{r.contacted}</td><td className="font-mono">{r.replied}</td><td className="font-mono">{r.leads ? Math.round((100 * r.contacted) / r.leads) : 0}%</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Graph ---------------- */
const NODE_COLOR: Record<string, string> = { Product: "#16140f", Company: "#ff4a1c", Customer: "#0f766e", Person: "#2563eb", Competitor: "#7c3aed", Signal: "#d97706" };
function GraphTab({ g, reload, setSel }: { g: Graph | null; reload: () => void; setSel: (id: string) => void }) {
  const layout = useMemo(() => {
    if (!g) return null;
    const W = 900, H = 640, cx = W / 2, cy = H / 2;
    const pos = new Map<string, { x: number; y: number }>();
    const ring = (types: string[], r: number) => {
      const ns = g.nodes.filter((n) => types.includes(n.type));
      ns.forEach((n, i) => pos.set(n.id, { x: cx + r * Math.cos((2 * Math.PI * i) / Math.max(1, ns.length) - Math.PI / 2), y: cy + r * Math.sin((2 * Math.PI * i) / Math.max(1, ns.length) - Math.PI / 2) }));
    };
    g.nodes.filter((n) => n.type === "Product").forEach((n) => pos.set(n.id, { x: cx, y: cy }));
    ring(["Competitor", "Customer"], 120);
    ring(["Company"], 220);
    // People and signals sit just outside their company.
    for (const n of g.nodes.filter((x) => x.type === "Person" || x.type === "Signal")) {
      const e = g.edges.find((x) => x.from === n.id && x.rel === "works_at") ?? g.edges.find((x) => x.to === n.id && x.rel === "has_signal");
      const co = e ? pos.get(e.rel === "works_at" ? e.to : e.from) : undefined;
      const sib = g.edges.filter((x) => (e?.rel === "works_at" ? x.to === e.to && x.rel === "works_at" : x.from === e?.from && x.rel === "has_signal")).map((x) => (x.rel === "works_at" ? x.from : x.to));
      const k = sib.indexOf(n.id);
      if (!co) { const h = [...n.id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 997, 7); pos.set(n.id, { x: cx + ((h % 100) / 100 - 0.5) * 600, y: cy + (((h * 7) % 100) / 100 - 0.5) * 500 }); continue; }
      const ang = Math.atan2(co.y - cy, co.x - cx) + (k - (sib.length - 1) / 2) * 0.22 + (n.type === "Signal" ? 0.11 : 0);
      const r = Math.hypot(co.x - cx, co.y - cy) + (n.type === "Person" ? 70 : 105);
      pos.set(n.id, { x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) });
    }
    return { W, H, pos };
  }, [g]);
  if (!g || !layout) return <div className="card p-10 text-center text-sm text-muted">Building the graph…</div>;
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <div className="card overflow-hidden p-3">
        <div className="flex items-center justify-between px-2 text-xs text-muted">
          <span>{g.nodes.length} nodes · {g.edges.length} edges · queried in <b className="font-mono text-ink">{g.ms} ms</b> (metered as graph_query)</span>
          <button onClick={reload} className="rounded-full border border-line px-3 py-1 text-ink">Re-run queries</button>
        </div>
        <svg viewBox={`0 0 ${layout.W} ${layout.H}`} className="h-[640px] w-full">
          {g.edges.map((e, i) => {
            const a = layout.pos.get(e.from), b = layout.pos.get(e.to);
            if (!a || !b) return null;
            const warm = e.rel === "previously_employed_at" || e.rel === "lookalike_of";
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={warm ? "#0f766e" : e.rel === "competes_with" ? "#7c3aed" : "#d6cfc3"} strokeWidth={warm ? 2 : 1} strokeDasharray={e.rel === "has_signal" ? "3 3" : undefined}><title>{e.rel}</title></line>;
          })}
          {g.nodes.map((n) => {
            const p = layout.pos.get(n.id)!;
            const r = n.type === "Product" ? 16 : n.type === "Company" ? 9 : 6;
            return (
              <g key={n.id} transform={`translate(${p.x},${p.y})`} className={n.type === "Company" ? "cursor-pointer" : ""}>
                <circle r={r} fill={NODE_COLOR[n.type]} opacity={n.type === "Signal" ? 0.7 : 1}><title>{`${n.type}: ${n.label}`}</title></circle>
                {(n.type !== "Signal" && n.type !== "Person") && <text y={r + 12} textAnchor="middle" fontSize={n.type === "Product" ? 13 : 10} fontWeight={n.type === "Product" ? 600 : 400} fill="#16140f">{n.label.slice(0, 22)}</text>}
              </g>
            );
          })}
        </svg>
        <div className="flex flex-wrap gap-3 px-2 text-xs">
          {Object.entries(NODE_COLOR).map(([k, c]) => <span key={k} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />{k}</span>)}
          <span className="text-muted">edges: works_at · competes_with · matched_to · contacted_via · replied_to · previously_employed_at · has_signal · lookalike_of</span>
        </div>
      </div>
      <div className="space-y-4">
        <div className="card p-4">
          <h3 className="mb-2 font-semibold">Warm intro paths</h3>
          {g.warm.length ? (
            <ul className="space-y-2 text-sm">
              {g.warm.map((w) => (
                <li key={w.leadId} className="cursor-pointer rounded-lg border border-line p-2 hover:border-ink" onClick={() => setSel(w.leadId)}>
                  <div className="font-medium">{w.company}</div>
                  <div className="text-xs text-muted">{w.hops.join(" → ")}</div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No multi-hop paths yet. Add reference customers in the intake and enrich more leads; shared employers and Moss lookalikes create paths.</p>
          )}
        </div>
        <div className="card p-4">
          <h3 className="mb-2 font-semibold">Lookalikes of your customers</h3>
          <p className="mb-2 text-xs text-muted">Moss semantic match between each reference customer and the leads we hold.</p>
          {g.lookalikes?.length ? g.lookalikes.map((x) => <p key={x.customer + x.leadId} className="cursor-pointer text-sm" onClick={() => setSel(x.leadId)}><b>{x.company}</b> reads like {x.customer} <span className="font-mono text-xs text-muted">{x.score}</span></p>) : <p className="text-sm text-muted">No strong matches yet.</p>}
        </div>
        <div className="card p-4">
          <h3 className="mb-2 font-semibold">Competitor displacement</h3>
          {g.displacement.length ? g.displacement.map((x, i) => <p key={i} className="text-sm"><b>{x.company}</b> uses {x.competitor}: <span className="text-muted">{x.signal}</span></p>) : <p className="text-sm text-muted">No lead signals mention a mapped competitor yet.</p>}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Agent thinking feed ---------------- */
const KIND_ICON: Record<string, string> = { think: "◇", search: "⌕", graph: "◎", enrich: "＋", draft: "✎", approve: "✓", reject: "✕", stage: "→", billing: "$", icp: "◆", discover: "◉" };
function Feed({ items, close }: { items: Activity[]; close: () => void }) {
  return (
    <aside className="card h-fit max-h-[calc(100vh-140px)] overflow-y-auto p-4 lg:sticky lg:top-32">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />Agent thinking</h3>
        <button onClick={close} className="text-xs text-muted hover:text-ink">collapse</button>
      </div>
      {!items.length && <p className="text-sm text-muted">Agent steps, searches, graph queries and approvals show up here live.</p>}
      <ol className="space-y-2">
        {items.slice(0, 80).map((a) => (
          <li key={a.id} className="text-[13px] leading-snug">
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className="w-3 text-center text-muted">{KIND_ICON[a.kind] ?? "·"}</span>
              <ActorTag a={a.actor} who={a.who} />
              <span className="ml-auto font-mono text-muted">{ago(a.at)}{a.ms !== undefined ? ` · ${a.ms}ms` : ""}</span>
            </div>
            <p className={`ml-4.5 mt-0.5 ${a.kind === "billing" ? "text-rose-600" : ""}`}>{a.text}</p>
          </li>
        ))}
      </ol>
    </aside>
  );
}
