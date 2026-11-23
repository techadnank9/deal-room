import type { ResearchSource } from "../types";

// Telem (https://docs.telem.ai): account research at session start + live claim checks.
// REST: POST https://router.telem.ai/v1/search and /v1/fetch, Bearer tlm_ key.
// Fallback when TELEM_API_KEY is missing or a call fails: fetch the homepage directly.

const BASE = "https://router.telem.ai";

export function telemEnabled() {
  return Boolean(process.env.TELEM_API_KEY);
}

function normalizeUrl(url: string) {
  const u = url.trim();
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

export function domainOf(url: string) {
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0];
  }
}

async function telemPost<T>(path: string, body: unknown, timeoutMs = 15000): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.TELEM_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`telem ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

type SearchResp = {
  preprocessor_runs?: { preprocessor_name?: string; output_payload?: { results?: { url: string; title?: string; summary?: string; excerpt?: string }[] } }[];
};
type FetchResp = {
  preprocessor_runs?: {
    preprocessor_name?: string;
    output_payload?: { fetched_results?: { url: string; status?: string; title?: string; content?: string }[] };
  }[];
};

async function telemSearch(query: string, num = 4): Promise<ResearchSource[]> {
  const r = await telemPost<SearchResp>("/v1/search", { user_input: { query }, search: { auto_routing: "accuracy", num_results: num } });
  const out: ResearchSource[] = [];
  for (const run of r.preprocessor_runs ?? []) {
    for (const x of run.output_payload?.results ?? []) {
      if (!x.url || out.some((o) => o.url === x.url)) continue;
      out.push({ title: x.title || x.url, url: x.url, snippet: (x.summary || x.excerpt || "").slice(0, 700) });
    }
  }
  return out;
}

async function telemFetch(urls: string[]): Promise<ResearchSource[]> {
  const r = await telemPost<FetchResp>("/v1/fetch", { urls: urls.slice(0, 5), options: { tier: "default" } });
  const out: ResearchSource[] = [];
  for (const run of r.preprocessor_runs ?? []) {
    for (const x of run.output_payload?.fetched_results ?? []) {
      if (!x.content) continue;
      out.push({ title: x.title || x.url, url: x.url, snippet: x.content.replace(/\s+/g, " ").slice(0, 1500) });
    }
  }
  return out;
}

function pick(html: string, re: RegExp) {
  const m = html.match(re);
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

async function fetchHomepage(url: string): Promise<ResearchSource[]> {
  const target = normalizeUrl(url);
  try {
    const res = await fetch(target, {
      headers: { "user-agent": "Mozilla/5.0 (DealRoom research bot)" },
      signal: AbortSignal.timeout(6000),
    });
    const html = await res.text();
    const title = pick(html, /<title[^>]*>([^<]*)<\/title>/i);
    const desc =
      pick(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ||
      pick(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i);
    const headings = [...html.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi)]
      .map((m) => m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim())
      .filter((t) => t.length > 3 && t.length < 160)
      .filter((t, i, a) => a.indexOf(t) === i && !(desc && desc.includes(t)))
      .slice(0, 6);
    return [{ title: title || domainOf(url), url: target, snippet: [desc, ...headings].filter(Boolean).join(" | ").slice(0, 900) }];
  } catch {
    return [{ title: domainOf(url), url: target, snippet: "" }];
  }
}

/** Company site, recent news, job posts. */
export async function researchAccount(url: string): Promise<{ sources: ResearchSource[]; provider: string }> {
  if (!telemEnabled()) return { sources: await fetchHomepage(url), provider: "fallback:homepage-fetch" };
  const domain = domainOf(url);
  const name = domain.split(".")[0];
  try {
    const tag = (k: string) => (xs: ResearchSource[]) => xs.map((x) => ({ ...x, kind: k }));
    const [site, news, jobs, money] = await Promise.all([
      telemFetch([normalizeUrl(url)]).then(tag("site")).catch(() => [] as ResearchSource[]),
      telemSearch(`${name} ${domain} news 2026`, 4).then(tag("news")).catch(() => []),
      telemSearch(`${name} ${domain} hiring jobs engineering`, 3).then(tag("hiring")).catch(() => []),
      telemSearch(`${name} funding revenue customers`, 3).then(tag("funding")).catch(() => []),
    ]);
    const all = [...site, ...jobs, ...money, ...news].filter((s, i, a) => a.findIndex((x) => x.url === s.url) === i).slice(0, 12);
    if (!all.length) throw new Error("telem returned no research");
    return { sources: all, provider: "telem" };
  } catch (err) {
    console.error("[telem] research failed, falling back:", err instanceof Error ? err.message : err);
    return { sources: await fetchHomepage(url), provider: "fallback:homepage-fetch" };
  }
}

/** Live search used by the analyst to check a claim. */
export async function searchWeb(query: string): Promise<{ sources: ResearchSource[]; provider: string }> {
  if (!telemEnabled()) return { sources: [], provider: "mock" };
  try {
    return { sources: await telemSearch(query, 4), provider: "telem" };
  } catch (err) {
    console.error("[telem] search failed:", err instanceof Error ? err.message : err);
    return { sources: [], provider: "mock" };
  }
}

/**
 * Research the SELLER (the user's own company/product) so the committee can quote facts
 * instead of asking for them. With a website: site + pricing, security, integrations, reviews.
 * Without one: the product category (pricing norms, alternatives) from the one-line offering.
 */
export async function researchSeller(sellerUrl: string, offering: string): Promise<{ sources: ResearchSource[]; provider: string; name: string }> {
  const name = sellerUrl ? domainOf(sellerUrl).split(".")[0] : "";
  if (!telemEnabled()) {
    return { sources: sellerUrl ? await fetchHomepage(sellerUrl) : [], provider: sellerUrl ? "fallback:homepage-fetch" : "none", name };
  }
  try {
    const subject = name ? `${name} ${domainOf(sellerUrl)}` : offering;
    const jobs = sellerUrl
      ? [
          telemFetch([normalizeUrl(sellerUrl)]).catch(() => [] as ResearchSource[]),
          telemSearch(`${subject} pricing plans`, 3).catch(() => []),
          telemSearch(`${subject} security SOC 2 compliance`, 3).catch(() => []),
          telemSearch(`${subject} integrations GitHub CI`, 2).catch(() => []),
          telemSearch(`${subject} reviews customers case study`, 3).catch(() => []),
        ]
      : [
          telemSearch(`${offering} pricing`, 3).catch(() => []),
          telemSearch(`${offering} alternatives comparison`, 3).catch(() => []),
          telemSearch(`${offering} ROI case study`, 2).catch(() => []),
        ];
    const all = (await Promise.all(jobs)).flat().filter((x, i, a) => a.findIndex((y) => y.url === x.url) === i).slice(0, 12);
    return { sources: all, provider: "telem", name };
  } catch (err) {
    console.error("[telem] seller research failed:", err instanceof Error ? err.message : err);
    return { sources: [], provider: "error", name };
  }
}
