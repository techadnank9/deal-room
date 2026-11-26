// Workspaces, accounts and sessions. One workspace = one company the agent sells for.
// Passwords are scrypt-hashed; sessions are random tokens in an httpOnly cookie.
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db, kvGet, kvSet } from "./db";

export const SESSION_COOKIE = "dr_session";

export type AgentSettings = {
  timezone: string;
  /** Local hour the day's sending starts (sends are spread over the next ~6 hours). */
  launchHour: number;
  /** 0 = Sunday … 6 = Saturday */
  days: number[];
  /** New qualified leads the agent adds per day before it stops searching. */
  dailyLeadTarget: number;
  /** false = every email waits in Approvals; true = sends on schedule without review. */
  autopilot: boolean;
  /** Which signal sources the agent rotates through. */
  signals: { hiring: boolean; funding: boolean; launches: boolean; competitors: boolean; lookalikes: boolean; web: boolean };
  /** Agent on/off. */
  active: boolean;
};

export const DEFAULT_SETTINGS: AgentSettings = {
  timezone: "America/Los_Angeles",
  launchHour: 9,
  days: [1, 2, 3, 4, 5],
  dailyLeadTarget: 15,
  autopilot: false,
  signals: { hiring: true, funding: true, launches: true, competitors: true, lookalikes: true, web: true },
  active: false,
};

export type Plan = "trial" | "starter" | "growth";
export const PLANS: Record<Plan, { name: string; price: number; contactsPerMonth: number; mailboxes: number; agents: number }> = {
  trial: { name: "Free trial", price: 0, contactsPerMonth: 50, mailboxes: 1, agents: 1 },
  starter: { name: "Starter", price: 79, contactsPerMonth: 500, mailboxes: 1, agents: 1 },
  growth: { name: "Growth", price: 199, contactsPerMonth: 2000, mailboxes: 3, agents: 3 },
};

export type Workspace = {
  id: string;
  ownerEmail: string;
  name: string | null;
  url: string | null;
  plan: Plan;
  trialEnds: string | null;
  settings: AgentSettings;
};

type Row = { id: string; owner_email: string; name: string | null; url: string | null; plan: string; trial_ends: string | Date | null; settings: string };

function toWs(r: Row): Workspace {
  let settings: Partial<AgentSettings> = {};
  try {
    settings = JSON.parse(r.settings || "{}");
  } catch {}
  return {
    id: r.id,
    ownerEmail: r.owner_email,
    name: r.name,
    url: r.url,
    plan: (r.plan as Plan) ?? "trial",
    trialEnds: r.trial_ends ? new Date(r.trial_ends).toISOString() : null,
    settings: { ...DEFAULT_SETTINGS, ...settings, signals: { ...DEFAULT_SETTINGS.signals, ...(settings.signals ?? {}) } },
  };
}

function hash(pw: string) {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${scryptSync(pw, salt, 64).toString("hex")}`;
}
function verify(pw: string, stored: string) {
  const [s, h] = stored.split(":");
  if (!s || !h) return false;
  const got = scryptSync(pw, Buffer.from(s, "hex"), 64);
  const want = Buffer.from(h, "hex");
  return got.length === want.length && timingSafeEqual(got, want);
}

export function normalizeEmail(e: string) {
  return e.trim().toLowerCase();
}

export async function signUp(email: string, password: string, name: string, url?: string): Promise<{ token: string; workspace: Workspace }> {
  email = normalizeEmail(email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email.");
  if (password.length < 8) throw new Error("Use at least 8 characters for the password.");
  const d = await db();
  const exists = await d.all<{ email: string }>(`select email from accounts where email = ?`, [email]);
  if (exists.length) throw new Error("That email already has an account. Log in instead.");
  const id = `ws_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const trialEnds = new Date(Date.now() + 14 * 864e5).toISOString();
  await d.exec(`insert into workspaces (id, owner_email, name, url, plan, trial_ends, settings) values (?, ?, ?, ?, 'trial', ?, ?)`, [
    id,
    email,
    null,
    url?.trim() || null,
    trialEnds,
    JSON.stringify(DEFAULT_SETTINGS),
  ]);
  await d.exec(`insert into accounts (email, pass_hash, name, workspace_id) values (?, ?, ?, ?)`, [email, hash(password), name.trim() || null, id]);
  const token = await newSession(email, id);
  return { token, workspace: (await getWorkspace(id))! };
}

export async function logIn(email: string, password: string): Promise<{ token: string; workspace: Workspace }> {
  email = normalizeEmail(email);
  const d = await db();
  const rows = await d.all<{ pass_hash: string; workspace_id: string }>(`select pass_hash, workspace_id from accounts where email = ?`, [email]);
  if (!rows.length || !verify(password, rows[0].pass_hash)) throw new Error("Wrong email or password.");
  const token = await newSession(email, rows[0].workspace_id);
  return { token, workspace: (await getWorkspace(rows[0].workspace_id))! };
}

async function newSession(email: string, workspaceId: string) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + 30 * 864e5).toISOString();
  await (await db()).exec(`insert into auth_sessions (token, email, workspace_id, expires_at) values (?, ?, ?, ?)`, [token, email, workspaceId, expires]);
  return token;
}

export async function logOut(token: string) {
  await (await db()).exec(`delete from auth_sessions where token = ?`, [token]);
}

export async function getWorkspace(id: string): Promise<Workspace | null> {
  const rows = await (await db()).all<Row>(`select id, owner_email, name, url, plan, trial_ends, settings from workspaces where id = ?`, [id]);
  return rows[0] ? toWs(rows[0]) : null;
}

export async function listActiveWorkspaces(): Promise<Workspace[]> {
  const rows = await (await db()).all<Row>(`select id, owner_email, name, url, plan, trial_ends, settings from workspaces`);
  // An expired trial pauses (data kept) until the workspace upgrades.
  const now = Date.now();
  return rows.map(toWs).filter((w) => w.settings.active && w.url && !(w.plan === "trial" && w.trialEnds && new Date(w.trialEnds).getTime() < now));
}

export async function updateWorkspace(id: string, patch: { name?: string; url?: string; plan?: Plan; settings?: Partial<AgentSettings> }): Promise<Workspace> {
  const cur = await getWorkspace(id);
  if (!cur) throw new Error("workspace not found");
  const settings = { ...cur.settings, ...(patch.settings ?? {}), signals: { ...cur.settings.signals, ...(patch.settings?.signals ?? {}) } };
  await (await db()).exec(`update workspaces set name = ?, url = ?, plan = ?, settings = ? where id = ?`, [
    patch.name ?? cur.name,
    patch.url ?? cur.url,
    patch.plan ?? cur.plan,
    JSON.stringify(settings),
    id,
  ]);
  return (await getWorkspace(id))!;
}

/** The signed-in user's session (server components and route handlers). */
export async function currentSession(): Promise<{ email: string; name: string | null; workspace: Workspace } | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const d = await db();
  const rows = await d.all<{ email: string; workspace_id: string; expires_at: string | Date }>(`select email, workspace_id, expires_at from auth_sessions where token = ?`, [token]);
  const s = rows[0];
  if (!s || new Date(s.expires_at).getTime() < Date.now()) return null;
  const ws = await getWorkspace(s.workspace_id);
  if (!ws) return null;
  const acc = await d.all<{ name: string | null }>(`select name from accounts where email = ?`, [s.email]);
  return { email: s.email, name: acc[0]?.name ?? null, workspace: ws };
}

export function sessionCookie(token: string) {
  return { name: SESSION_COOKIE, value: token, httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * 86400 };
}

/** Domain the workspace sells for (the key its team state and Moss memory live under). */
export function workspaceDomain(w: Pick<Workspace, "url">) {
  if (!w.url) return "";
  try {
    return new URL(/^https?:/.test(w.url) ? w.url : `https://${w.url}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return w.url.toLowerCase();
  }
}

/** Today's usage counters for limits and budgets. */
export async function bumpUsage(workspaceId: string, field: "leads" | "enrich" | "sends" | "runs", n = 1) {
  const day = new Date().toISOString().slice(0, 10);
  const d = await db();
  if (d.kind === "pg")
    await d.exec(`insert into usage_daily (workspace_id, day, ${field}) values (?, ?, ?) on conflict (workspace_id, day) do update set ${field} = usage_daily.${field} + excluded.${field}`, [workspaceId, day, n]);
  else await d.exec(`insert into usage_daily (workspace_id, day, ${field}) values (?, ?, ?) on conflict (workspace_id, day) do update set ${field} = ${field} + excluded.${field}`, [workspaceId, day, n]);
}
export async function usageToday(workspaceId: string) {
  const day = new Date().toISOString().slice(0, 10);
  const rows = await (await db()).all<{ leads: number; enrich: number; sends: number; runs: number }>(`select leads, enrich, sends, runs from usage_daily where workspace_id = ? and day = ?`, [workspaceId, day]);
  return rows[0] ?? { leads: 0, enrich: 0, sends: 0, runs: 0 };
}
export async function usageThisMonth(workspaceId: string) {
  const month = new Date().toISOString().slice(0, 7);
  const rows = await (await db()).all<{ enrich: number | string; sends: number | string }>(`select coalesce(sum(enrich),0) as enrich, coalesce(sum(sends),0) as sends from usage_daily where workspace_id = ? and day like ?`, [workspaceId, `${month}%`]);
  return { enrich: Number(rows[0]?.enrich ?? 0), sends: Number(rows[0]?.sends ?? 0) };
}

/**
 * Which company an API request may act on. Signed in: always your own workspace's company.
 * Signed out (public demo): any company that no workspace owns; owned companies are refused.
 */
export async function resolveScope(requested?: string | null): Promise<{ domain: string | undefined; workspace: Workspace | null } | { error: string; status: number }> {
  const s = await currentSession();
  if (s) return { domain: workspaceDomain(s.workspace) || requested || undefined, workspace: s.workspace };
  if (!requested) return { domain: undefined, workspace: null };
  const want = workspaceDomain({ url: requested });
  const rows = await (await db()).all<{ url: string | null }>(`select url from workspaces where url is not null`);
  if (rows.some((r) => workspaceDomain(r) === want)) return { error: "This company belongs to a workspace. Log in to see it.", status: 403 };
  return { domain: requested, workspace: null };
}

/* ---------- API keys (MCP / API access to one workspace) ---------- */

const keyHash = (key: string) => createHash("sha256").update(`dr-key-v1|${key.trim()}`).digest("hex");

/** Make a new key for this workspace (the old one stops working). The key itself is shown once and never stored. */
export async function rotateApiKey(workspaceId: string): Promise<{ key: string; hint: string; createdAt: string }> {
  const old = await kvGet<{ hash: string }>(`apikey-of:${workspaceId}`);
  if (old?.hash) await kvSet(`apikey:${old.hash}`, null);
  const key = `dr_${randomBytes(24).toString("hex")}`;
  const hash = keyHash(key);
  const meta = { hash, hint: key.slice(-4), createdAt: new Date().toISOString() };
  await kvSet(`apikey:${hash}`, { workspaceId });
  await kvSet(`apikey-of:${workspaceId}`, meta);
  return { key, hint: meta.hint, createdAt: meta.createdAt };
}

export async function revokeApiKey(workspaceId: string) {
  const old = await kvGet<{ hash: string }>(`apikey-of:${workspaceId}`);
  if (old?.hash) await kvSet(`apikey:${old.hash}`, null);
  await kvSet(`apikey-of:${workspaceId}`, null);
}

export async function apiKeyInfo(workspaceId: string): Promise<{ hint: string; createdAt: string } | null> {
  const m = await kvGet<{ hint: string; createdAt: string }>(`apikey-of:${workspaceId}`);
  return m?.hint ? { hint: m.hint, createdAt: m.createdAt } : null;
}

export async function workspaceForKey(key: string | null | undefined): Promise<Workspace | null> {
  if (!key?.startsWith("dr_")) return null;
  const hit = await kvGet<{ workspaceId: string }>(`apikey:${keyHash(key)}`);
  return hit?.workspaceId ? getWorkspace(hit.workspaceId) : null;
}

/** The workspace that owns this company domain, if any. */
export async function ownerOfDomain(domain: string): Promise<string | null> {
  const want = workspaceDomain({ url: domain });
  if (!want) return null;
  const rows = await (await db()).all<{ id: string; url: string | null }>(`select id, url from workspaces where url is not null`);
  return rows.find((r) => workspaceDomain(r) === want)?.id ?? null;
}
