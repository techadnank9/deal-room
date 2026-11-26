"use client";
// Agent → Trace: every run the agent did, with each step, AI call, tool call and send inside it.
import { useState } from "react";
import { ago, usePoll } from "./ui";

type Row = { id: string; run_id: string | null; kind: string; label: string; ms: number; ok: boolean | number; input: string | null; output: string | null; error: string | null; at: string };
const KIND: Record<string, string> = { run: "Run", step: "Step", llm: "AI call", tool: "MCP tool", send: "Email", error: "Error" };
const TONE: Record<string, string> = { run: "bg-ink text-white", step: "bg-line/80", llm: "bg-accent/12 text-accent", tool: "bg-sky-100 text-sky-800", send: "bg-emerald-100 text-emerald-800", error: "bg-rose-100 text-rose-700" };
/** Milliseconds since an ISO time (kept out of render so the component stays pure). */
function since(iso?: string) {
  return iso ? Date.now() - new Date(iso).getTime() : null;
}
const secs = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

function pretty(s: string | null) {
  if (!s) return "";
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

function Item({ r }: { r: Row }) {
  const [open, setOpen] = useState(false);
  const bad = r.ok === false || r.ok === 0;
  return (
    <li className="border-b border-line last:border-b-0">
      <button className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-paper/60" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className={`w-20 shrink-0 rounded-md px-2 py-0.5 text-center text-[11px] font-medium ${bad ? TONE.error : TONE[r.kind] ?? TONE.step}`}>{bad ? "Failed" : KIND[r.kind] ?? r.kind}</span>
        <span className="min-w-0 flex-1 truncate">{r.label}</span>
        <span className="shrink-0 text-xs tabular-nums text-muted">{secs(r.ms)}</span>
      </button>
      {open && (
        <div className="grid gap-3 bg-paper/50 px-4 py-3 text-xs md:grid-cols-2">
          {r.error && <p className="text-rose-700 md:col-span-2">{r.error}</p>}
          <div>
            <p className="mb-1 font-medium text-muted">Input</p>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-white p-2">{pretty(r.input) || "—"}</pre>
          </div>
          <div>
            <p className="mb-1 font-medium text-muted">Output</p>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-white p-2">{pretty(r.output) || "—"}</pre>
          </div>
        </div>
      )}
    </li>
  );
}

function RunDetail({ runId }: { runId: string }) {
  const { data } = usePoll<{ traces: Row[] }>(`/api/traces?run=${runId}`, 0);
  if (!data) return <p className="px-4 py-3 text-sm text-muted">Loading…</p>;
  const inner = data.traces.filter((r) => r.kind !== "run");
  if (!inner.length) return <p className="px-4 py-3 text-sm text-muted">No steps recorded.</p>;
  return (
    <ul>
      {inner.map((r) => (
        <Item key={r.id} r={r} />
      ))}
    </ul>
  );
}

export default function TraceView() {
  const { data, error } = usePoll<{ traces: Row[]; heartbeat: { at: string } | null }>("/api/traces", 20000);
  const [open, setOpen] = useState<string | null>(null);
  if (error && !data) return <p className="text-sm text-rose-700">{error}</p>;
  if (!data) return <p className="text-sm text-muted">Loading trace…</p>;
  const runs = data.traces.filter((r) => r.kind === "run");
  const loose = data.traces.filter((r) => r.kind !== "run" && !r.run_id);
  const beat = since(data.heartbeat?.at);
  return (
    <div className="max-w-[1000px] space-y-4">
      <div className={`card flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm ${beat !== null && beat < 5 * 60e3 ? "" : "border-rose-300"}`}>
        <span>
          <span className={`mr-2 inline-block h-2 w-2 rounded-full ${beat !== null && beat < 5 * 60e3 ? "bg-emerald-500" : "bg-rose-500"}`} />
          {beat === null ? "The scheduler has not checked in yet." : beat < 5 * 60e3 ? `The agent scheduler is running (checked in ${ago(data.heartbeat!.at)}).` : `The scheduler last checked in ${ago(data.heartbeat!.at)}. It should check in every minute.`}
        </span>
        <span className="text-xs text-muted">Kept for 14 days. Click a run to see each step, AI call and email.</span>
      </div>
      {!runs.length && !loose.length ? (
        <div className="card px-6 py-10 text-center text-sm text-muted">No runs yet. The agent searches 3 times a day inside your sending window; every run shows up here.</div>
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {runs.map((r) => (
            <li key={r.id}>
              <button className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-paper/60" onClick={() => setOpen(open === r.run_id ? null : r.run_id)} aria-expanded={open === r.run_id}>
                <span className={`h-2 w-2 shrink-0 rounded-full ${r.ok === false || r.ok === 0 ? "bg-rose-500" : "bg-emerald-500"}`} />
                <span className="flex-1 font-medium">{r.label}</span>
                <span className="text-xs text-muted">{ago(r.at)}</span>
                <span className="w-16 text-right text-xs tabular-nums text-muted">{secs(r.ms)}</span>
              </button>
              {open === r.run_id && r.run_id && (
                <div className="border-t border-line">
                  <RunDetail runId={r.run_id} />
                </div>
              )}
            </li>
          ))}
          {loose.slice(0, 50).map((r) => (
            <Item key={r.id} r={r} />
          ))}
        </ul>
      )}
    </div>
  );
}
