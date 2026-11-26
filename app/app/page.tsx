"use client";
import Link from "next/link";
import { Btn, leadState, usePoll, type AgentInfo, type Gtm, type WorkspaceInfo } from "@/components/app/ui";

type Boxes = { mailboxes: { id: string; email: string }[] };

export default function Dashboard() {
  const { data: me } = usePoll<WorkspaceInfo>("/api/workspace", 30000);
  const { data: gtm } = usePoll<Gtm>("/api/gtm", 10000);
  const { data: agent } = usePoll<AgentInfo>("/api/agent", 15000);
  const { data: boxes } = usePoll<Boxes>("/api/mailboxes", 30000);
  if (!me || !gtm) return <p className="p-10 text-muted">Loading…</p>;
  const t = gtm.state;
  const leads = t.leads;
  const steps: [string, boolean, string, string][] = [
    ["We learned your business", Boolean(t.icpSpec), "/app/setup", "Finish"],
    ["You confirmed your buyers", Boolean(t.personasConfirmed), "/app/setup", "Confirm"],
    ["Mailbox connected", Boolean(boxes?.mailboxes.length), "/app/settings", "Connect"],
    ["Agent is running", me.workspace.settings.active, "/app/agent", "Start"],
  ];
  const done = steps.filter((s) => s[1]).length;
  const review = leads.filter((l) => leadState(l) === "review").length;
  const sent = leads.filter((l) => l.sequence?.some((m) => m.sentAt)).length;
  const replied = leads.filter((l) => ["replied", "meeting", "won"].includes(l.stage ?? "")).length;
  const first = (me.name ?? me.email).split(/[ @]/)[0];
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
