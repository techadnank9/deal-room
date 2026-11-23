import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SQLITE_PATH } from "./db";

// Bruin turns raw session events into scorecard and trend tables (with quality checks).
// Pipeline: bruin/deal_room. Source: the app's events table (SQLite or Postgres) via an ingestr asset.
// Output: DuckDB at data/bruin.duckdb, read by the scorecard and history pages.

export type BruinResult = { ran: boolean; ok: boolean; output: string; ms?: number };

const ROOT = process.cwd();
const PG = Boolean(process.env.DATABASE_URL);
// Postgres mode (Supabase): pg.sql assets build marts inside the same database; this is the pipeline Bruin Cloud runs.
const PIPELINE = path.join(ROOT, "bruin", PG ? "deal_room_pg" : "deal_room");
const CONFIG = path.join(ROOT, "bruin", ".bruin.yml");
export const DUCKDB_PATH = process.env.BRUIN_DUCKDB_PATH || path.join(ROOT, "data", "bruin.duckdb");

function bruinBin() {
  const candidates = [process.env.BRUIN_BIN, path.join(os.homedir(), ".local", "bin", "bruin"), "/usr/local/bin/bruin"].filter(Boolean) as string[];
  return candidates.find((c) => fs.existsSync(c)) ?? "bruin";
}

function writeConfig() {
  let source: string;
  if (process.env.DATABASE_URL) {
    const u = new URL(process.env.DATABASE_URL);
    source = `      postgres:
        - name: "deal-room-pg"
          username: "${decodeURIComponent(u.username)}"
          password: "${decodeURIComponent(u.password)}"
          host: "${u.hostname}"
          port: ${u.port || 5432}
          database: "${u.pathname.slice(1)}"
          ssl_mode: "${u.searchParams.get("sslmode") || "require"}"`;
    fs.writeFileSync(CONFIG, `default_environment: default\nenvironments:\n  default:\n    connections:\n${source}\n`);
    return;
  } else {
    source = `      sqlite:
        - name: "app-db"
          path: "${SQLITE_PATH}"`;
  }
  const yml = `default_environment: default
environments:
  default:
    connections:
      duckdb:
        - name: "duckdb-default"
          path: "${DUCKDB_PATH}"
${source}
`;
  fs.writeFileSync(CONFIG, yml);
}

const g = globalThis as unknown as { __bruinChain?: Promise<BruinResult>; __bruinLast?: BruinResult & { at: number } };

function runOnce(): Promise<BruinResult> {
  writeConfig();
  const t0 = Date.now();
  return new Promise((resolve) => {
    execFile(bruinBin(), ["run", "--config-file", CONFIG, PIPELINE], { cwd: path.join(ROOT, "bruin"), timeout: 120000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      const output = `${stdout}\n${stderr}`;
      const summary = output.split("\n").filter((l) => /PASS|FAIL|succeeded|failed|Quality checks|Assets executed/.test(l)).join("\n");
      const res: BruinResult = { ran: true, ok: !err, output: summary || output.slice(-2000), ms: Date.now() - t0 };
      g.__bruinLast = { ...res, at: Date.now() };
      if (err) console.error("[bruin] pipeline failed:\n", output.slice(-3000));
      resolve(res);
    });
  });
}

/** Runs are serialized: DuckDB allows one writer. */
export function runBruin(): Promise<BruinResult> {
  const prev = g.__bruinChain ?? Promise.resolve({ ran: false, ok: true, output: "" });
  const next = prev.then(runOnce, runOnce);
  g.__bruinChain = next;
  return next;
}

export function lastBruinRun() {
  return g.__bruinLast ?? null;
}

async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[] | null> {
  if (PG) {
    const { db } = await import("./db");
    try {
      const d = await db();
      return await d.all<T>(sql, params);
    } catch (err) {
      console.error("[bruin] pg read failed:", err instanceof Error ? err.message : err);
      return null;
    }
  }
  if (!fs.existsSync(DUCKDB_PATH)) return null;
  const { DuckDBInstance } = await import("@duckdb/node-api");
  let instance;
  try {
    instance = await DuckDBInstance.create(DUCKDB_PATH, { access_mode: "READ_ONLY" });
  } catch {
    return null; // writer holds the lock while the pipeline runs
  }
  const conn = await instance.connect();
  try {
    const prepared = await conn.prepare(sql);
    params.forEach((p, i) => prepared.bindVarchar(i + 1, String(p)));
    const reader = await prepared.runAndReadAll();
    return reader.getRowObjectsJson() as T[];
  } catch (err) {
    console.error("[bruin] read failed:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    conn.closeSync();
    instance.closeSync();
  }
}

/** Scorecard tables for one session, produced by the Bruin pipeline. null until the pipeline has run for it. */
export async function readScorecard(sessionId: string) {
  const card = await query(`select * from mart.session_scorecard where session_id = ?`, [sessionId]);
  if (!card || card.length === 0) return null;
  const [timeline, claims, objections] = await Promise.all([
    query(`select turn, actor, conviction_after, delta, objection_type, reason from mart.conviction_timeline where session_id = ? order by turn, actor`, [sessionId]),
    query(`select turn, claim, status, note, source_url from mart.claim_outcomes where session_id = ? order by turn`, [sessionId]),
    query(`select objection_type, times_raised, avg_conviction_delta from mart.objections_by_type where session_id = ? order by times_raised desc`, [sessionId]),
  ]);
  return { scorecard: card[0], timeline: timeline ?? [], claims: claims ?? [], objections: objections ?? [] };
}

/** Cross-session trends for the history page. */
export async function readTrends() {
  const [objections, sessions, claims] = await Promise.all([
    query(`select objection_type, times_raised, sessions, avg_conviction_delta, loss_rate from mart.user_trends`),
    query(`select session_id, company, buys, result, turns, started_at as created_at, claims_verified, claims_failed, whispers from mart.session_scorecard order by started_at desc limit 30`),
    query(`select status, count(*) as n from mart.claim_outcomes group by status`),
  ]);
  if (!objections || !sessions) return null;
  return { source: "Bruin pipeline (mart.user_trends, mart.session_scorecard, mart.claim_outcomes)", objections, sessions, claims: claims ?? [] };
}
