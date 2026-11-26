"use client";
// Contacts: everyone the agent found, with filters, lists, bulk actions and a page per person.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Btn, EmailBadge, Empty, Flames, Pill, ago, contactHref, leadState, post, usePoll, type Gtm } from "@/components/app/ui";
import type { Lead } from "@/lib/agents/team";
import type { Contact } from "@/lib/gtm/types";

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
const SIGNAL: Record<string, string> = { funding: "Raised funds", hiring: "Hiring", launch: "Launched", exec_hire: "New leader", tech_change: "Changed tools", expansion: "Expanding", other: "In the news" };
const PAGE_SIZES = [25, 50, 100, 200];

type Row = { key: string; c: Contact; lead: Lead; st: State };
type Filters = { persona: string; list: string; score: string; email: string; status: string; signal: string; source: string; sort: string };
const NO_FILTERS: Filters = { persona: "", list: "", score: "", email: "", status: "", signal: "", source: "", sort: "new" };

const scoreBand = (s?: number) => (s === undefined ? "" : s >= 75 ? "3" : s >= 55 ? "2" : "1");
const emailBand = (s?: string) => (s === "verified" ? "verified" : s && ["risky", "mx-valid", "guessed"].includes(s) ? "found" : "none");
const sourceOf = (l: Lead) => (l.foundBy.match(/\(([^)]+)\)/)?.[1] ?? l.foundBy).replace(/^You$/, "you");

function csv(rows: Row[]) {
  const head = ["Name", "Title", "Persona", "Company", "Domain", "Signal", "AI score", "Email", "Email status", "List", "Status", "LinkedIn", "Added"];
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) =>
    [r.c.name, r.c.title, r.c.persona, r.lead.company, r.lead.domain, r.lead.signals?.[0]?.text, r.lead.score, r.c.email, r.c.emailStatus, r.c.list, STATUS[r.st].label, r.c.linkedin, r.lead.at?.slice(0, 10)].map(esc).join(","),
  );
  const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-line bg-white px-2.5 py-2 outline-none focus:border-ink">
        {options.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function ContactsPage() {
  const router = useRouter();
  const { data, error, reload } = usePoll<Gtm>("/api/gtm", 15000);
  const [tab, setTab] = useState<"all" | "lists">("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<Filters>(NO_FILTERS);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [size, setSize] = useState(25);
  const [page, setPage] = useState(0);
  const [listMenu, setListMenu] = useState(false);
  const [newList, setNewList] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const lists = data?.state.lists ?? [];
  const rows = useMemo<Row[]>(
    () =>
      (data?.state.leads ?? []).flatMap((lead) => {
        const st = leadState(lead);
        return (lead.contacts ?? []).map((c) => ({ key: `${lead.id}~${c.id}`, c, lead, st }));
      }),
    [data],
  );
  const personas = [...new Set(rows.map((r) => r.c.persona).filter(Boolean))] as string[];
  const sources = [...new Set(rows.map((r) => sourceOf(r.lead)))];

  const needle = q.trim().toLowerCase();
  const shown = rows
    .filter(
      (r) =>
        (!needle || [r.c.name, r.c.title, r.lead.company, r.lead.domain, r.c.email].some((s) => s?.toLowerCase().includes(needle))) &&
        (!f.persona || (f.persona === "-" ? !r.c.persona : r.c.persona === f.persona)) &&
        (!f.list || (f.list === "-" ? !r.c.list : r.c.list === f.list)) &&
        (!f.score || scoreBand(r.lead.score) === f.score) &&
        (!f.email || emailBand(r.c.emailStatus) === f.email) &&
        (!f.status || r.st === f.status) &&
        (!f.signal || r.lead.signals?.some((s) => s.kind === f.signal)) &&
        (!f.source || sourceOf(r.lead) === f.source),
    )
    .sort((a, b) => (f.sort === "score" ? (b.lead.score ?? -1) - (a.lead.score ?? -1) : f.sort === "old" ? a.lead.at.localeCompare(b.lead.at) : b.lead.at.localeCompare(a.lead.at)));
  const pages = Math.max(1, Math.ceil(shown.length / size));
  const cur = Math.min(page, pages - 1);
  const pageRows = shown.slice(cur * size, cur * size + size);
  const active = (Object.keys(NO_FILTERS) as (keyof Filters)[]).filter((k) => k !== "sort" && f[k]).length;
  const chosen = rows.filter((r) => sel.has(r.key));

  const setFilter = (k: keyof Filters) => (v: string) => {
    setF({ ...f, [k]: v });
    setPage(0);
  };

  async function file(list: string) {
    if (!chosen.length) return;
    setBusy(true);
    setMsg(null);
    try {
      await post("/api/gtm", { action: "file", list, items: chosen.map((r) => ({ leadId: r.lead.id, contactId: r.c.id })) });
      setMsg(list ? `Added ${chosen.length} to “${list}”.` : `Took ${chosen.length} off their list.`);
      setSel(new Set());
      setListMenu(false);
      setNewList("");
      await reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not update the list");
    } finally {
      setBusy(false);
    }
  }

  async function saveLists(next: string[]) {
    setBusy(true);
    try {
      await post("/api/gtm", { action: "lists", lists: next });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-4 py-6 md:px-8">
      <div className="mx-auto max-w-[1240px]">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
            <p className="text-sm text-muted">Everyone your agent found, why they fit, and where they stand. Organise them into lists.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/app/search" className={Btn.ghost}>
              Add leads
            </Link>
            <button className={Btn.primary} onClick={() => csv(shown)} disabled={shown.length === 0}>
              Export all ({shown.length})
            </button>
          </div>
        </header>

        <div className="mb-4 flex gap-1 border-b border-line" role="tablist">
          {(
            [
              ["all", `All contacts`, rows.length],
              ["lists", "Lists", lists.length],
            ] as const
          ).map(([k, label, n]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === k ? "border-accent font-medium text-ink" : "border-transparent text-muted hover:text-ink"}`}>
              {label} <span className="text-muted">{n}</span>
            </button>
          ))}
        </div>

        {error && !data && <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Couldn&apos;t load contacts: {error}</p>}
        {msg && <p className="mb-3 rounded-xl border border-line bg-white px-4 py-2.5 text-sm">{msg}</p>}

        {!data && !error ? (
          <div className="rounded-2xl border border-line bg-white px-6 py-12 text-center text-sm text-muted">Loading contacts…</div>
        ) : tab === "lists" ? (
          <ListsTab
            lists={lists}
            counts={Object.fromEntries(lists.map((l) => [l, rows.filter((r) => r.c.list === l).length]))}
            busy={busy}
            onSave={saveLists}
            onOpen={(l) => {
              setF({ ...NO_FILTERS, list: l });
              setTab("all");
              setPage(0);
            }}
          />
        ) : rows.length === 0 ? (
          <Empty title="No contacts yet">
            Once your agent finds companies that match, it looks up the right people there and lists them here with their verified email. You can also{" "}
            <Link href="/app/search" className="underline">
              search for leads
            </Link>
            .
          </Empty>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input
                type="search"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(0);
                }}
                placeholder="Search name, company, title or email"
                aria-label="Search contacts"
                className="w-72 max-w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink"
              />
              <button className={Btn.ghost} aria-expanded={open} onClick={() => setOpen(!open)}>
                {open ? "Hide filters" : "Add filters"}
                {active > 0 && <span className="rounded-full bg-accent px-1.5 text-[10px] font-semibold text-white">{active}</span>}
              </button>
              {active > 0 && (
                <button className="text-sm text-muted underline underline-offset-2 hover:text-ink" onClick={() => setF({ ...NO_FILTERS, sort: f.sort })}>
                  Clear all
                </button>
              )}
            </div>

            {open && (
              <div className="mb-3 grid gap-3 rounded-2xl border border-line bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
                <Select label="Persona" value={f.persona} onChange={setFilter("persona")} options={[["", "All personas"], ...personas.map((p) => [p, p] as [string, string]), ["-", "No persona match"]]} />
                <Select label="List" value={f.list} onChange={setFilter("list")} options={[["", "All lists"], ...lists.map((l) => [l, l] as [string, string]), ["-", "Not in a list"]]} />
                <Select label="AI score" value={f.score} onChange={setFilter("score")} options={[["", "All scores"], ["3", "Top priority (3 flames)"], ["2", "Strong match (2)"], ["1", "Relevant (1)"]]} />
                <Select label="Email" value={f.email} onChange={setFilter("email")} options={[["", "All contacts"], ["verified", "Verified email"], ["found", "Email found, not verified"], ["none", "No email"]]} />
                <Select label="Status" value={f.status} onChange={setFilter("status")} options={[["", "All statuses"], ...ORDER.map((s) => [s, STATUS[s].label] as [string, string])]} />
                <Select label="Signal" value={f.signal} onChange={setFilter("signal")} options={[["", "All signals"], ...Object.entries(SIGNAL)]} />
                <Select label="Found by" value={f.source} onChange={setFilter("source")} options={[["", "All sources"], ...sources.map((s) => [s, s] as [string, string])]} />
                <Select label="Sort" value={f.sort} onChange={setFilter("sort")} options={[["new", "Newest first"], ["old", "Oldest first"], ["score", "Highest AI score"]]} />
              </div>
            )}

            {sel.size > 0 && (
              <div className="sticky top-14 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-ink bg-white px-4 py-2.5 shadow-sm md:top-2">
                <span className="text-sm font-medium">{sel.size} selected</span>
                <div className="relative">
                  <button className={Btn.ghost} onClick={() => setListMenu(!listMenu)} aria-expanded={listMenu} disabled={busy}>
                    Add to list
                  </button>
                  {listMenu && (
                    <div className="absolute left-0 top-full z-20 mt-1 w-64 rounded-xl border border-line bg-white p-2 shadow-lg" role="menu">
                      {lists.map((l) => (
                        <button key={l} role="menuitem" className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-paper" onClick={() => void file(l)}>
                          {l}
                        </button>
                      ))}
                      <form
                        className="mt-1 flex gap-1 border-t border-line pt-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (newList.trim()) void file(newList);
                        }}
                      >
                        <input value={newList} onChange={(e) => setNewList(e.target.value)} placeholder="New list name" aria-label="New list name" className="min-w-0 flex-1 rounded-lg border border-line px-2 py-1.5 text-sm outline-none focus:border-ink" />
                        <button className={Btn.dark} disabled={!newList.trim()}>
                          Add
                        </button>
                      </form>
                    </div>
                  )}
                </div>
                {chosen.some((r) => r.c.list) && (
                  <button className={Btn.ghost} onClick={() => void file("")} disabled={busy}>
                    Remove from list
                  </button>
                )}
                <button className={Btn.ghost} onClick={() => csv(chosen)}>
                  Export selected
                </button>
                <button className="ml-auto text-sm text-muted hover:text-ink" onClick={() => setSel(new Set())}>
                  Clear selection
                </button>
              </div>
            )}

            <div className="overflow-x-auto rounded-2xl border border-line bg-white">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
                  <tr>
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label="Select this page"
                        checked={pageRows.length > 0 && pageRows.every((r) => sel.has(r.key))}
                        onChange={(e) => {
                          const n = new Set(sel);
                          for (const r of pageRows) {
                            if (e.target.checked) n.add(r.key);
                            else n.delete(r.key);
                          }
                          setSel(n);
                        }}
                      />
                    </th>
                    <th className="px-3 py-3 font-medium">Contact</th>
                    <th className="px-3 py-3 font-medium">Company</th>
                    <th className="px-3 py-3 font-medium">Signal</th>
                    <th className="px-3 py-3 font-medium">AI score</th>
                    <th className="px-3 py-3 font-medium">Email</th>
                    <th className="px-3 py-3 font-medium">Added</th>
                    <th className="px-3 py-3 font-medium">List</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map(({ key, c, lead, st }) => {
                    const more = (lead.signals?.length ?? 0) - 1;
                    return (
                      <tr key={key} onClick={() => router.push(contactHref(lead.id, c.id))} className="cursor-pointer border-b border-line align-top last:border-b-0 hover:bg-paper/50">
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`Select ${c.name}`}
                            checked={sel.has(key)}
                            onChange={(e) => {
                              const n = new Set(sel);
                              if (e.target.checked) n.add(key);
                              else n.delete(key);
                              setSel(n);
                            }}
                          />
                        </td>
                        <td className="px-3 py-3">
                          <Link href={contactHref(lead.id, c.id)} onClick={(e) => e.stopPropagation()} className="font-medium hover:underline">
                            {c.name}
                          </Link>
                          <p className="text-muted">{c.title}</p>
                          {c.persona && (
                            <span className="mt-1 inline-block">
                              <Pill tone="accent">{c.persona}</Pill>
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-medium">{lead.company}</p>
                          <p className="text-muted">{lead.domain}</p>
                        </td>
                        <td className="max-w-[220px] px-3 py-3">
                          {lead.signals?.[0] ? (
                            <>
                              <p className="line-clamp-2">{lead.signals[0].text}</p>
                              {more > 0 && <p className="text-xs text-muted">+{more} signal{more > 1 ? "s" : ""}</p>}
                            </>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <Flames score={lead.score} />
                        </td>
                        <td className="px-3 py-3">
                          <p className="max-w-[190px] truncate" title={c.email}>{c.email ?? <span className="text-muted">Not found</span>}</p>
                          <span className="mt-1 inline-block">
                            <EmailBadge status={c.emailStatus} />
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-muted">{ago(lead.at)}</td>
                        <td className="px-3 py-3">{c.list ? <Pill>{c.list}</Pill> : <span className="text-muted">—</span>}</td>
                        <td className="px-3 py-3">
                          <Pill tone={STATUS[st].tone}>{STATUS[st].label}</Pill>
                        </td>
                      </tr>
                    );
                  })}
                  {pageRows.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-muted">
                        No contacts match these filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
              <span>
                Showing {shown.length ? cur * size + 1 : 0} to {Math.min(shown.length, cur * size + size)} of {shown.length}
              </span>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5">
                  Show
                  <select
                    value={size}
                    onChange={(e) => {
                      setSize(Number(e.target.value));
                      setPage(0);
                    }}
                    className="rounded-lg border border-line bg-white px-2 py-1"
                  >
                    {PAGE_SIZES.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  per page
                </label>
                <button className={Btn.ghost} disabled={cur === 0} onClick={() => setPage(cur - 1)}>
                  Previous
                </button>
                <span>
                  {cur + 1} / {pages}
                </span>
                <button className={Btn.ghost} disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ListsTab({ lists, counts, busy, onSave, onOpen }: { lists: string[]; counts: Record<string, number>; busy: boolean; onSave: (l: string[]) => Promise<void>; onOpen: (l: string) => void }) {
  const [name, setName] = useState("");
  return (
    <div>
      <form
        className="mb-4 flex max-w-md gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          void onSave([...lists, name]).then(() => setName(""));
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New list, e.g. Agencies to call" aria-label="New list name" className="min-w-0 flex-1 rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink" />
        <button className={Btn.dark} disabled={busy || !name.trim()}>
          Create list
        </button>
      </form>
      {lists.length === 0 ? (
        <Empty title="No lists yet">Create a list here, or select people in All contacts and choose “Add to list”.</Empty>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lists.map((l) => (
            <li key={l} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4">
              <button className="min-w-0 text-left" onClick={() => onOpen(l)}>
                <p className="truncate font-medium hover:underline">{l}</p>
                <p className="text-sm text-muted">
                  {counts[l] ?? 0} contact{counts[l] === 1 ? "" : "s"}
                </p>
              </button>
              <button
                className="text-sm text-muted hover:text-rose-700"
                disabled={busy}
                onClick={() => {
                  if (confirm(`Delete the list “${l}”? The people stay in Contacts.`)) void onSave(lists.filter((x) => x !== l));
                }}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
