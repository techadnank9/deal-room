"use client";
// The agent: header (status, limits, start/pause) + tabs Overview · Review · Leads · Sources · Campaign · Activity · Settings.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PersonaCards from "@/components/app/PersonaCards";
import { BlocklistCard, CampaignForm, ImportCsv, TargetingCard } from "@/components/app/AgentSettings";
import { ago, Btn, EmailBadge, Empty, Flames, host, inTime, leadState, Pill, post, topContact, usePoll, type AgentInfo, type Gtm, type WorkspaceInfo } from "@/components/app/ui";
import FitButtons from "@/components/app/FitButtons";
import PreviewLeads from "@/components/app/PreviewLeads";
import type { Lead } from "@/lib/agents/team";
import type { Persona, Touch } from "@/lib/gtm/types";

const TABS = ["overview", "review", "leads", "sources", "campaign", "activity", "settings"] as const;
type Tab = (typeof TABS)[number];
type Box = { id: string; email: string; fromName: string; dailyCap: number; warmupStart?: string; status: string };

/** First phrase of a long ICP value, for chips. */
function short(x: string) {
  const v = x.split(/;| — | - |\. /)[0].trim();
  return v.length > 60 ? `${v.slice(0, 57)}…` : v;
}

/** New mailboxes send fewer emails for their first 14 days. */
function isRamping(start?: string) {
  return Boolean(start) && Date.now() - new Date(start!).getTime() < 14 * 864e5;
}

export default function AgentPage() {
  const [tab, setTab] = useState<Tab>("overview");
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- open the tab named in the URL
    if (t && TABS.includes(t)) setTab(t);
  }, []);
  const go = (t: Tab) => {
    setTab(t);
    window.history.replaceState(null, "", `/app/agent?tab=${t}`);
  };
  const { data: gtm, reload } = usePoll<Gtm>("/api/gtm", 6000);
  const { data: me, reload: reloadMe } = usePoll<WorkspaceInfo>("/api/workspace", 20000);
  const { data: agent, reload: reloadAgent } = usePoll<AgentInfo>("/api/agent", 10000);
  const { data: boxes } = usePoll<{ mailboxes: Box[] }>("/api/mailboxes", 30000);
  const [busy, setBusy] = useState<string | null>(null);

  if (!gtm || !me) return <p className="p-10 text-muted">Loading your agent…</p>;
  const t = gtm.state;
  const leads = [...t.leads].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  const review = leads.filter((l) => leadState(l) === "review");
  const ws = me.workspace;
  const box = boxes?.mailboxes[0];
  const ramping = isRamping(box?.warmupStart);
  const active = ws.settings.active;
  const nextLaunch = agent?.status.inWindow ? "now (sending window open)" : inTime(agent?.status.nextWindow);

  async function act(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    try {
      await fn();
      await Promise.all([reload(), reloadMe(), reloadAgent()]);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <header className="border-b border-line bg-white px-4 pt-5 md:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold tracking-tight">{t.company ?? ws.url} · Outbound agent</h1>
              {active ? <Pill tone="green">● Active</Pill> : <Pill tone="amber">Paused</Pill>}
              {ws.settings.autopilot ? <Pill tone="ink">Autopilot</Pill> : <Pill>Review mode</Pill>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="rounded-lg border border-line px-2 py-1">⌖ {ws.settings.dailyLeadTarget} new leads/day</span>
              <span className="rounded-lg border border-line px-2 py-1">✉ {box ? `${box.dailyCap} emails/day` : "no mailbox"}</span>
              {box ? (
                <span className="rounded-lg border border-line px-2 py-1">
                  {box.email} {ramping && <span className="ml-1 text-accent">● Ramping up</span>}
                  {box.status === "error" && <span className="ml-1 text-rose-600">● Can&apos;t read inbox</span>}
                </span>
              ) : (
                <Link href="/app/settings" className="rounded-lg border border-dashed border-accent px-2 py-1 text-accent">Connect a mailbox to send</Link>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex gap-2">
              <Link href="/team" className={Btn.ghost}>✦ Talk to your team</Link>
              {active ? (
                <button className={Btn.primary} disabled={!!busy} onClick={() => act("pause", () => post("/api/agent", { action: "pause" }))}>❚❚ Pause outreach</button>
              ) : (
                <button className={Btn.primary} disabled={!!busy} onClick={() => act("launch", () => post("/api/agent", { action: "launch" }))}>▶ Start outreach</button>
              )}
            </div>
            <span className="text-xs text-muted">{active ? `Next launch ${nextLaunch}` : "Agent is paused"}</span>
          </div>
        </div>
        <nav className="mt-4 flex gap-1 overflow-x-auto">
          {TABS.map((k) => {
            const n = k === "review" ? review.length : k === "leads" ? leads.length : null;
            return (
              <button key={k} onClick={() => go(k)} className={`flex items-center gap-1.5 border-b-2 px-3 pb-3 text-sm capitalize ${tab === k ? "border-ink font-medium" : "border-transparent text-muted hover:text-ink"}`}>
                {k}
                {n !== null && <span className={`rounded-md px-1.5 text-xs ${k === "review" && n ? "bg-accent text-white" : "bg-paper text-muted"}`}>{n}</span>}
              </button>
            );
          })}
        </nav>
      </header>
      <main className="px-4 py-6 md:px-8">
        {tab === "overview" && <Overview gtm={gtm} agent={agent} leads={leads} review={review.length} go={go} busy={busy} runNow={() => act("run", () => post("/api/agent", { action: "run_now" }))} />}
        {tab === "review" && <Review leads={review} reload={reload} />}
        {tab === "leads" && <Leads leads={leads} agent={agent} reload={reload} />}
        {tab === "sources" && <Sources gtm={gtm} me={me} agent={agent} busy={busy} act={act} reload={reload} />}
        {tab === "campaign" && <Campaign leads={leads} autopilot={ws.settings.autopilot} t={t} reload={reload} />}
        {tab === "activity" && <Activity gtm={gtm} agent={agent} />}
        {tab === "settings" && (
          <div className="card max-w-xl p-6 text-sm">
            <p>Mailboxes, sending schedule, daily limits, review mode and plan live in Settings.</p>
            <Link href="/app/settings" className={`${Btn.dark} mt-4`}>Open settings</Link>
          </div>
        )}
      </main>
    </div>
  );
}

/* ---------------- Overview ---------------- */

function Overview({ gtm, agent, leads, review, go, busy, runNow }: { gtm: Gtm; agent: AgentInfo | null; leads: Lead[]; review: number; go: (t: Tab) => void; busy: string | null; runNow: () => void }) {
  const sent = leads.filter((l) => l.sequence?.some((m) => m.sentAt)).length;
  const replied = leads.filter((l) => ["replied", "meeting", "won"].includes(l.stage ?? "")).length;
  const queued = agent?.outbox.filter((o) => o.status === "queued") ?? [];
  const kpis: [string, number | string, string][] = [
    ["Leads found", leads.length, "leads"],
    ["Waiting for review", review, "review"],
    ["Contacted", sent, "leads"],
    ["Replied", replied, "leads"],
    ["Reply rate", sent ? `${Math.round((100 * replied) / sent)}%` : "–", "leads"],
  ];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {kpis.map(([k, v, t]) => (
          <button key={k} onClick={() => go(t as Tab)} className="card p-4 text-left hover:ring-1 hover:ring-ink/20">
            <p className="text-xs text-muted">{k}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{v}</p>
          </button>
        ))}
      </div>
      {review > 0 && (
        <div className="flex items-center justify-between rounded-2xl bg-accent/10 px-5 py-4">
          <p className="text-sm"><b>{review} lead{review === 1 ? "" : "s"}</b> have emails ready. Nothing is sent until you approve them.</p>
          <button className={Btn.primary} onClick={() => go("review")}>Review now</button>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">What the agent did</h2>
            <button className={Btn.ghost} disabled={!!busy} onClick={runNow}>{busy === "run" ? "Searching…" : "Run a search now"}</button>
          </div>
          {agent?.status.log.length ? (
            <ol className="space-y-3 text-sm">
              {agent.status.log.slice(0, 8).map((x, i) => (
                <li key={i} className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  <span className="flex-1">{x.text}</span>
                  <span className="shrink-0 text-xs text-muted">{ago(x.at)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted">The agent searches up to 3 times a day during your sending hours. Press “Run a search now” to see it work.</p>
          )}
        </section>
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Coming up</h2>
          {queued.length ? (
            <ul className="divide-y divide-line text-sm">
              {queued.slice(0, 8).map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="truncate">
                    {o.subject ?? "(no subject)"} <span className="text-muted">→ {o.to_email}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">{inTime(o.scheduled_at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No emails scheduled yet. Approved emails get a send time inside your sending window.</p>
          )}
          <p className="mt-4 text-xs text-muted">{gtm.moss === "moss" ? "Memory: Moss (instant recall)" : "Memory: local"} · Credits: ${gtm.billing.balance.toFixed(2)}</p>
        </section>
      </div>
    </div>
  );
}

/* ---------------- Review ---------------- */

const REJECT = ["Wrong company type", "Wrong size or location", "Wrong person or title", "Already a customer or known", "Bad email", "Signal not relevant"];

function Review({ leads, reload }: { leads: Lead[]; reload: () => Promise<void> }) {
  const [sel, setSel] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, { subject?: string; body?: string }>>({});
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  async function bulk(decision: "approve" | "reject") {
    setBusy(true);
    await post("/api/gtm", { action: "bulk", leadIds: picked, decision });
    setPicked([]);
    await reload();
    setBusy(false);
  }
  const l = leads.find((x) => x.id === sel) ?? leads[0];
  if (!l) return <Empty title="Nothing to review">When the agent writes emails, they wait here for your approval. Switch on Autopilot in Settings to skip this step.</Empty>;
  const c = topContact(l);
  const touches = (l.sequence ?? []).filter((m) => m.approval === "pending");
  const next = () => {
    const i = leads.findIndex((x) => x.id === l.id);
    setSel(leads[i + 1]?.id ?? leads[i - 1]?.id ?? null);
    setWhy(null);
  };
  async function decide(approve: boolean, reason?: string) {
    setBusy(true);
    // Every decision teaches the agent: approved = a good fit, rejected = not a fit, for this reason.
    if (!approve || !l.feedback) await post("/api/gtm", { action: "fit", leadId: l.id, fit: approve ? "good" : "bad", reason }).catch(() => {});
    for (const m of touches) {
      const e = edits[m.id];
      if (approve && e) await post("/api/gtm", { action: "touch", leadId: l.id, touchId: m.id, decision: "edit", edit: e });
      if (m.channel === "linkedin" && approve) continue; // LinkedIn notes are copied by hand for now
      await post("/api/gtm", { action: "touch", leadId: l.id, touchId: m.id, decision: approve ? "approve" : "reject" });
    }
    if (!approve) await post("/api/gtm", { action: "stage", leadId: l.id, stage: "lost" });
    next();
    await reload();
    setBusy(false);
  }
  return (
    <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
      <aside className="card h-fit overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 text-xs text-muted">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="accent-[#ff4a1c]" checked={picked.length === leads.length && leads.length > 0} onChange={(e) => setPicked(e.target.checked ? leads.map((x) => x.id) : [])} />
            {picked.length ? `${picked.length} selected` : `${leads.length} waiting`}
          </label>
          {picked.length > 0 && (
            <span className="flex gap-1.5">
              <button className="rounded-lg bg-accent px-2 py-1 font-medium text-white" disabled={busy} onClick={() => bulk("approve")}>Approve</button>
              <button className="rounded-lg border border-line px-2 py-1" disabled={busy} onClick={() => bulk("reject")}>Reject</button>
            </span>
          )}
        </div>
        <ul className="max-h-[70vh] divide-y divide-line overflow-y-auto">
          {leads.map((x) => (
            <li key={x.id}>
              <button onClick={() => setSel(x.id)} className={`flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm ${x.id === l.id ? "bg-paper" : "hover:bg-paper/60"}`}>
                <input
                  type="checkbox"
                  className="accent-[#ff4a1c]"
                  aria-label={`Select ${x.company}`}
                  checked={picked.includes(x.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setPicked(e.target.checked ? [...picked, x.id] : picked.filter((y) => y !== x.id))}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{topContact(x)?.name ?? x.company}</span>
                  <span className="block truncate text-xs text-muted">{x.company}</span>
                </span>
                <Flames score={x.score} />
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section className="space-y-4">
        <div className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-lg font-semibold">{c?.name ?? "No contact found yet"} {c?.persona && <Pill tone="accent">{c.persona}</Pill>}</p>
              <p className="text-sm text-muted">
                {c?.title} · <b className="font-medium text-ink">{l.company}</b> · {l.domain}
                {l.size ? ` · ${l.size} people` : ""}
              </p>
              <p className="mt-1 flex items-center gap-2 text-sm">
                {c?.email ?? "no email"} <EmailBadge status={c?.emailStatus} />
                {c?.linkedin && <a href={c.linkedin} target="_blank" rel="noreferrer" className="text-xs underline">LinkedIn</a>}
              </p>
            </div>
            <Flames score={l.score} />
          </div>
          <div className="mt-4 rounded-xl bg-paper p-3 text-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Why now</p>
            {(l.signals?.length ? l.signals : [{ kind: "other", text: l.why, sourceUrl: l.sourceUrl }]).slice(0, 3).map((s, i) => (
              <p key={i} className="mt-1">
                {s.text}{" "}
                {s.sourceUrl && <a href={s.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-muted underline">{host(s.sourceUrl)}</a>}
              </p>
            ))}
          </div>
        </div>
        {touches.map((m) => (
          <TouchEditor key={m.id} m={m} leadId={l.id} value={edits[m.id]} onChange={(v) => setEdits({ ...edits, [m.id]: v })} />
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <button className={Btn.primary} disabled={busy || !c?.email} onClick={() => decide(true)}>✓ Approve{touches.length > 1 ? " sequence" : ""}</button>
          {why === null ? (
            <button className={Btn.ghost} disabled={busy} onClick={() => setWhy("")}>Reject</button>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {REJECT.map((r) => (
                <button key={r} className="rounded-full border border-line bg-white px-3 py-1.5 text-xs hover:border-rose-400" disabled={busy} onClick={() => decide(false, r)}>{r}</button>
              ))}
            </div>
          )}
          {!c?.email && <span className="text-xs text-rose-600">No email for this person yet, so it can&apos;t be sent.</span>}
        </div>
      </section>
    </div>
  );
}

const REFINE = ["Shorter", "Softer ask", "More direct", "More casual"];

function TouchEditor({ m, leadId, value, onChange }: { m: Touch; leadId: string; value?: { subject?: string; body?: string }; onChange: (v: { subject?: string; body?: string }) => void }) {
  const [ask, setAsk] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function refine(instruction: string) {
    if (!instruction.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await post<{ draft: { subject: string; body: string } }>("/api/gtm", { action: "refine", leadId, touchId: m.id, instruction, edit: { subject: value?.subject ?? m.subject, body: value?.body ?? m.body } });
      onChange({ subject: r.draft.subject || undefined, body: r.draft.body });
      setAsk("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not rewrite it");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="card p-5">
      <div className="mb-2 flex items-center gap-2 text-xs text-muted">
        <Pill tone={m.channel === "email" ? "ink" : "line"}>{m.channel === "email" ? "Email" : "LinkedIn note"}</Pill>
        Step {m.step} · {m.dayOffset === 0 ? "sent first" : `${m.dayOffset} day${m.dayOffset === 1 ? "" : "s"} later${m.channel === "email" && m.step > 1 ? ", same thread, only if no reply" : ""}`}
        {m.channel === "linkedin" && " · copy and send by hand"}
      </div>
      {m.channel === "email" && (
        <input value={value?.subject ?? m.subject ?? ""} onChange={(e) => onChange({ ...value, subject: e.target.value })} className="mb-2 w-full rounded-lg border border-line px-3 py-2 text-sm font-medium outline-none focus:border-ink" aria-label="Subject" />
      )}
      <textarea value={value?.body ?? m.body} onChange={(e) => onChange({ ...value, body: e.target.value })} rows={m.channel === "email" ? 12 : 4} className="w-full rounded-lg border border-line px-3 py-2 text-sm leading-relaxed outline-none focus:border-ink" aria-label="Message" />
      <form
        className="mt-2 flex flex-wrap items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void refine(ask);
        }}
      >
        <span className="text-xs text-muted">Refine with AI:</span>
        {REFINE.map((r) => (
          <button key={r} type="button" disabled={busy} onClick={() => void refine(r)} className="rounded-full border border-line bg-white px-2.5 py-1 text-xs hover:border-ink disabled:opacity-50">
            {r}
          </button>
        ))}
        <input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="or say what to change…" aria-label="What to change" className="min-w-[160px] flex-1 rounded-lg border border-line px-2.5 py-1 text-xs outline-none focus:border-ink" />
        <button className="rounded-lg bg-ink px-2.5 py-1 text-xs text-white disabled:opacity-50" disabled={busy || !ask.trim()}>
          {busy ? "Rewriting…" : "Rewrite"}
        </button>
        {err && <span className="text-xs text-rose-600">{err}</span>}
      </form>
      {value && <p className="mt-1 text-[11px] text-muted">Edited. Your changes are saved when you approve.</p>}
    </div>
  );
}

/* ---------------- Leads ---------------- */

const FILTERS = [
  ["all", "All"],
  ["review", "Review"],
  ["scheduled", "Scheduled"],
  ["in_sequence", "In sequence"],
  ["replied", "Replied"],
] as const;
const STATUS_LABEL: Record<string, [string, "line" | "green" | "amber" | "red" | "accent" | "ink"]> = {
  review: ["Review", "accent"],
  scheduled: ["Scheduled", "amber"],
  in_sequence: ["In sequence", "ink"],
  replied: ["Replied", "green"],
  new: ["Writing email", "line"],
  no_contact: ["No contact yet", "line"],
  closed: ["Closed", "red"],
};

function Leads({ leads, agent, reload }: { leads: Lead[]; agent: AgentInfo | null; reload: () => Promise<void> }) {
  const [f, setF] = useState<(typeof FILTERS)[number][0]>("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(
    () => leads.filter((l) => (f === "all" || leadState(l) === f) && (!q || `${l.company} ${topContact(l)?.name ?? ""} ${topContact(l)?.title ?? ""}`.toLowerCase().includes(q.toLowerCase()))),
    [leads, f, q],
  );
  const sel = leads.find((l) => l.id === open);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search leads" className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink sm:w-64" />
        {FILTERS.map(([k, label]) => {
          const n = k === "all" ? leads.length : leads.filter((l) => leadState(l) === k).length;
          return (
            <button key={k} onClick={() => setF(k)} className={`rounded-xl border px-3 py-2 text-sm ${f === k ? "border-accent bg-accent/8 text-accent" : "border-line bg-white"}`}>
              {label} <span className="ml-1 rounded bg-paper px-1.5 text-xs">{n}</span>
            </button>
          );
        })}
      </div>
      <div className="flex justify-end"><ImportCsv reload={reload} /></div>
      {!rows.length ? (
        <Empty title="No leads here yet">The agent adds new leads a few times a day. Press “Run a search now” on the Overview tab to start.</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="border-b border-line text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="font-medium">Company</th>
                <th className="font-medium">Signal</th>
                <th className="font-medium">AI score</th>
                <th className="font-medium">Email</th>
                <th className="pr-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((l) => {
                const c = topContact(l);
                const s = l.signals?.[0];
                const st = leadState(l);
                const [label, tone] = STATUS_LABEL[st === "new" && l.enriched && !c?.email ? "no_contact" : st === "new" && !l.enriched ? "no_contact" : st];
                return (
                  <tr key={l.id} onClick={() => setOpen(l.id)} className="cursor-pointer hover:bg-paper/60">
                    <td className="px-4 py-3">
                      <p className="font-medium">{c?.name ?? "—"}</p>
                      <p className="text-xs text-muted">{c?.title ?? (l.enriched ? "No match for your personas" : "Looking for the right person…")}</p>
                    </td>
                    <td className="pr-3">
                      <p className="font-medium">{l.company}</p>
                      <p className="text-xs text-muted">{l.domain}</p>
                    </td>
                    <td className="max-w-[300px] pr-3">
                      <p className="line-clamp-2">{s?.text ?? l.why}</p>
                      {(l.signals?.length ?? 0) > 1 && <span className="text-xs text-muted">+{(l.signals?.length ?? 1) - 1} signal{(l.signals?.length ?? 1) > 2 ? "s" : ""}</span>}
                    </td>
                    <td><Flames score={l.score} /></td>
                    <td className="pr-3">{c?.email ? <EmailBadge status={c.emailStatus} /> : <span className="text-xs text-muted">—</span>}</td>
                    <td className="pr-4"><Pill tone={tone}>{label}</Pill></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {sel && <LeadDrawer l={sel} agent={agent} close={() => setOpen(null)} reload={reload} />}
    </div>
  );
}

function LeadDrawer({ l, agent, close, reload }: { l: Lead; agent: AgentInfo | null; close: () => void; reload: () => Promise<void> }) {
  const sent = agent?.outbox.filter((o) => o.lead_id === l.id) ?? [];
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-ink/20" onClick={close}>
      <aside className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold">{l.company}</h2>
            <a href={`https://${l.domain}`} target="_blank" rel="noreferrer" className="text-sm text-muted underline">{l.domain}</a>
            <p className="mt-1 text-xs text-muted">{[l.industry, l.hq, l.size && `${l.size} people`, l.funding && `${l.funding} raised`].filter(Boolean).join(" · ")}</p>
          </div>
          <button onClick={close} className="text-muted hover:text-ink" aria-label="Close">✕</button>
        </div>
        <div className="mt-3 flex items-center gap-3"><Flames score={l.score} /><span className="text-xs text-muted">{l.scoreWhy}</span></div>
        <div className="mt-3"><FitButtons leadId={l.id} current={l.feedback} onDone={reload} /></div>
        <h3 className="mt-5 text-xs font-medium uppercase tracking-wide text-muted">Why now</h3>
        <ul className="mt-1 space-y-1.5 text-sm">
          {(l.signals?.length ? l.signals : [{ kind: "other", text: l.why, sourceUrl: l.sourceUrl }]).map((s, i) => (
            <li key={i}>
              {s.text} {s.sourceUrl && <a href={s.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-muted underline">{host(s.sourceUrl)}</a>}
            </li>
          ))}
        </ul>
        <h3 className="mt-5 text-xs font-medium uppercase tracking-wide text-muted">People</h3>
        <ul className="mt-1 space-y-2 text-sm">
          {(l.contacts ?? []).map((c) => (
            <li key={c.id} className="rounded-xl border border-line p-3">
              <p className="font-medium">{c.name} {c.persona && <Pill tone="accent">{c.persona}</Pill>}</p>
              <p className="text-xs text-muted">{c.title}</p>
              <p className="mt-1 flex items-center gap-2 text-xs">{c.email ?? "no email"} <EmailBadge status={c.emailStatus} /> {c.linkedin && <a className="underline" href={c.linkedin} target="_blank" rel="noreferrer">LinkedIn</a>}</p>
            </li>
          ))}
          {!l.contacts?.length && <li className="text-muted">Still looking for the right person.</li>}
        </ul>
        <h3 className="mt-5 text-xs font-medium uppercase tracking-wide text-muted">Outreach</h3>
        <ul className="mt-1 space-y-2 text-sm">
          {(l.sequence ?? []).map((m) => {
            const o = sent.find((x) => x.touch_id === m.id);
            return (
              <li key={m.id} className="rounded-xl bg-paper p-3">
                <p className="text-xs text-muted">
                  Step {m.step} · {m.channel} · {m.sentAt ? `sent ${ago(m.sentAt)}` : o?.status === "queued" ? `scheduled ${inTime(o.scheduled_at)}` : o?.status === "failed" ? `failed: ${o.error}` : m.approval}
                </p>
                {m.subject && <p className="mt-1 font-medium">{m.subject}</p>}
                <p className="mt-1 whitespace-pre-line text-ink/85">{m.body}</p>
              </li>
            );
          })}
          {!l.sequence?.length && <li className="text-muted">No emails written yet.</li>}
        </ul>
        {!!l.history?.length && (
          <>
            <h3 className="mt-5 text-xs font-medium uppercase tracking-wide text-muted">History</h3>
            <ol className="mt-1 space-y-1 text-xs">
              {l.history.map((h, i) => (
                <li key={i}>
                  <span className="text-muted">{new Date(h.at).toLocaleString()}</span> · {h.actor === "agent" ? `AI (${h.who})` : "You"} → {h.stage}
                  {h.note ? ` (${h.note})` : ""}
                </li>
              ))}
            </ol>
          </>
        )}
      </aside>
    </div>
  );
}

/* ---------------- Sources ---------------- */

const SIGNAL_ROWS = [
  { key: "hiring", title: "Hiring surges", text: "Open roles in the team that owns the problem, counted from company job boards", match: (l: Lead) => l.signals?.some((s) => s.kind === "hiring") || /hiring/i.test(l.foundBy) },
  { key: "funding", title: "New funding", text: "SEC Form D filings and funding news", match: (l: Lead) => l.signals?.some((s) => s.kind === "funding") || /form d|news/i.test(l.foundBy) },
  { key: "web", title: "Buying signals on the web", text: "Launches, expansions, leadership changes from live web search", match: (l: Lead) => !l.signals?.some((s) => ["hiring", "funding"].includes(s.kind)) },
  { key: "competitors", title: "Competitor moves", text: "Companies mentioning or leaving tools you compete with", match: () => false },
  { key: "lookalikes", title: "Lookalikes of your customers", text: "Companies that read like the customers on your website", match: () => false },
];

function Sources({ gtm, me, agent, busy, act, reload }: { gtm: Gtm; me: WorkspaceInfo; agent: AgentInfo | null; busy: string | null; act: (l: string, fn: () => Promise<unknown>) => Promise<void>; reload: () => Promise<void> }) {
  const t = gtm.state;
  const [personas, setPersonas] = useState<Persona[] | null>(null);
  const ps = personas ?? t.personas ?? [];
  const s = t.icpSpec;
  const sig = me.workspace.settings.signals;
  return (
    <div className="max-w-[1100px] space-y-8">
      <section>
        <h2 className="mb-3 text-lg font-semibold">Who this agent targets</h2>
        <div className="card divide-y divide-line">
          <div className="p-5">
            <p className="font-medium">Ideal customer profile</p>
            <p className="text-sm text-muted">Every source only adds companies that match this profile.</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {s ? (
                [...s.industries.map((x) => x.name), `${s.companySize.headcount} employees`, ...s.regions.map((x) => x.name)].map(short).map((x) => (
                  <span key={x} className="rounded-full border border-line px-3 py-1 text-xs">{x}</span>
                ))
              ) : (
                <span className="text-sm text-muted">Still being worked out…</span>
              )}
            </div>
            {s && <p className="mt-3 text-sm">{s.summary}</p>}
          </div>
          <div className="p-5">
            <p className="font-medium">Never contact</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[...(s?.negativeSignals ?? []), ...(t.competitors ?? []).filter((c) => c.category === "direct").map((c) => `Competitor: ${c.name}`)].map((x) => (
                <span key={x} className="rounded-full bg-rose-50 px-3 py-1 text-xs text-rose-700">{x}</span>
              ))}
            </div>
          </div>
        </div>
      </section>
      <PreviewLeads onChange={reload} />
      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <TargetingCard t={t} reload={reload} />
        <BlocklistCard />
      </section>
      <section>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold">The people to contact</h2>
            <p className="text-sm text-muted">Inside each company, the agent looks for these personas and finds their verified email.</p>
          </div>
          {personas && <button className={Btn.dark} disabled={!!busy} onClick={() => act("personas", () => post("/api/gtm", { action: "savePersonas", personas, confirm: true }).then(() => setPersonas(null)))}>Save changes</button>}
        </div>
        {ps.length ? <PersonaCards personas={ps} onChange={setPersonas} /> : <Empty title="No personas yet"><button className={Btn.ghost} onClick={() => act("gen", () => post("/api/gtm", { action: "personas" }))}>Suggest personas</button></Empty>}
      </section>
      <section>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold">How this agent finds leads</h2>
            <p className="text-sm text-muted">Up to 3 searches a day in your sending hours, one signal per run, until today&apos;s lead target is met.</p>
          </div>
          <button className={Btn.dark} disabled={!!busy} onClick={() => act("run", () => post("/api/agent", { action: "run_now" }))}>{busy === "run" ? "Searching…" : "Launch now"}</button>
        </div>
        <div className="card divide-y divide-line">
          <div className="grid grid-cols-[1fr_80px_150px_70px] px-5 py-2 text-xs text-muted"><span>Signal</span><span>Leads</span><span>Next run</span><span /></div>
          {SIGNAL_ROWS.map((r) => {
            const on = !!sig[r.key];
            const n = t.leads.filter(r.match).length;
            return (
              <div key={r.key} className="grid grid-cols-[1fr_80px_150px_70px] items-center px-5 py-4 text-sm">
                <span>
                  <b className="font-medium">{r.title}</b>
                  <span className="block text-xs text-muted">{r.text}</span>
                </span>
                <span className="tabular-nums">{n}</span>
                <span className="text-xs text-muted">{!on ? "off" : agent?.status.inWindow ? "today" : inTime(agent?.status.nextWindow) || "next window"}</span>
                <label className="relative inline-flex cursor-pointer items-center justify-end">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={on}
                    onChange={(e) => act("sig", () => post("/api/workspace", { settings: { signals: { ...sig, [r.key]: e.target.checked } } }, "PATCH"))}
                    aria-label={`${r.title} on or off`}
                  />
                  <span className="h-5 w-9 rounded-full bg-line transition peer-checked:bg-accent" />
                  <span className="absolute right-[18px] h-4 w-4 rounded-full bg-white shadow transition peer-checked:right-0.5" />
                </label>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/* ---------------- Campaign ---------------- */

function Campaign({ leads, autopilot, t, reload }: { leads: Lead[]; autopilot: boolean; t: Gtm["state"]; reload: () => Promise<void> }) {
  const sample = leads.find((l) => l.sequence?.length);
  const steps = [
    { day: 0, ch: "Email", title: "First email", text: "Short, personal, names the exact signal and its source. Asks for a 15-minute call (variant A) or offers a 2-minute teardown (variant B)." },
    { day: 1, ch: "LinkedIn", title: "Connection note", text: "Under 280 characters. Shown in Review for you to copy and send yourself." },
    { day: t.campaign?.followUpDays ?? 4, ch: "Email", title: "Follow-up", text: "Same thread, a new angle, under 70 words. Only sent if they haven't replied." },
  ];
  return (
    <div className="grid max-w-[1100px] gap-6 lg:grid-cols-[1fr_380px]">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Sequence</h2>
        {steps.map((s, i) => (
          <div key={i} className="card flex gap-4 p-5">
            <div className="flex flex-col items-center">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-paper text-sm font-semibold">{i + 1}</span>
              {i < steps.length - 1 && <span className="mt-1 w-px flex-1 bg-line" />}
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted">{s.day === 0 ? "Day 0" : `Day ${s.day}`} · {s.ch}</p>
              <p className="font-medium">{s.title}</p>
              <p className="mt-1 text-sm text-ink/80">{s.text}</p>
            </div>
          </div>
        ))}
        <CampaignForm t={t} reload={reload} />
        <div className="card p-5 text-sm">
          <p className="font-medium">Rules the agent always follows</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-ink/80">
            <li>{autopilot ? "Autopilot: emails are approved automatically and sent on schedule." : "Review mode: every email waits for your approval."}</li>
            <li>Sends only in your sending hours, with random gaps, under the mailbox&apos;s daily cap (ramping up for new mailboxes).</li>
            <li>Stops the sequence the moment someone replies, and never emails anyone who unsubscribed or bounced.</li>
            <li>Every email has an unsubscribe link and is signed by you.</li>
          </ul>
        </div>
      </section>
      <aside>
        <h2 className="mb-3 text-lg font-semibold">Example from your leads</h2>
        {sample ? (
          <div className="card space-y-3 p-5 text-sm">
            <p className="text-xs text-muted">To {topContact(sample)?.name ?? sample.company} at {sample.company}</p>
            {sample.sequence!.filter((m) => m.channel === "email").map((m) => (
              <div key={m.id} className="rounded-xl bg-paper p-3">
                <p className="font-medium">{m.subject}</p>
                <p className="mt-1 whitespace-pre-line text-ink/85">{m.body}</p>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="No emails yet">Once the agent finds a lead with a verified email, its sequence shows up here.</Empty>
        )}
      </aside>
    </div>
  );
}

/* ---------------- Activity ---------------- */

function Activity({ gtm, agent }: { gtm: Gtm; agent: AgentInfo | null }) {
  const items = [
    ...(gtm.state.activity ?? []).map((a) => ({ at: a.at, who: a.actor === "agent" ? a.who : "You", text: a.text })),
    ...(agent?.status.log ?? []).map((x) => ({ at: x.at, who: "Agent", text: x.text })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  if (!items.length) return <Empty title="No activity yet">Everything the agent and you do shows up here.</Empty>;
  return (
    <ol className="card max-w-[900px] divide-y divide-line">
      {items.slice(0, 150).map((x, i) => (
        <li key={i} className="flex gap-4 px-5 py-3 text-sm">
          <span className="w-24 shrink-0 text-xs text-muted">{ago(x.at)}</span>
          <span className="w-20 shrink-0 text-xs font-medium">{x.who}</span>
          <span className="flex-1">{x.text}</span>
        </li>
      ))}
    </ol>
  );
}
