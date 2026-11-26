"use client";
// Inbox: every reply to the agent's emails, one list on the left, the reply and your answer on the right.
import { useMemo, useState } from "react";
import { Btn, Empty, Pill, ago, post, usePoll, type Gtm } from "@/components/app/ui";

type Category = "interested" | "not_now" | "not_interested" | "unsubscribe" | "referral" | "other" | "out_of_office" | "bounce";
type Reply = {
  id: string;
  from_email: string | null;
  subject: string | null;
  text: string | null;
  clean: string | null;
  category: Category | null;
  lead_id: string | null;
  draft: string | null;
  received_at: string;
  handled: boolean | number;
};

const CAT: Record<Category, { label: string; tone: "green" | "amber" | "red" | "accent" | "line" }> = {
  interested: { label: "Interested", tone: "green" },
  referral: { label: "Referral", tone: "accent" },
  not_now: { label: "Not now", tone: "amber" },
  not_interested: { label: "Not interested", tone: "line" },
  unsubscribe: { label: "Unsubscribed", tone: "red" },
  bounce: { label: "Bounced", tone: "red" },
  out_of_office: { label: "Out of office", tone: "line" },
  other: { label: "Other", tone: "line" },
};

const FILTERS = [
  { key: "all", label: "All", test: () => true },
  { key: "interested", label: "Interested", test: (r: Reply) => r.category === "interested" || r.category === "referral" },
  { key: "needs", label: "Needs reply", test: (r: Reply) => !r.handled && !!r.draft },
  { key: "not_now", label: "Not now", test: (r: Reply) => r.category === "not_now" },
  { key: "gone", label: "Unsubscribed / Bounced", test: (r: Reply) => r.category === "unsubscribe" || r.category === "bounce" },
] as const;

export default function InboxPage() {
  const { data, error, reload } = usePoll<{ replies: Reply[] }>("/api/inbox", 15000);
  const { data: gtm } = usePoll<Gtm>("/api/gtm", 15000);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [sel, setSel] = useState<string | null>(null);

  const replies = useMemo(() => [...(data?.replies ?? [])].sort((a, b) => +new Date(b.received_at) - +new Date(a.received_at)), [data]);
  const shown = replies.filter(FILTERS.find((f) => f.key === filter)!.test);
  const current = replies.find((r) => r.id === sel) ?? null;

  return (
    <div className="px-8 py-6">
      <div className="mx-auto max-w-[1200px]">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
          <p className="text-sm text-muted">Everyone who wrote back to your agent&apos;s emails, sorted for you, with a reply already drafted.</p>
        </header>

        {error && !data && <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Couldn&apos;t load your inbox: {error}</p>}

        {!data && !error ? (
          <div className="rounded-2xl border border-line bg-white px-6 py-12 text-center text-sm text-muted">Loading replies…</div>
        ) : replies.length === 0 ? (
          <Empty title="No replies yet">
            Replies show up here automatically once your agent&apos;s emails go out. When someone replies, their sequence stops, so nobody gets a follow-up after answering.
          </Empty>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Filter replies">
              {FILTERS.map((f) => {
                const n = replies.filter(f.test).length;
                const on = f.key === filter;
                return (
                  <button
                    key={f.key}
                    role="tab"
                    aria-selected={on}
                    onClick={() => setFilter(f.key)}
                    className={`rounded-full border px-3 py-1 text-sm transition ${on ? "border-ink bg-ink text-white" : "border-line bg-white hover:border-ink"}`}
                  >
                    {f.label} <span className={on ? "text-white/70" : "text-muted"}>{n}</span>
                  </button>
                );
              })}
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(280px,380px)_1fr]">
              <ul className="max-h-[70vh] overflow-y-auto rounded-2xl border border-line bg-white" aria-label="Replies">
                {shown.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">Nothing in this view.</li>}
                {shown.map((r) => {
                  const cat = CAT[r.category ?? "other"] ?? CAT.other;
                  const on = r.id === current?.id;
                  return (
                    <li key={r.id} className="border-b border-line last:border-b-0">
                      <button onClick={() => setSel(r.id)} aria-current={on} className={`flex w-full gap-3 px-4 py-3 text-left transition ${on ? "bg-accent/8" : "hover:bg-paper"}`}>
                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${r.handled ? "bg-transparent" : "bg-accent"}`} aria-label={r.handled ? undefined : "Unread"} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className={`truncate text-sm ${r.handled ? "" : "font-semibold"}`}>{r.from_email ?? "Unknown sender"}</span>
                            <span className="shrink-0 text-xs text-muted">{ago(r.received_at)}</span>
                          </span>
                          <span className="block truncate text-sm text-ink/80">{r.subject || "(no subject)"}</span>
                          <span className="mt-1 block">
                            <Pill tone={cat.tone}>{cat.label}</Pill>
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              {current ? <ReadingPane key={current.id} reply={current} gtm={gtm} onDone={reload} /> : (
                <div className="hidden items-center justify-center rounded-2xl border border-dashed border-line bg-white/60 p-12 text-sm text-muted lg:flex">Pick a reply on the left to read it and answer.</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ReadingPane({ reply, gtm, onDone }: { reply: Reply; gtm: Gtm | null; onDone: () => void }) {
  const [full, setFull] = useState(false);
  const [body, setBody] = useState(reply.draft ?? "");
  const [busy, setBusy] = useState<"send" | "done" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const lead = gtm?.state.leads.find((l) => l.id === reply.lead_id);
  const cat = CAT[reply.category ?? "other"] ?? CAT.other;
  const shownText = (full ? reply.text : reply.clean || reply.text) ?? "";

  async function act(action: "send" | "done") {
    setBusy(action);
    setMsg(null);
    try {
      await post("/api/inbox", action === "send" ? { id: reply.id, action, body } : { id: reply.id, action });
      setMsg({ ok: true, text: action === "send" ? "Reply queued. It goes out from your mailbox in about 30 seconds." : "Marked as done." });
      onDone();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Something went wrong." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="space-y-4 rounded-2xl border border-line bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{reply.subject || "(no subject)"}</h2>
          <p className="text-sm text-muted">
            From {reply.from_email ?? "unknown"} · {new Date(reply.received_at).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Pill tone={cat.tone}>{cat.label}</Pill>
          {!!reply.handled && <Pill tone="green">Done</Pill>}
        </div>
      </div>

      {lead && (
        <div className="rounded-xl border border-line bg-paper/60 p-4 text-sm">
          <p className="font-medium">
            {lead.company} <span className="font-normal text-muted">· {lead.domain}</span>
          </p>
          {lead.why && <p className="mt-1 text-ink/80">{lead.why}</p>}
          {lead.signals?.[0] && <p className="mt-1 text-muted">Signal: {lead.signals[0].text}</p>}
        </div>
      )}

      <div>
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{shownText || "This reply had no text."}</p>
        {reply.text && reply.clean && reply.text !== reply.clean && (
          <button onClick={() => setFull((v) => !v)} className="mt-2 text-sm text-accent hover:underline" aria-expanded={full}>
            {full ? "Show just the reply" : "Show full text (with quoted email)"}
          </button>
        )}
      </div>

      <div className="border-t border-line pt-4">
        <label htmlFor="reply-body" className="mb-1 block text-sm font-medium">
          Your reply
        </label>
        <p className="mb-2 text-xs text-muted">{reply.draft ? "Drafted by your agent. Edit anything before sending." : "No draft for this one. Write your answer here."}</p>
        <textarea
          id="reply-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className={Btn.primary} disabled={!!busy || !body.trim() || !reply.from_email} onClick={() => act("send")}>
            {busy === "send" ? "Sending…" : "Send reply"}
          </button>
          <button className={Btn.ghost} disabled={!!busy || !!reply.handled} onClick={() => act("done")}>
            {busy === "done" ? "Saving…" : "Mark done"}
          </button>
          {msg && (
            <span role="status" className={`text-sm ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>
              {msg.text}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
