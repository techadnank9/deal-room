import type { SignalHit } from "./types";

export type Ats = "greenhouse" | "lever" | "ashby";
export type AtsJob = { title: string; team?: string; location?: string; url: string; postedAt?: string };
export type AtsJobs = { total: number; jobs: AtsJob[] };
export type AtsBoard = { ats: Ats; slug: string };

const TIMEOUT_MS = 8000;
const ATS_ORDER: Ats[] = ["greenhouse", "ashby", "lever"];

function toIso(v: unknown): string | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const d = new Date(typeof v === "number" ? v : String(v));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

async function getJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

type GreenhouseResp = {
  jobs?: { title?: string; location?: { name?: string }; absolute_url?: string; updated_at?: string; departments?: { name?: string }[] }[];
  meta?: { total?: number };
};
type LeverPosting = {
  text?: string;
  categories?: { team?: string; location?: string; department?: string };
  hostedUrl?: string;
  createdAt?: number;
};
type AshbyResp = {
  jobs?: { title?: string; department?: string; team?: string; location?: string; jobUrl?: string; publishedAt?: string; isListed?: boolean }[];
};

export function boardUrl(ats: Ats, slug: string): string {
  switch (ats) {
    case "greenhouse":
      return `https://job-boards.greenhouse.io/${slug}`;
    case "lever":
      return `https://jobs.lever.co/${slug}`;
    case "ashby":
      return `https://jobs.ashbyhq.com/${slug}`;
  }
}

/** Fetch open roles from a public ATS board. Returns null on 404 / error. */
export async function fetchJobs(ats: Ats, slug: string): Promise<AtsJobs | null> {
  const s = encodeURIComponent(slug);
  if (ats === "greenhouse") {
    const body = (await getJson(`https://boards-api.greenhouse.io/v1/boards/${s}/jobs?content=false`)) as GreenhouseResp | null;
    if (!body || !Array.isArray(body.jobs)) return null;
    const jobs: AtsJob[] = body.jobs.map((j) => ({
      title: (j.title ?? "").trim(),
      team: j.departments?.[0]?.name,
      location: j.location?.name,
      url: j.absolute_url ?? boardUrl(ats, slug),
      postedAt: toIso(j.updated_at),
    }));
    return { total: typeof body.meta?.total === "number" ? body.meta.total : jobs.length, jobs };
  }
  if (ats === "lever") {
    const body = (await getJson(`https://api.lever.co/v0/postings/${s}?mode=json`)) as LeverPosting[] | null;
    if (!Array.isArray(body)) return null;
    const jobs: AtsJob[] = body.map((j) => ({
      title: (j.text ?? "").trim(),
      team: j.categories?.team ?? j.categories?.department,
      location: j.categories?.location,
      url: j.hostedUrl ?? boardUrl(ats, slug),
      postedAt: toIso(j.createdAt),
    }));
    return { total: jobs.length, jobs };
  }
  const body = (await getJson(`https://api.ashbyhq.com/posting-api/job-board/${s}`)) as AshbyResp | null;
  if (!body || !Array.isArray(body.jobs)) return null;
  const jobs: AtsJob[] = body.jobs
    .filter((j) => j.isListed !== false)
    .map((j) => ({
      title: (j.title ?? "").trim(),
      team: j.department ?? j.team,
      location: j.location,
      url: j.jobUrl ?? boardUrl("ashby", slug),
      postedAt: toIso(j.publishedAt),
    }));
  return { total: jobs.length, jobs };
}

/** Slug candidates from a domain: "get-acme.io" -> ["getacme","get-acme","acme"]. */
export function slugCandidates(domain: string): string[] {
  const host = domain
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "");
  const label = host.split(".")[0] ?? "";
  if (!label) return [];
  const out: string[] = [];
  const add = (s: string) => {
    if (s && s.length >= 2 && !out.includes(s)) out.push(s);
  };
  add(label.replace(/-/g, ""));
  add(label);
  const stripped = label.replace(/^(get|try|use|join|go|hello|with)-?/, "").replace(/-?(hq|app|inc|labs|team|io)$/, "");
  add(stripped.replace(/-/g, ""));
  add(stripped);
  return out.slice(0, 4);
}

const boardCache = new Map<string, AtsBoard | null>();
const jobsCache = new Map<string, { at: number; jobs: AtsJobs }>();
const JOBS_TTL_MS = 5 * 60 * 1000;

function cacheJobs(board: AtsBoard, jobs: AtsJobs) {
  jobsCache.set(`${board.ats}:${board.slug}`, { at: Date.now(), jobs });
}

/** Find a company's public ATS board from its domain. Cached per domain (including misses). */
export async function detectBoard(domain: string): Promise<AtsBoard | null> {
  const key = domain.trim().toLowerCase();
  if (boardCache.has(key)) return boardCache.get(key) ?? null;
  for (const slug of slugCandidates(key)) {
    // Probe the three ATSs for this slug in parallel. Companies often leave a stale board
    // behind after migrating (e.g. Ramp: 1 job on Greenhouse, hundreds on Ashby), so take the biggest.
    const results = await Promise.all(ATS_ORDER.map((ats) => fetchJobs(ats, slug)));
    let idx = -1;
    results.forEach((r, i) => {
      if (r && r.total > 0 && (idx < 0 || r.total > (results[idx]?.total ?? 0))) idx = i;
    });
    if (idx >= 0) {
      const board: AtsBoard = { ats: ATS_ORDER[idx], slug };
      boardCache.set(key, board);
      cacheJobs(board, results[idx] as AtsJobs);
      return board;
    }
  }
  boardCache.set(key, null);
  return null;
}

async function jobsFor(board: AtsBoard): Promise<AtsJobs | null> {
  const hit = jobsCache.get(`${board.ats}:${board.slug}`);
  if (hit && Date.now() - hit.at < JOBS_TTL_MS) return hit.jobs;
  const jobs = await fetchJobs(board.ats, board.slug);
  if (jobs) cacheJobs(board, jobs);
  return jobs;
}

function strengthFor(matching: number): number {
  if (matching >= 6) return 0.9;
  if (matching >= 3) return 0.7;
  if (matching >= 1) return 0.4;
  return 0.2;
}

/** Hiring signal: open roles on the company's ATS board, highlighting roles matching keywords. */
export async function hiringSignal(domain: string, company: string, roleKeywords: string[]): Promise<SignalHit | null> {
  const board = await detectBoard(domain);
  if (!board) return null;
  const res = await jobsFor(board);
  if (!res) return null;
  const kws = roleKeywords.map((k) => k.trim().toLowerCase()).filter(Boolean);
  const matches = kws.length ? res.jobs.filter((j) => kws.some((k) => j.title.toLowerCase().includes(k))) : [];
  const matching = matches.length;
  const label = kws.length ? kws.join("/") : "";
  const text =
    matching > 0
      ? `Hiring ${matching} ${label} role${matching === 1 ? "" : "s"} (${res.total} open roles total)`
      : `${res.total} open role${res.total === 1 ? "" : "s"}${label ? `, none matching ${label}` : ""}`;
  return {
    company,
    domain,
    kind: "hiring",
    text,
    sourceUrl: matches[0]?.url ?? boardUrl(board.ats, board.slug),
    at: new Date().toISOString(),
    strength: strengthFor(matching),
    data: {
      ats: board.ats,
      slug: board.slug,
      total: res.total,
      matching,
      titles: matches.slice(0, 20).map((j) => j.title),
    },
  };
}

/** Stable key for storing board snapshots between runs. */
export function snapshotKey(board: AtsBoard): string {
  return `ats:${board.ats}:${board.slug}`;
}

/** Hiring surge: +20% and at least +5 roles vs the previous snapshot. */
export function surge(prevTotal: number, total: number): { surge: boolean; pct: number } {
  const delta = total - prevTotal;
  const pct = prevTotal > 0 ? Math.round((delta / prevTotal) * 1000) / 10 : total > 0 ? 100 : 0;
  return { surge: delta >= 5 && pct >= 20, pct };
}

/** Compare two snapshots of a board. */
export function compare(prev: AtsJobs | null | undefined, next: AtsJobs): { surge: boolean; pct: number; added: string[] } {
  const prevTitles = new Set((prev?.jobs ?? []).map((j) => j.url));
  const added = prev ? next.jobs.filter((j) => !prevTitles.has(j.url)).map((j) => j.title) : [];
  if (!prev) return { surge: false, pct: 0, added };
  return { ...surge(prev.total, next.total), added };
}
