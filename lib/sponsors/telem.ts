import type { ResearchSource } from "../types";

// Telem: account research at session start + live claim checks.
// Real integration is wired once docs are confirmed (see docs/sponsor-research.md).
// Fallback: fetch the prospect homepage directly and pull title/description.

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
    return [
      { title: title || domainOf(url), url: target, snippet: [desc, ...headings].filter(Boolean).join(" | ").slice(0, 900) },
    ];
  } catch {
    return [{ title: domainOf(url), url: target, snippet: "" }];
  }
}

export async function researchAccount(url: string): Promise<{ sources: ResearchSource[]; provider: string }> {
  // TODO(telem): replace with Telem search + fetch (company site, news, job posts).
  return { sources: await fetchHomepage(url), provider: "fallback:homepage-fetch" };
}

export async function searchWeb(query: string): Promise<{ sources: ResearchSource[]; provider: string }> {
  // TODO(telem): replace with Telem search.
  void query;
  return { sources: [], provider: "mock" };
}
