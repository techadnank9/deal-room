"use client";
import Link from "next/link";
import { useState } from "react";
import { Btn, Flames, ago, contactHref, leadState, post, topContact, usePoll, type AgentInfo, type Gtm, type WorkspaceInfo } from "@/components/app/ui";

type Reply = { id: string; from_email: string | null; subject: string | null; clean: string | null; category: string | null; received_at: string | null; handled: boolean | number };
const CAT: Record<string, string> = { interested: "Interested", not_now: "Not now", not_interested: "Not interested", referral: "Referral", unsubscribe: "Unsubscribed", other: "Other", bounce: "Bounced", out_of_office: "Out of office" };

type Boxes = { mailboxes: { id: string; email: string }[] };

export default function Dashboard() {
  const { data: me } = usePoll<WorkspaceInfo>("/api/workspace", 30000);
  const { data: gtm } = usePoll<Gtm>("/api/gtm", 10000);
  const { data: agent } = usePoll<AgentInfo>("/api/agent", 15000);
  const { data: boxes } = usePoll<Boxes>("/api/mailboxes", 30000);
  const { data: inbox } = usePoll<{ replies: Reply[] }>("/api/inbox", 30000);
  const [deal, setDeal] = useState<string | null>(null);
  if (!me || !gtm) return <p className="p-10 text-muted">Loading…</p>;
  const t = gtm.state;
  const leads = t.leads;
  const steps: [string, boolean, string, string][] = [
    ["We learned your business", Boolean(t.icpSpec), "/app/setup", "Finish"],
    ["You confirmed your buyers", Boolean(t.personasConfirmed), "/app/setup", "Confirm"],
    ["Mailbox connected", Boolean(boxes?.mailboxes.length), "/app/settings", "Connect"],
    ["Postal address added (required in every email)", Boolean(t.prefs?.postalAddress?.trim()), "/app/settings#prefs", "Add"],
    ["Agent is running", me.workspace.settings.active, "/app/agent", "Start"],
  ];
  const done = steps.filter((s) => s[1]).length;
  const review = leads.filter((l) => leadState(l) === "review").length;
  const sent = leads.filter((l) => l.sequence?.some((m) => m.sentAt)).length;
  const replied = leads.filter((l) => ["replied", "meeting", "won"].includes(l.stage ?? "")).length;
  const first = (me.name ?? me.email).split(/[ @]/)[0];
  const dealSize = gtm.state.prefs?.dealSize ?? 0;
  const opps = leads.filter((l) => ["replied", "meeting"].includes(l.stage ?? "")).length;
  const won = leads.filter((l) => l.stage === "won").length;
  const replies = (inbox?.replies ?? []).filter((r) => !["bounce", "out_of_office"].includes(r.category ?? "")).slice(0, 4);
  const hot = leads
    .filter((l) => (l.score ?? 0) >= 55 && ["review", "new", "scheduled"].includes(leadState(l)))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 4);
  async function saveDeal() {
    const n = Math.max(0, Math.round(Number(deal?.replace(/[^0-9.]/g, "")) || 0));
    await post("/api/gtm", { action: "prefs", prefs: { dealSize: n } });
    setDeal(null);
  }
  const money = (n: number) => `$${n.toLocaleString()}`;
  return (
    <div className="mx-auto max-w-[1100px] space-y-6 px-4 md:px-8 py-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Hi {first}</h1>
        <p className="mt-1 text-muted">{t.company ? `Your agent is selling ${t.company}.` : "Let's set up your agent."}</p>
      </header>
      {done < steps.length && (
        <section className="card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Get your agent running</h2>
            <span className="text-sm text-muted">{done} of {steps.length} done</span>
          </div>
          <div className="mb-4 h-1.5 rounded-full bg-line"><div className="h-full rounded-full bg-accent" style={{ width: `${(100 * done) / steps.length}%` }} /></div>
          <ul className="divide-y divide-line">
            {steps.map(([label, ok, href, cta]) => (
              <li key={label} className="flex items-center justify-between py-3 text-sm">
                <span className="flex items-center gap-3">
                  <span className={`grid h-6 w-6 place-items-center rounded-full text-xs ${ok ? "bg-ink text-white" : "border border-line"}`}>{ok ? "✓" : ""}</span>
                  {label}
                </span>
                {!ok && <Link href={href} className={Btn.ghost}>{cta}</Link>}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["New leads today", me.usage.today.leads],
          ["Waiting for your review", review],
          ["Contacted", sent],
          ["Replies", replied],
        ].map(([k, v]) => (
          <div key={k as string} className="card p-5">
            <p className="text-xs text-muted">{k}</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">{v}</p>
          </div>
        ))}
      </section>
      <section className="card flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <p className="text-xs text-muted">Pipeline value</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{dealSize ? money(opps * dealSize) : "—"}</p>
          <p className="text-sm text-muted">
            {opps} open conversation{opps === 1 ? "" : "s"}
            {won ? ` · ${won} won${dealSize ? ` (${money(won * dealSize)})` : ""}` : ""}
          </p>
        </div>
        {deal === null ? (
          <button className={Btn.ghost} onClick={() => setDeal(String(dealSize || ""))}>
            {dealSize ? `Average deal ${money(dealSize)} · Edit` : "Set your average deal size"}
          </button>
        ) : (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void saveDeal();
            }}
          >
            <label className="text-sm text-muted" htmlFor="deal">
              Average deal $
            </label>
            <input id="deal" inputMode="numeric" autoFocus value={deal} onChange={(e) => setDeal(e.target.value)} className="w-28 rounded-lg border border-line px-2.5 py-1.5 text-sm outline-none focus:border-ink" />
            <button className={Btn.dark}>Save</button>
          </form>
        )}
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        <div className="card p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Latest replies</h2>
            <Link href="/app/inbox" className="text-sm text-muted hover:text-ink">Inbox →</Link>
          </div>
          {replies.length ? (
            <ul className="space-y-3 text-sm">
              {replies.map((r) => (
                <li key={r.id}>
                  <Link href="/app/inbox" className="block hover:underline">
                    <span className="font-medium">{r.from_email}</span>
                    {r.category && <span className="ml-2 text-xs text-muted">{CAT[r.category] ?? r.category}</span>}
                    <span className="block truncate text-muted">{r.clean ?? r.subject}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No replies yet. They show up here with a drafted answer.</p>
          )}
        </div>
        <div className="card p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Hottest leads</h2>
            <Link href="/app/contacts" className="text-sm text-muted hover:text-ink">Contacts →</Link>
          </div>
          {hot.length ? (
            <ul className="space-y-3 text-sm">
              {hot.map((l) => {
                const c = topContact(l);
                return (
                  <li key={l.id} className="flex items-start justify-between gap-3">
                    <Link href={c ? contactHref(l.id, c.id) : "/app/agent?tab=leads"} className="min-w-0 hover:underline">
                      <span className="font-medium">{l.company}</span>
                      {c && <span className="text-muted"> · {c.name}</span>}
                      <span className="block truncate text-muted">{l.signals?.[0]?.text ?? l.why}</span>
                    </Link>
                    <span className="shrink-0 text-right">
                      <Flames score={l.score} />
                      <span className="block text-[11px] text-muted">{ago(l.at)}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted">Leads with a top score that you haven&apos;t contacted yet show up here.</p>
          )}
        </div>
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        <Link href="/app/agent?tab=review" className="card block p-6 hover:ring-1 hover:ring-ink/20">
          <p className="font-semibold">Review emails</p>
          <p className="mt-1 text-sm text-muted">{review ? `${review} ready. Approve, edit or reject in one click.` : "Nothing waiting. New emails show up here."}</p>
        </Link>
        <Link href="/app/inbox" className="card block p-6 hover:ring-1 hover:ring-ink/20">
          <p className="font-semibold">Inbox</p>
          <p className="mt-1 text-sm text-muted">Replies with a drafted answer. Sequences stop automatically when someone replies.</p>
        </Link>
      </section>
      {!!agent?.status.log.length && (
        <section className="card p-6">
          <h2 className="mb-3 font-semibold">Latest from your agent</h2>
          <ul className="space-y-2 text-sm">
            {agent.status.log.slice(0, 5).map((x, i) => (
              <li key={i} className="flex gap-3"><span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-accent" />{x.text}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
