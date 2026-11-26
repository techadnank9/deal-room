"use client";
// Contacts: every person the agent found, across all companies, in one table.
import { useMemo, useState } from "react";
import { Btn, EmailBadge, Empty, Flames, Pill, leadState, usePoll, type Gtm } from "@/components/app/ui";

type State = ReturnType<typeof leadState>;
const STATUS: Record<State, { label: string; tone: "line" | "green" | "amber" | "red" | "accent" | "ink" }> = {
  review: { label: "Review", tone: "accent" },
  scheduled: { label: "Scheduled", tone: "amber" },
  in_sequence: { label: "In sequence", tone: "ink" },
  replied: { label: "Replied", tone: "green" },
  new: { label: "New", tone: "line" },
  closed: { label: "Closed", tone: "line" },
};
const ORDER: State[] = ["review", "scheduled", "in_sequence", "replied", "new", "closed"];

export default function ContactsPage() {
  const { data, error } = usePoll<Gtm>("/api/gtm", 15000);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<State | "all">("all");

  const rows = useMemo(
    () =>
      (data?.state.leads ?? []).flatMap((lead) => {
        const st = leadState(lead);
        return (lead.contacts ?? []).map((c) => ({ key: `${lead.id}:${c.id}`, c, lead, st }));
      }),
    [data],
  );
  const needle = q.trim().toLowerCase();
  const shown = rows.filter(
    (r) => (status === "all" || r.st === status) && (!needle || [r.c.name, r.c.title, r.lead.company, r.lead.domain].some((s) => s?.toLowerCase().includes(needle))),
  );

  function exportCsv() {
    const head = ["Name", "Title", "Persona", "Company", "Domain", "Signal", "AI score", "Email", "Email status", "Status", "LinkedIn"];
    const esc = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = shown.map((r) =>
      [r.c.name, r.c.title, r.c.persona, r.lead.company, r.lead.domain, r.lead.signals?.[0]?.text, r.lead.score, r.c.email, r.c.emailStatus, STATUS[r.st].label, r.c.linkedin].map(esc).join(","),
    );
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="px-8 py-6">
      <div className="mx-auto max-w-[1200px]">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
            <p className="text-sm text-muted">Everyone your agent found at the companies it picked, with why they&apos;re a fit and where they stand.</p>
          </div>
          <button className={Btn.primary} onClick={exportCsv} disabled={shown.length === 0}>
            Export CSV
          </button>
        </header>

        {error && !data && <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Couldn&apos;t load contacts: {error}</p>}

        {!data && !error ? (
          <div className="rounded-2xl border border-line bg-white px-6 py-12 text-center text-sm text-muted">Loading contacts…</div>
        ) : rows.length === 0 ? (
          <Empty title="No contacts yet">Once your agent finds companies that match, it looks up the right people there and lists them here with their verified email.</Empty>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <label className="relative">
                <span className="sr-only">Search contacts</span>
                <input
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search name, company or title"
                  className="w-72 max-w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink"
                />
              </label>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
                {(["all", ...ORDER] as const).map((k) => {
                  const n = k === "all" ? rows.length : rows.filter((r) => r.st === k).length;
                  if (k !== "all" && n === 0) return null;
                  const on = status === k;
                  return (
                    <button
                      key={k}
                      aria-pressed={on}
                      onClick={() => setStatus(k)}
                      className={`rounded-full border px-3 py-1 text-sm transition ${on ? "border-ink bg-ink text-white" : "border-line bg-white hover:border-ink"}`}
                    >
                      {k === "all" ? "All" : STATUS[k].label} <span className={on ? "text-white/70" : "text-muted"}>{n}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-line bg-white">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Contact</th>
                    <th className="px-4 py-3 font-medium">Company</th>
                    <th className="px-4 py-3 font-medium">Signal</th>
                    <th className="px-4 py-3 font-medium">AI score</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map(({ key, c, lead, st }) => {
                    const more = (lead.signals?.length ?? 0) - 1;
                    return (
                      <tr key={key} className="border-b border-line align-top last:border-b-0 hover:bg-paper/50">
                        <td className="px-4 py-3">
                          <p className="font-medium">
                            {c.linkedin ? (
                              <a href={c.linkedin} target="_blank" rel="noreferrer" className="hover:underline">
                                {c.name}
                              </a>
                            ) : (
                              c.name
                            )}
                          </p>
                          <p className="text-muted">{c.title}</p>
                          {c.persona && (
                            <span className="mt-1 inline-block">
                              <Pill tone="accent">{c.persona}</Pill>
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium">{lead.company}</p>
                          <p className="text-muted">{lead.domain}</p>
                        </td>
                        <td className="max-w-[260px] px-4 py-3">
                          {lead.signals?.[0] ? (
                            <>
                              <p className="line-clamp-2">{lead.signals[0].text}</p>
                              {more > 0 && <p className="text-xs text-muted">+{more} signal{more > 1 ? "s" : ""}</p>}
                            </>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Flames score={lead.score} />
                        </td>
                        <td className="px-4 py-3">
                          <p className="break-all">{c.email ?? <span className="text-muted">Not found</span>}</p>
                          <span className="mt-1 inline-block">
                            <EmailBadge status={c.emailStatus} />
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Pill tone={STATUS[st].tone}>{STATUS[st].label}</Pill>
                        </td>
                      </tr>
                    );
                  })}
                  {shown.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-muted">
                        No contacts match that search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted">
              Showing {shown.length} of {rows.length} contacts
            </p>
          </>
        )}
      </div>
    </div>
  );
}
