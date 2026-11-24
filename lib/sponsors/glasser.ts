import { randomUUID } from "node:crypto";

// Glasser (https://glasser.ai/docs): company + people enrichment for the account brief.
// REST: https://api.glasser.ai, Bearer key, idempotency-key header on every run-creating POST.
// 202 = run still in progress, poll result_url. A COMPLETED run can still carry a provider error.

const BASE = "https://api.glasser.ai";

export function glasserEnabled() {
  return Boolean(process.env.GLASSER_API_KEY);
}

export type Enrichment = {
  employees?: string;
  funding?: string;
  techStack?: string[];
  likelyTitles?: string[];
  people?: { name?: string; title?: string; linkedin?: string; email?: string; previous?: string[] }[];
  industry?: string;
  city?: string;
  revenue?: string;
  founded?: number;
  description?: string;
  latestFunding?: string;
};

type Run = {
  id?: string;
  status?: string;
  result_url?: string;
  output?: Record<string, unknown> | null;
  provider_response?: { http_status?: number; error?: unknown };
};

async function runSolution(path: string, body: Record<string, unknown>): Promise<Run["output"]> {
  const headers = {
    Authorization: `Bearer ${process.env.GLASSER_API_KEY}`,
    "Content-Type": "application/json",
    "idempotency-key": randomUUID(),
  };
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  if (!res.ok && res.status !== 202) throw new Error(`glasser ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  let run = (await res.json()) as Run;
  // Poll while the run is in progress (max ~10s).
  for (let i = 0; i < 10 && run.status && ["QUEUED", "RUNNING"].includes(run.status); i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const url = run.result_url ? `${BASE}${run.result_url}` : `${BASE}/v1/runs/${run.id}`;
    const p = await fetch(url, { headers: { Authorization: headers.Authorization }, signal: AbortSignal.timeout(8000) });
    run = (await p.json()) as Run;
  }
  if (run.provider_response?.error) throw new Error(`glasser provider error: ${JSON.stringify(run.provider_response.error).slice(0, 200)}`);
  return run.output ?? null;
}

function fmtUsd(n: unknown) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return undefined;
  return v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `$${Math.round(v / 1e6)}M` : `$${Math.round(v / 1e3)}K`;
}

export async function enrichCompany(domain: string, titles?: string[]): Promise<{ data: Enrichment; provider: string }> {
  if (!glasserEnabled()) {
    return {
      data: { employees: "unknown (mock)", funding: "unknown (mock)", techStack: [], likelyTitles: ["CFO", "VP Engineering", "Head of Procurement"] },
      provider: "mock",
    };
  }
  const path = "/v1/solutions/gtm/company_intelligence";
  const [enrich, tech, people] = await Promise.allSettled([
    runSolution(path, { action: "enrich", domain }),
    runSolution(path, { action: "tech_stack", domain }),
    runSolution("/v1/solutions/gtm/people_search", {
      action: "search",
      company_domain: domain,
      job_titles: titles?.length ? titles.slice(0, 8) : ["CFO", "VP Finance", "CTO", "VP Engineering", "Head of Procurement", "Procurement Manager"],
      limit: 10,
    }),
  ]);
  const data: Enrichment = {};
  if (enrich.status === "fulfilled" && enrich.value) {
    const o = enrich.value as Record<string, unknown>;
    const min = o.employee_range_min;
    const max = o.employee_range_max;
    data.employees = o.employees ? String(o.employees) : min || max ? `${min ?? "?"}-${max ?? "?"}` : undefined;
    data.funding = fmtUsd(o.total_funding_usd);
    if (typeof o.industry === "string") data.industry = o.industry;
    if (o.city) data.city = [o.city, o.region, o.country].filter(Boolean).join(", ");
    data.revenue = fmtUsd(o.revenue_usd);
    if (o.founded_year) data.founded = Number(o.founded_year);
    if (typeof o.description === "string") data.description = o.description.slice(0, 600);
    if (o.latest_funding_date) data.latestFunding = String(o.latest_funding_date);
  }
  if (tech.status === "fulfilled" && tech.value) {
    const items = ((tech.value as { items?: { name?: string }[] }).items ?? []).map((x) => x.name).filter(Boolean) as string[];
    data.techStack = items.slice(0, 15);
  }
  if (people.status === "fulfilled" && people.value) {
    const items = ((people.value as { items?: Record<string, unknown>[] }).items ?? []).slice(0, 10);
    // Per-person field names are not in the docs we read; take common ones defensively.
    data.people = items.map((p) => ({
      name: (p.name ?? p.full_name ?? [p.first_name, p.last_name].filter(Boolean).join(" ")) as string | undefined,
      title: (p.title ?? p.job_title ?? p.headline) as string | undefined,
      linkedin: (p.linkedin_url ?? p.linkedin ?? p.profile_url) as string | undefined,
      email: (p.email ?? p.work_email) as string | undefined,
      previous: (Array.isArray(p.experience) ? (p.experience as Record<string, unknown>[]).map((x) => String(x.company_name ?? x.company ?? "")).filter(Boolean) : Array.isArray(p.previous_companies) ? (p.previous_companies as string[]) : undefined)?.slice(0, 5),
    }));
    data.likelyTitles = [...new Set(data.people.map((p) => p.title).filter(Boolean) as string[])].slice(0, 6);
  }
  const failures = [enrich, tech, people].filter((r) => r.status === "rejected") as PromiseRejectedResult[];
  for (const f of failures) console.error("[glasser]", f.reason instanceof Error ? f.reason.message : f.reason);
  return { data, provider: failures.length === 3 ? "mock" : "glasser" };
}
