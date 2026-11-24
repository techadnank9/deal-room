import path from "node:path";
import fs from "node:fs";
import type { SessionState } from "./types";

export type EventRow = {
  session_id: string;
  turn: number;
  actor: string;
  event_type: string;
  text?: string | null;
  target?: string | null;
  conviction_before?: number | null;
  conviction_after?: number | null;
  status?: string | null;
  source_url?: string | null;
};

type Driver = {
  kind: "pg" | "sqlite";
  exec(sql: string, params?: unknown[]): Promise<void>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
};

const SQLITE_SCHEMA = `
create table if not exists events (
  id integer primary key autoincrement,
  session_id text not null,
  turn int not null,
  ts text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  actor text not null,
  event_type text not null,
  text text, target text,
  conviction_before int, conviction_after int,
  status text, source_url text
);
create table if not exists sessions (id text primary key, state text not null, updated_at text not null);
create table if not exists kv (k text primary key, v text not null);
`;

const PG_SCHEMA = `
create table if not exists events (
  id bigserial primary key,
  session_id text not null,
  turn int not null,
  ts timestamptz not null default now(),
  actor text not null,
  event_type text not null,
  text text, target text,
  conviction_before int, conviction_after int,
  status text, source_url text
);
create table if not exists sessions (id text primary key, state text not null, updated_at timestamptz not null default now());
create table if not exists kv (k text primary key, v text not null);
`;

export const SQLITE_PATH = process.env.SQLITE_PATH || path.join(process.cwd(), "data", "dealroom.db");

const g = globalThis as unknown as { __dealroomDb?: Promise<Driver> };

async function makeDriver(): Promise<Driver> {
  if (process.env.DATABASE_URL) {
    const { Pool } = await import("pg");
    const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: local ? undefined : { rejectUnauthorized: false }, max: 5 });
    await pool.query(PG_SCHEMA);
    const toPg = (sql: string) => {
      let i = 0;
      return sql.replace(/\?/g, () => `$${++i}`);
    };
    return {
      kind: "pg",
      async exec(sql, params = []) {
        await pool.query(toPg(sql), params);
      },
      async all<T>(sql: string, params: unknown[] = []) {
        const r = await pool.query(toPg(sql), params);
        return r.rows as T[];
      },
    };
  }
  const Database = (await import("better-sqlite3")).default;
  fs.mkdirSync(path.dirname(SQLITE_PATH), { recursive: true });
  const conn = new Database(SQLITE_PATH);
  conn.pragma("journal_mode = WAL");
  conn.exec(SQLITE_SCHEMA);
  return {
    kind: "sqlite",
    async exec(sql, params = []) {
      conn.prepare(sql).run(...(params as never[]));
    },
    async all<T>(sql: string, params: unknown[] = []) {
      return conn.prepare(sql).all(...(params as never[])) as T[];
    },
  };
}

export function db(): Promise<Driver> {
  if (!g.__dealroomDb) g.__dealroomDb = makeDriver();
  return g.__dealroomDb;
}

export async function writeEvents(rows: EventRow[]) {
  const d = await db();
  for (const r of rows) {
    await d.exec(
      `insert into events (session_id, turn, actor, event_type, text, target, conviction_before, conviction_after, status, source_url)
       values (?,?,?,?,?,?,?,?,?,?)`,
      [
        r.session_id, r.turn, r.actor, r.event_type, r.text ?? null, r.target ?? null,
        r.conviction_before ?? null, r.conviction_after ?? null, r.status ?? null, r.source_url ?? null,
      ],
    );
  }
}

export async function readEvents(sessionId: string) {
  const d = await db();
  return d.all<EventRow & { id: number; ts: string }>(
    `select * from events where session_id = ? order by id`,
    [sessionId],
  );
}

export async function saveSession(s: SessionState) {
  const d = await db();
  // Background image generation writes art fields; never let a concurrent save drop them.
  if (!s.backdropUrl || !s.portraits || s.imagesPending) {
    const prev = await loadSession(s.id);
    if (prev) {
      s.backdropUrl ??= prev.backdropUrl;
      s.portraits ??= prev.portraits;
      if (prev.imagesPending === false) s.imagesPending = false;
    }
  }
  const now = new Date().toISOString();
  if (d.kind === "pg") {
    await d.exec(
      `insert into sessions (id, state, updated_at) values (?,?,?) on conflict (id) do update set state = excluded.state, updated_at = excluded.updated_at`,
      [s.id, JSON.stringify(s), now],
    );
  } else {
    await d.exec(`insert or replace into sessions (id, state, updated_at) values (?,?,?)`, [s.id, JSON.stringify(s), now]);
  }
}

export async function loadSession(id: string): Promise<SessionState | null> {
  const d = await db();
  const rows = await d.all<{ state: string }>(`select state from sessions where id = ?`, [id]);
  return rows[0] ? (JSON.parse(rows[0].state) as SessionState) : null;
}

export async function listSessions(): Promise<SessionState[]> {
  const d = await db();
  const rows = await d.all<{ state: string }>(`select state from sessions order by updated_at desc limit 50`);
  return rows.map((r) => JSON.parse(r.state) as SessionState);
}

/** Small JSON store (team leads, team chat). */
export async function kvGet<T>(k: string): Promise<T | null> {
  const d = await db();
  const rows = await d.all<{ v: string }>(`select v from kv where k = ?`, [k]);
  return rows[0] ? (JSON.parse(rows[0].v) as T) : null;
}

export async function kvSet(k: string, v: unknown) {
  const d = await db();
  if (d.kind === "pg") await d.exec(`insert into kv (k, v) values (?, ?) on conflict (k) do update set v = excluded.v`, [k, JSON.stringify(v)]);
  else await d.exec(`insert or replace into kv (k, v) values (?, ?)`, [k, JSON.stringify(v)]);
}
