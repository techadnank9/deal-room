"use client";
// Search: describe who you want in plain words. The agent turns it into filters, searches the live web,
// and lists companies with the fact that made them a fit. Add the good ones; the agent researches and writes to them.
import Link from "next/link";
import { useState } from "react";
import { Btn, Empty, Pill, host, post } from "@/components/app/ui";
import type { Prospect, ProspectFilters } from "@/lib/gtm/prospect";

const EXAMPLES = [
  "Founders of startups that just launched an AI-built web app",
  "CTOs at seed-stage SaaS companies that are hiring engineers",
  "App agencies that build client projects with Lovable or Bolt",
  "Engineering leaders at companies that recently raised a Series A",
];
const KIND_LABEL: Record<string, string> = {
  funding: "Raised funds",
  hiring: "Hiring",
  launch: "Launched",
  exec_hire: "New leader",
  tech_change: "Changed tools",
  expansion: "Expanding",
  other: "In the news",
};
const FILTER_LABEL: Record<keyof ProspectFilters, string> = {
  titles: "Job titles",
  industries: "Industries",
  sizes: "Company size",
  locations: "Locations",
  signals: "Signals",
  keywords: "Keywords",
};

type Result = { filters: ProspectFilters; results: Prospect[]; searched: string[] };

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pick, setPick] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<string | null>(null);

  async function run(text = q) {
    const query = text.trim();
    if (!query || busy) return;
    setQ(query);
    setBusy(true);
    setErr(null);
    setAdded(null);
    setPick(new Set());
    try {
      const r = await post<Result>("/api/gtm", { action: "prospect", q: query });
      setRes(r);
      setPick(new Set(r.results.map((x, i) => (x.known ? -1 : i)).filter((i) => i >= 0)));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Search failed");
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!res || !pick.size) return;
    setAdding(true);
    setErr(null);
    try {
      const chosen = res.results.filter((_, i) => pick.has(i));
      const r = await post<{ added: number }>("/api/gtm", { action: "addProspects", prospects: chosen });
      setAdded(r.added ? `Added ${r.added} compan${r.added === 1 ? "y" : "ies"}. Your agent is finding the right people and their emails now.` : "Those companies are already in your pipeline.");
      setRes({ ...res, results: res.results.map((x, i) => (pick.has(i) ? { ...x, known: true } : x)) });
      setPick(new Set());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add them");
    } finally {
      setAdding(false);
    }
  }

  function exportCsv() {
    if (!res) return;
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [["Company", "Domain", "Signal", "Why", "Source"], ...res.results.map((r) => [r.company, r.domain, r.signal, r.why, r.sourceUrl])];
    const blob = new Blob([rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `search-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const filters = res ? (Object.keys(FILTER_LABEL) as (keyof ProspectFilters)[]).filter((k) => res.filters[k]?.length) : [];
  const selectable = res?.results.map((x, i) => (x.known ? -1 : i)).filter((i) => i >= 0) ?? [];

  return (
    <div className="px-4 py-6 md:px-8">
      <div className="mx-auto max-w-[1000px]">
        <div className={res || busy ? "mb-6" : "mx-auto mt-[8vh] max-w-[720px] text-center"}>
          <h1 className={`font-semibold tracking-tight ${res || busy ? "text-2xl" : "text-3xl"}`}>
            Who are you looking for? <span className="align-middle text-xs font-medium text-muted">Beta</span>
          </h1>
          {!res && !busy && <p className="mt-2 text-muted">Describe your audience in plain words. The agent turns it into filters, searches the web for companies showing that situation right now, and tells you why each one fits.</p>}
          <form
            className="mt-5 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run();
            }}
          >
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="e.g. Founders of startups that just launched an AI-built web app"
              aria-label="Describe who you are looking for"
              className="min-w-0 flex-1 rounded-xl border border-line bg-white px-4 py-3 text-sm outline-none focus:border-ink"
            />
            <button className={Btn.primary} disabled={busy || !q.trim()}>
              {busy ? "Searching…" : "Search"}
            </button>
          </form>
          {!res && !busy && (
            <div className="mt-6 text-left">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Try</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {EXAMPLES.map((x) => (
                  <button key={x} onClick={() => void run(x)} className="rounded-xl border border-line bg-white px-4 py-3 text-left text-sm hover:border-ink">
                    {x}
                  </button>
                ))}
              </div>
              <form
                className="mt-6 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-white p-3 text-sm"
                onSubmit={(e) => {
                  e.preventDefault();
                  const d = new FormData(e.currentTarget).get("like")?.toString().trim();
                  if (d) void run(`Companies similar to ${d} (same kind of product, customers and size), showing a buying signal right now`);
                }}
              >
                <span className="font-medium">Lookalikes:</span>
                <span className="text-muted">find companies like your best customer</span>
                <input name="like" placeholder="customer.com" aria-label="Your best customer's website" className="min-w-[160px] flex-1 rounded-lg border border-line px-2.5 py-1.5 outline-none focus:border-ink" />
                <button className={Btn.dark}>Find lookalikes</button>
              </form>
              <p className="mt-6 text-center text-sm text-muted">
                Want this every day without asking?{" "}
                <Link href="/app/agent?tab=sources" className="font-medium text-ink underline underline-offset-2">
                  Your agent already searches 3 times a day →
                </Link>
              </p>
            </div>
          )}
        </div>

        {err && <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{err}</p>}

        {busy && (
          <div className="rounded-2xl border border-line bg-white px-6 py-12 text-center text-sm text-muted">
            Turning that into filters and searching the web… this takes about 20 seconds.
          </div>
        )}

        {res && !busy && (
          <>
            {filters.length > 0 && (
              <section className="mb-4 rounded-2xl border border-line bg-white p-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Filters the agent used</p>
                <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                  {filters.map((k) => (
                    <div key={k} className="flex flex-wrap items-center gap-1.5">
                      <span className="text-muted">{FILTER_LABEL[k]}:</span>
                      {res.filters[k].map((v) => (
                        <Pill key={v}>{v}</Pill>
                      ))}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {res.results.length === 0 ? (
              <Empty title="No matching companies this time">Try naming the situation (just raised, launched, hiring) or the kind of company more precisely.</Empty>
            ) : (
              <>
                <div className="sticky top-14 z-10 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white/95 px-4 py-2.5 backdrop-blur md:top-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectable.length > 0 && selectable.every((i) => pick.has(i))}
                      onChange={(e) => setPick(e.target.checked ? new Set(selectable) : new Set())}
                    />
                    {pick.size ? `${pick.size} selected` : `${res.results.length} companies found`}
                  </label>
                  <span className="flex gap-2">
                  <button className={Btn.ghost} onClick={exportCsv}>
                    Export CSV
                  </button>
                  <button className={Btn.primary} disabled={!pick.size || adding} onClick={() => void add()}>
                    {adding ? "Adding…" : `Add to my agent${pick.size ? ` (${pick.size})` : ""}`}
                  </button>
                  </span>
                </div>
                {added && <p className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{added}</p>}
                <ul className="space-y-2">
                  {res.results.map((r, i) => (
                    <li key={`${r.company}-${i}`} className={`flex gap-3 rounded-2xl border bg-white p-4 ${pick.has(i) ? "border-ink" : "border-line"}`}>
                      <input
                        type="checkbox"
                        className="mt-1"
                        aria-label={`Select ${r.company}`}
                        disabled={r.known}
                        checked={pick.has(i)}
                        onChange={(e) => {
                          const n = new Set(pick);
                          if (e.target.checked) n.add(i);
                          else n.delete(i);
                          setPick(n);
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{r.company}</p>
                          {r.domain && <span className="text-sm text-muted">{r.domain}</span>}
                          <Pill tone="accent">{KIND_LABEL[r.kind] ?? "Signal"}</Pill>
                          {r.known && <Pill tone="green">In your pipeline</Pill>}
                        </div>
                        <p className="mt-1 text-sm">{r.signal}</p>
                        <p className="mt-1 text-sm text-muted">{r.why}</p>
                        <a href={r.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-muted underline underline-offset-2 hover:text-ink">
                          Source: {host(r.sourceUrl)}
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-muted">Searched: {res.searched.join(" · ")}</p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
