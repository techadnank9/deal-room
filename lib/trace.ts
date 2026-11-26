// Agent tracing: every run, step, AI call, tool call and send, stored per company and shown in Agent → Trace.
// Optional export to Langfuse when LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are set (LANGFUSE_HOST optional).
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { db } from "./db";

export type TraceKind = "run" | "step" | "llm" | "tool" | "send" | "error";
type Ctx = { runId: string; name: string; children: number };
const runScope = new AsyncLocalStorage<Ctx>();

// The company scope lives in agents/team (which imports llm, which imports this file): it registers a getter here.
let companyOf: () => string = () => "";
export function setCompanyGetter(fn: () => string) {
  companyOf = fn;
}

const clip = (v: unknown, n = 4000) => {
  if (v === undefined || v === null) return null;
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > n ? `${s.slice(0, n)}…` : s;
};

let lastPrune = 0;
export async function recordTrace(t: { kind: TraceKind; label: string; ms?: number; ok?: boolean; input?: unknown; output?: unknown; error?: string; runId?: string }) {
  const ctx = runScope.getStore();
  if (ctx && t.kind !== "run") ctx.children++;
  const row = {
    id: `tr_${randomUUID().slice(0, 12)}`,
    domain: companyOf() || "none",
    run_id: t.runId ?? ctx?.runId ?? null,
    kind: t.kind,
    label: t.label.slice(0, 200),
    ms: Math.round(t.ms ?? 0),
    ok: t.ok === false ? 0 : 1,
    input: clip(t.input),
    output: clip(t.output),
    error: t.error ? t.error.slice(0, 1000) : null,
    at: new Date().toISOString(),
  };
  try {
    const d = await db();
    await d.exec(`insert into traces (id, domain, run_id, kind, label, ms, ok, input, output, error, at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      row.id,
      row.domain,
      row.run_id,
      row.kind,
      row.label,
      row.ms,
      d.kind === "pg" ? row.ok === 1 : row.ok,
      row.input,
      row.output,
      row.error,
      row.at,
    ]);
    if (Date.now() - lastPrune > 3600e3) {
      lastPrune = Date.now();
      await d.exec(`delete from traces where at < ?`, [new Date(Date.now() - 14 * 864e5).toISOString()]);
    }
  } catch (e) {
    console.error("[trace]", e instanceof Error ? e.message : e);
  }
  void toLangfuse(row);
}

/** Run fn as one traced run (e.g. one agent tick for one company). Everything inside links to it. */
export async function withRun<T>(name: string, fn: () => Promise<T>, opts: { quiet?: boolean } = {}): Promise<T> {
  const runId = `run_${randomUUID().slice(0, 10)}`;
  const t0 = Date.now();
  const ctx: Ctx = { runId, name, children: 0 };
  return runScope.run(ctx, async () => {
    try {
      const out = await fn();
      if (opts.quiet && ctx.children === 0) return out; // nothing happened: keep the trace list clean
      await recordTrace({ kind: "run", label: name, ms: Date.now() - t0, output: typeof out === "object" ? out : { result: out }, runId });
      return out;
    } catch (e) {
      await recordTrace({ kind: "run", label: name, ms: Date.now() - t0, ok: false, error: e instanceof Error ? e.message : String(e), runId });
      throw e;
    }
  });
}

/** Time one step inside a run. */
export async function step<T>(label: string, fn: () => Promise<T>, input?: unknown): Promise<T> {
  const t0 = Date.now();
  try {
    const out = await fn();
    await recordTrace({ kind: "step", label, ms: Date.now() - t0, input, output: summarize(out) });
    return out;
  } catch (e) {
    await recordTrace({ kind: "step", label, ms: Date.now() - t0, ok: false, input, error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

function summarize(v: unknown): unknown {
  if (Array.isArray(v)) return { count: v.length };
  if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") return { result: v };
  return v === undefined ? null : { done: true };
}

export type TraceRow = { id: string; domain: string; run_id: string | null; kind: TraceKind; label: string; ms: number; ok: boolean | number; input: string | null; output: string | null; error: string | null; at: string | Date };

export async function listTraces(domain: string, opts: { runId?: string; limit?: number } = {}): Promise<TraceRow[]> {
  const d = await db();
  if (opts.runId) return d.all<TraceRow>(`select * from traces where domain = ? and run_id = ? order by at asc limit 500`, [domain, opts.runId]);
  return d.all<TraceRow>(`select * from traces where domain = ? order by at desc limit ?`, [domain, opts.limit ?? 200]);
}

/* ---------- optional Langfuse export ---------- */

async function toLangfuse(row: { id: string; domain: string; run_id: string | null; kind: string; label: string; ms: number; ok: number; input: string | null; output: string | null; error: string | null; at: string }) {
  const pk = process.env.LANGFUSE_PUBLIC_KEY;
  const sk = process.env.LANGFUSE_SECRET_KEY;
  if (!pk || !sk) return;
  const host = process.env.LANGFUSE_HOST || "https://cloud.langfuse.com";
  const traceId = row.run_id ?? row.id;
  const start = new Date(new Date(row.at).getTime() - row.ms).toISOString();
  const batch = [
    { id: randomUUID(), type: "trace-create", timestamp: row.at, body: { id: traceId, name: row.kind === "run" ? row.label : undefined, userId: row.domain, tags: [row.domain] } },
    {
      id: randomUUID(),
      type: row.kind === "llm" ? "generation-create" : "span-create",
      timestamp: row.at,
      body: { id: row.id, traceId, name: row.label, startTime: start, endTime: row.at, input: row.input, output: row.output, level: row.ok ? "DEFAULT" : "ERROR", statusMessage: row.error ?? undefined },
    },
  ];
  await fetch(`${host}/api/public/ingestion`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${Buffer.from(`${pk}:${sk}`).toString("base64")}` },
    body: JSON.stringify({ batch }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => {});
}
