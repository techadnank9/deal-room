"use client";
// Insights: what's working. Funnel, which signals and personas get replies, which message wins.
import { Empty, topContact, usePoll, type Gtm, type WorkspaceInfo } from "@/components/app/ui";
import { STAGES, type Signal } from "@/lib/gtm/types";
import type { Lead } from "@/lib/agents/team";

const STAGE_LABEL: Record<string, string> = Object.fromEntries(STAGES.map((s) => [s.key, s.label]));
const SIGNAL_LABEL: Record<Signal["kind"] | "none", string> = {
  funding: "Raised funding",
  hiring: "Hiring",
  launch: "Product launch",
  exec_hire: "New executive",
  tech_change: "Changed tools",
  expansion: "Expanding",
  other: "Other news",
  none: "No signal",
};
const VARIANT_LABEL: Record<string, string> = { A: "A · Ask for a 15-min call", B: "B · Offer a teardown video" };

const pct = (n: number, d: number) => (d ? Math.round((100 * n) / d) : 0);
const contacted = (l: Lead) => (l.sequence ?? []).some((m) => !!m.sentAt);
const replied = (l: Lead) => ["replied", "meeting", "won"].includes(l.stage ?? "");

type Row = { key: string; leads: number; contacted: number; replied: number };
function group(leads: Lead[], key: (l: Lead) => string): Row[] {
  const m = new Map<string, Row>();
  for (const l of leads) {
    const k = key(l);
    const v = m.get(k) ?? { key: k, leads: 0, contacted: 0, replied: 0 };
    v.leads++;
    if (contacted(l)) v.contacted++;
    if (replied(l)) v.replied++;
    m.set(k, v);
  }
  return [...m.values()].sort((a, b) => pct(b.replied, b.contacted) - pct(a.replied, a.contacted) || b.leads - a.leads);
}

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <h2 className="font-semibold">{title}</h2>
      {sub && <p className="mb-4 text-sm text-muted">{sub}</p>}
      {!sub && <div className="mb-4" />}
      {children}
    </section>
  );
}

function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  const w = max ? Math.min(100, (100 * value) / max) : 0;
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-line/70" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${w}%` }} />
    </div>
  );
}

function RateTable({ rows, first }: { rows: Row[]; first: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted">Not enough data yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-left text-sm">
        <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
          <tr>
            <th className="py-2 pr-3 font-medium">{first}</th>
            <th className="py-2 pr-3 text-right font-medium">Leads</th>
            <th className="py-2 pr-3 text-right font-medium">Contacted</th>
            <th className="py-2 pr-3 text-right font-medium">Replied</th>
            <th className="w-32 py-2 text-right font-medium">Reply rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-line last:border-b-0">
              <td className="py-2 pr-3">{r.key}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{r.leads}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{r.contacted}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{r.replied}</td>
              <td className="py-2 text-right">
                <span className="flex items-center justify-end gap-2">
                  <span className="w-14">
                    <Bar value={pct(r.replied, r.contacted)} max={100} label={`${r.key} reply rate`} />
                  </span>
                  <span className="w-10 tabular-nums">{r.contacted ? `${pct(r.replied, r.contacted)}%` : "—"}</span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function InsightsPage() {
  const { data: gtm, error } = usePoll<Gtm>("/api/gtm", 30000);
  const { data: me } = usePoll<WorkspaceInfo>("/api/workspace", 30000);

  const leads = gtm?.state.leads ?? [];
  const funnel = gtm?.analytics.funnel ?? [];
  const count = (s: string) => funnel.find((f) => f.stage === s)?.count ?? 0;
  const sent = leads.reduce((n, l) => n + (l.sequence ?? []).filter((m) => m.sentAt).length, 0);
  const contactedN = leads.filter(contacted).length;
  const repliedN = count("replied");
  const kpis = [
    { label: "Leads found", value: leads.length },
    { label: "Emails sent", value: sent },
    { label: "Replies", value: repliedN },
    { label: "Reply rate", value: contactedN ? `${pct(repliedN, contactedN)}%` : "—" },
    { label: "Meetings", value: count("meeting") },
  ];
  const bySignal = group(leads, (l) => SIGNAL_LABEL[l.signals?.[0]?.kind ?? "none"]);
  const byPersona = group(leads, (l) => topContact(l)?.persona || "No persona");
  const variants = (gtm?.analytics.variants ?? []).filter((v) => v.channel === "email");
  const fmax = Math.max(1, ...funnel.map((f) => f.count));

  return (
    <div className="px-8 py-6">
      <div className="mx-auto max-w-[1200px]">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Insights</h1>
          <p className="text-sm text-muted">What&apos;s working: which signals, people and messages get replies, so you know where to lean in.</p>
        </header>

        {error && !gtm && <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Couldn&apos;t load insights: {error}</p>}

        {!gtm && !error ? (
          <div className="rounded-2xl border border-line bg-white px-6 py-12 text-center text-sm text-muted">Loading insights…</div>
        ) : !gtm ? null : leads.length === 0 ? (
          <Empty title="Nothing to measure yet">As soon as your agent finds leads and sends its first emails, you&apos;ll see what&apos;s getting replies here.</Empty>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {kpis.map((k) => (
                <div key={k.label} className="rounded-2xl border border-line bg-white p-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted">{k.label}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{k.value}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card title="Funnel" sub="How leads move from found to closed, with the share that makes each step.">
                <ol className="space-y-3">
                  {funnel.map((f, i) => {
                    const c = i > 0 ? gtm.analytics.conv[i - 1] : null;
                    return (
                      <li key={f.stage}>
                        <div className="mb-1 flex items-baseline justify-between text-sm">
                          <span>{STAGE_LABEL[f.stage] ?? f.stage}</span>
                          <span className="tabular-nums">
                            <span className="font-medium">{f.count}</span>
                            {c && <span className="ml-2 text-xs text-muted">{c.rate}% of previous</span>}
                          </span>
                        </div>
                        <Bar value={f.count} max={fmax} label={`${STAGE_LABEL[f.stage] ?? f.stage}: ${f.count}`} />
                      </li>
                    );
                  })}
                </ol>
              </Card>

              <Card title="Plan usage" sub={me ? `${me.plan.name} plan` : "Loading your plan…"}>
                {me ? (
                  <div className="space-y-4 text-sm">
                    <div>
                      <div className="mb-1 flex justify-between">
                        <span>Contacts this month</span>
                        <span className="tabular-nums">
                          {me.usage.month.enrich} / {me.plan.contactsPerMonth}
                        </span>
                      </div>
                      <Bar value={me.usage.month.enrich} max={me.plan.contactsPerMonth} label="Contacts used this month" />
                    </div>
                    <dl className="grid grid-cols-2 gap-3">
                      {[
                        ["Emails sent this month", me.usage.month.sends],
                        ["Emails sent today", me.usage.today.sends],
                        ["Leads found today", me.usage.today.leads],
                        ["Contacts looked up today", me.usage.today.enrich],
                      ].map(([k, v]) => (
                        <div key={k} className="rounded-xl bg-paper/70 p-3">
                          <dt className="text-xs text-muted">{k}</dt>
                          <dd className="text-lg font-semibold tabular-nums">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ) : (
                  <p className="text-sm text-muted">Loading…</p>
                )}
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card title="Replies by signal type" sub="The news that made the agent pick a company, and how often it led to a reply.">
                <RateTable rows={bySignal} first="Signal" />
              </Card>
              <Card title="By persona" sub="Who the agent wrote to at each company.">
                <RateTable rows={byPersona} first="Persona" />
              </Card>
            </div>

            <Card title="Message variants" sub="Each lead gets one of two first emails. Reply rate counts approved emails.">
              {variants.every((v) => v.drafted === 0) ? (
                <p className="text-sm text-muted">No emails drafted yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-left text-sm">
                    <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
                      <tr>
                        <th className="py-2 pr-3 font-medium">Message</th>
                        <th className="py-2 pr-3 text-right font-medium">Drafted</th>
                        <th className="py-2 pr-3 text-right font-medium">Approved</th>
                        <th className="py-2 pr-3 text-right font-medium">Replied</th>
                        <th className="py-2 text-right font-medium">Reply rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {variants.map((v) => (
                        <tr key={v.variant} className="border-b border-line last:border-b-0">
                          <td className="py-2 pr-3">{VARIANT_LABEL[v.variant] ?? v.variant}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{v.drafted}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{v.approved}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{v.replied}</td>
                          <td className="py-2 text-right tabular-nums">{v.approved ? `${pct(v.replied, v.approved)}%` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
