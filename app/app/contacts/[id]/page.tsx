"use client";
// One person: who they are, why the agent picked their company (signals with sources), the emails, notes, activity.
import Link from "next/link";
import { use, useState } from "react";
import FitButtons from "@/components/app/FitButtons";
import { Btn, EmailBadge, Flames, Pill, ago, host, leadState, post, usePoll, type Gtm } from "@/components/app/ui";

const SIGNAL: Record<string, string> = { funding: "Raised funds", hiring: "Hiring", launch: "Launched", exec_hire: "New leader", tech_change: "Changed tools", expansion: "Expanding", other: "In the news" };
const STATE: Record<string, string> = { review: "Waiting for your review", scheduled: "Approved, sending soon", in_sequence: "In sequence", replied: "Replied", new: "Not contacted yet", closed: "Closed" };

function Card({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export default function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [leadId, contactId] = decodeURIComponent(id).split("~");
  const { data, error, reload } = usePoll<Gtm>("/api/gtm", 20000);
  const lead = data?.state.leads.find((l) => l.id === leadId);
  const c = lead?.contacts?.find((x) => x.id === contactId);
  const [notes, setNotes] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  if (error && !data) return <p className="m-8 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Couldn&apos;t load this contact: {error}</p>;
  if (!data) return <p className="m-8 text-sm text-muted">Loading…</p>;
  if (!lead || !c)
    return (
      <div className="m-8">
        <p className="text-sm text-muted">This contact is no longer in your pipeline.</p>
        <Link href="/app/contacts" className="mt-2 inline-block text-sm underline">
          Back to contacts
        </Link>
      </div>
    );

  const st = leadState(lead);
  const lists = data.state.lists ?? [];
  const mine = (lead.sequence ?? []).filter((m) => !m.to || !c.email || m.to.toLowerCase() === c.email.toLowerCase());
  const others = (lead.contacts ?? []).filter((x) => x.id !== c.id);
  const log = [
    ...(lead.history ?? []).map((h) => ({ at: h.at, text: `${h.who}: ${h.note ?? `moved to ${h.stage}`}` })),
    ...mine.filter((m) => m.sentAt).map((m) => ({ at: m.sentAt!, text: `Sent step ${m.step}${m.subject ? `: “${m.subject}”` : ""}` })),
    ...mine.filter((m) => m.decidedAt).map((m) => ({ at: m.decidedAt!, text: `Step ${m.step} ${m.approval}${m.edited ? " (edited)" : ""}` })),
    { at: lead.at, text: `Found by ${lead.foundBy}` },
  ].sort((a, b) => b.at.localeCompare(a.at));

  async function act(kind: string, body: Record<string, unknown>, done: string) {
    setBusy(kind);
    setMsg(null);
    try {
      await post("/api/gtm", body);
      setMsg(done);
      await reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "That didn't work");
    } finally {
      setBusy(null);
    }
  }

  function exportOne() {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["Name", "Title", "Company", "Domain", "Email", "Email status", "LinkedIn", "Persona", "Signals", "Notes"];
    const row = [c!.name, c!.title, lead!.company, lead!.domain, c!.email, c!.emailStatus, c!.linkedin, c!.persona, (lead!.signals ?? []).map((s) => s.text).join(" | "), c!.notes];
    const blob = new Blob([`${head.join(",")}\n${row.map(esc).join(",")}`], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${c!.name.replace(/\W+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const initials = c.name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="px-4 py-6 md:px-8">
      <div className="mx-auto max-w-[1100px]">
        <Link href="/app/contacts" className="text-sm text-muted hover:text-ink">
          ← Contacts
        </Link>

        <header className="mt-3 flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-line bg-white p-5">
          <div className="flex min-w-0 items-center gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-accent/12 text-lg font-semibold text-accent">{initials}</span>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight">{c.name}</h1>
              <p className="text-muted">
                {c.title} @ {lead.company}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {c.persona && <Pill tone="accent">{c.persona}</Pill>}
                <Pill tone={st === "replied" ? "green" : st === "review" ? "accent" : "line"}>{STATE[st]}</Pill>
                <Flames score={lead.score} />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {c.linkedin && (
              <a href={c.linkedin} target="_blank" rel="noreferrer" className={Btn.ghost}>
                LinkedIn
              </a>
            )}
            {(!c.email || c.emailStatus === "unknown" || c.emailStatus === "invalid") && (
              <button className={Btn.ghost} disabled={busy !== null} onClick={() => void act("enrich", { action: "enrich", leadId: lead.id }, "Looked up emails at this company.")}>
                {busy === "enrich" ? "Finding…" : "Find email"}
              </button>
            )}
            {st === "review" && (
              <Link href="/app/agent?tab=review" className={Btn.primary}>
                Review email
              </Link>
            )}
            <button className={Btn.ghost} onClick={exportOne}>
              Export
            </button>
          </div>
        </header>
        {msg && <p className="mt-3 rounded-xl border border-line bg-white px-4 py-2.5 text-sm">{msg}</p>}

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-4">
            <Card title={`${lead.signals?.length ?? 0} signal${lead.signals?.length === 1 ? "" : "s"}`}>
              {lead.signals?.length ? (
                <ul className="space-y-3">
                  {lead.signals.map((s, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
                      <div className="min-w-0">
                        <p className="text-sm">
                          <span className="font-medium">{SIGNAL[s.kind] ?? "Signal"}:</span> {s.text}
                        </p>
                        {s.sourceUrl && (
                          <a href={s.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-muted underline underline-offset-2 hover:text-ink">
                            {host(s.sourceUrl)}
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">No signal recorded.</p>
              )}
              <p className="mt-4 border-t border-line pt-3 text-sm">
                <span className="font-medium">Why this company:</span> {lead.why}
              </p>
              {lead.scoreWhy && <p className="mt-1 text-sm text-muted">{lead.scoreWhy}</p>}
              <div className="mt-3">
                <FitButtons leadId={lead.id} current={lead.feedback} onDone={reload} />
              </div>
            </Card>

            <Card title="Emails to this person">
              {mine.length === 0 ? (
                <p className="text-sm text-muted">No email written yet. The agent writes one once this person has a usable address and matches a persona.</p>
              ) : (
                <ol className="space-y-3">
                  {mine.map((m) => (
                    <li key={m.id} className="rounded-xl border border-line p-3">
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                        <span className="font-medium text-ink">
                          Step {m.step} · {m.channel === "email" ? "Email" : "LinkedIn note (send by hand)"}
                        </span>
                        <span>day {m.dayOffset}</span>
                        <Pill tone={m.sentAt ? "ink" : m.approval === "approved" ? "amber" : m.approval === "rejected" ? "red" : "accent"}>{m.sentAt ? `Sent ${ago(m.sentAt)}` : m.approval}</Pill>
                      </div>
                      {m.subject && <p className="text-sm font-medium">{m.subject}</p>}
                      <p className="mt-1 whitespace-pre-line text-sm text-ink/80">{m.body}</p>
                    </li>
                  ))}
                </ol>
              )}
            </Card>

            <Card title="Activity">
              <ul className="space-y-2">
                {log.map((e, i) => (
                  <li key={i} className="flex justify-between gap-4 text-sm">
                    <span>{e.text}</span>
                    <span className="shrink-0 text-xs text-muted">{ago(e.at)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <div className="space-y-4">
            <Card title="Contact">
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-xs text-muted">Email</dt>
                  <dd className="flex flex-wrap items-center gap-2 break-all">
                    {c.email ?? "Not found"} <EmailBadge status={c.emailStatus} />
                  </dd>
                </div>
                {c.previousCompanies?.length ? (
                  <div>
                    <dt className="text-xs text-muted">Worked at</dt>
                    <dd>{c.previousCompanies.slice(0, 4).join(", ")}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-xs text-muted">Found from</dt>
                  <dd>{c.source === "glasser" ? "Company people data" : "Web research"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">List</dt>
                  <dd>
                    <select
                      value={c.list ?? ""}
                      disabled={busy !== null}
                      onChange={(e) => {
                        const v = e.target.value === "__new" ? (prompt("New list name") ?? "") : e.target.value;
                        if (e.target.value === "__new" && !v.trim()) return;
                        void act("list", { action: "file", list: v, items: [{ leadId: lead.id, contactId: c.id }] }, v ? `Filed under “${v}”.` : "Taken off the list.");
                      }}
                      className="mt-0.5 w-full rounded-lg border border-line bg-white px-2.5 py-1.5"
                    >
                      <option value="">Not in a list</option>
                      {lists.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                      <option value="__new">+ New list…</option>
                    </select>
                  </dd>
                </div>
              </dl>
            </Card>

            <Card title="Company">
              <p className="font-medium">{lead.company}</p>
              <a href={`https://${lead.domain}`} target="_blank" rel="noreferrer" className="text-sm text-muted underline underline-offset-2">
                {lead.domain}
              </a>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                {lead.industry && (
                  <div>
                    <dt className="text-xs text-muted">Industry</dt>
                    <dd>{lead.industry}</dd>
                  </div>
                )}
                {lead.size && (
                  <div>
                    <dt className="text-xs text-muted">People</dt>
                    <dd>{lead.size}</dd>
                  </div>
                )}
                {lead.hq && (
                  <div>
                    <dt className="text-xs text-muted">Based in</dt>
                    <dd>{lead.hq}</dd>
                  </div>
                )}
                {lead.funding && (
                  <div>
                    <dt className="text-xs text-muted">Funding</dt>
                    <dd>{lead.funding}</dd>
                  </div>
                )}
              </dl>
              {others.length > 0 && (
                <div className="mt-4 border-t border-line pt-3">
                  <p className="mb-1 text-xs text-muted">Others at {lead.company}</p>
                  <ul className="space-y-1 text-sm">
                    {others.map((o) => (
                      <li key={o.id}>
                        <Link href={`/app/contacts/${encodeURIComponent(`${lead.id}~${o.id}`)}`} className="hover:underline">
                          {o.name}
                        </Link>{" "}
                        <span className="text-muted">· {o.title}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>

            <Card title="Your notes" right={<span className="text-xs text-muted">Only you see these</span>}>
              <textarea
                value={notes ?? c.notes ?? ""}
                onChange={(e) => setNotes(e.target.value)}
                rows={5}
                placeholder="Anything to remember about this person"
                aria-label="Notes"
                className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-ink"
              />
              <button
                className={`${Btn.dark} mt-2`}
                disabled={notes === null || notes === (c.notes ?? "") || busy !== null}
                onClick={() => void act("notes", { action: "notes", leadId: lead.id, contactId: c.id, notes: notes ?? "" }, "Notes saved.").then(() => setNotes(null))}
              >
                {busy === "notes" ? "Saving…" : "Save"}
              </button>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
