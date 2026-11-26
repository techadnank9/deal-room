"use client";
// Preview 5 sample leads for the current targeting and mark each one. Good fits join the pipeline;
// "not a fit" marks (with a reason) teach the agent what to avoid.
import { useState } from "react";
import { Btn, Pill, host, post } from "./ui";
import type { Prospect } from "@/lib/gtm/prospect";

const REASONS = ["Wrong company type", "Wrong size or location", "Competitor", "Signal not relevant"];

export default function PreviewLeads({ onChange }: { onChange?: () => void | Promise<void> }) {
  const [rows, setRows] = useState<(Prospect & { verdict?: string })[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [asking, setAsking] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setBusy("load");
    setErr(null);
    setRows(null);
    try {
      const r = await post<{ results: Prospect[] }>("/api/gtm", { action: "preview" });
      setRows(r.results);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load a preview");
    } finally {
      setBusy(null);
    }
  }
  async function judge(i: number, fit: "good" | "bad", reason?: string) {
    if (!rows) return;
    setBusy(String(i));
    try {
      await post("/api/gtm", { action: "judge", prospect: rows[i], fit, reason });
      setRows(rows.map((r, j) => (j === i ? { ...r, verdict: fit === "good" ? "Added to your agent" : `Not a fit${reason ? `: ${reason}` : ""}` } : r)));
      setAsking(null);
      await onChange?.();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">Preview leads</p>
          <p className="text-sm text-muted">See 5 companies your targeting finds right now. Mark each one: the agent learns from every mark.</p>
        </div>
        <button className={Btn.ghost} onClick={() => void load()} disabled={busy !== null}>
          {busy === "load" ? "Finding…" : rows ? "Show 5 more" : "Preview 5 leads"}
        </button>
      </div>
      {err && <p className="mt-3 text-sm text-rose-700">{err}</p>}
      {busy === "load" && <p className="mt-3 text-sm text-muted">Searching the web for companies that match… about 20 seconds.</p>}
      {rows && rows.length === 0 && <p className="mt-3 text-sm text-muted">Nothing new this time. Try again, or widen the targeting.</p>}
      {rows && rows.length > 0 && (
        <ul className="mt-4 divide-y divide-line">
          {rows.map((r, i) => (
            <li key={`${r.company}-${i}`} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {r.company} {r.domain && <span className="text-sm font-normal text-muted">{r.domain}</span>}
                </p>
                <p className="text-sm">{r.signal}</p>
                <p className="text-xs text-muted">
                  {r.why}{" "}
                  <a href={r.sourceUrl} target="_blank" rel="noreferrer" className="underline">
                    {host(r.sourceUrl)}
                  </a>
                </p>
              </div>
              {r.verdict ? (
                <Pill tone={r.verdict.startsWith("Added") ? "green" : "red"}>{r.verdict}</Pill>
              ) : asking === i ? (
                <div className="flex flex-wrap gap-1">
                  {REASONS.map((x) => (
                    <button key={x} disabled={busy !== null} onClick={() => void judge(i, "bad", x)} className="rounded-full border border-line px-2.5 py-1 text-xs hover:border-rose-400">
                      {x}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex gap-1.5">
                  <button disabled={busy !== null} onClick={() => void judge(i, "good")} className="rounded-full border border-line px-3 py-1 text-xs hover:border-emerald-500">
                    👍 Good fit
                  </button>
                  <button disabled={busy !== null} onClick={() => setAsking(i)} className="rounded-full border border-line px-3 py-1 text-xs hover:border-rose-400">
                    👎 Not a fit
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
