import Parser from "rss-parser";
import type { SignalHit } from "./types";

export type NewsOpts = { limit?: number; timeoutMs?: number; hl?: string; gl?: string; ceid?: string };

const parser = new Parser();

const FUNDING_RE = /\b(raises?|raised|raising|funding|series [a-f]\b|seed|pre-seed|secures? \$|closes? \$)/i;
const LAUNCH_RE = /\b(launch(es|ed)?|announces?|announced|unveils?|unveiled|introduces?|debuts?|rolls out)\b/i;
const SPLIT_RE =
  /\s+(?:raises|raised|lands|secures|closes|bags|nabs|launches|launched|unveils|announces|introduces|debuts|rolls out|gets|scores|snags)\b|:\s|\s[-–—|]\s/i;

export function classifyNews(title: string): SignalHit["kind"] {
  if (FUNDING_RE.test(title)) return "funding";
  if (LAUNCH_RE.test(title)) return "launch";
  return "news";
}

/** Google News titles end in " - Publisher"; strip that off. */
export function splitPublisher(title: string): { headline: string; publisher?: string } {
  const i = title.lastIndexOf(" - ");
  if (i > 0 && title.length - i < 60) return { headline: title.slice(0, i).trim(), publisher: title.slice(i + 3).trim() };
  return { headline: title.trim() };
}

const DESCRIPTOR_NOUN = /^(startup|start-up|firm|company|platform|maker|provider|unicorn|giant|developer|app|scaleup|biotech|fintech|insurtech|proptech|healthtech|edtech)s?$/i;

export function guessCompany(headline: string): string {
  const cleaned = headline.replace(/^(exclusive|breaking|report|scoop|update|watch)\s*[:|\-\u2013\u2014]\s*/i, "");
  const head = (cleaned.split(SPLIT_RE)[0] ?? cleaned).replace(/,\s+(an?|the)\s.*$/i, "").trim();
  // "AI startup Foo" / "Fintech firm Foo" -> "Foo": drop a short leading descriptor ending in a descriptor noun.
  const words = head.split(/\s+/);
  const nounAt = words.slice(0, 4).findIndex((w, i) => i < words.length - 1 && DESCRIPTOR_NOUN.test(w));
  const name = nounAt >= 0 && /^[A-Z0-9]/.test(words[nounAt + 1]) ? words.slice(nounAt + 1).join(" ") : head;
  return name.replace(/^['"\u2018\u201c]+|['"\u2019\u201d,]+$/g, "").slice(0, 80);
}

function strengthFor(kind: SignalHit["kind"], ageDays: number): number {
  const base = kind === "funding" ? 0.6 : kind === "launch" ? 0.5 : 0.3;
  const fresh = ageDays <= 2 ? 0.15 : ageDays <= 7 ? 0.05 : -0.1;
  return Math.max(0.1, Math.min(1, Math.round((base + fresh) * 100) / 100));
}

/** Funding / launch / news signals from Google News RSS for a query. */
export async function newsSignals(query: string, opts: NewsOpts = {}): Promise<SignalHit[]> {
  const limit = Math.min(20, Math.max(1, opts.limit ?? 20));
  const url =
    `https://news.google.com/rss/search?q=${encodeURIComponent(query)}` +
    `&hl=${opts.hl ?? "en-US"}&gl=${opts.gl ?? "US"}&ceid=${encodeURIComponent(opts.ceid ?? "US:en")}`;
  let xml: string;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; DealRoomSignals/1.0)", Accept: "application/rss+xml, text/xml" },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
    });
    if (!res.ok) return [];
    xml = await res.text();
  } catch {
    return [];
  }
  let feed: Awaited<ReturnType<typeof parser.parseString>>;
  try {
    feed = await parser.parseString(xml);
  } catch {
    return [];
  }
  const now = Date.now();
  return (feed.items ?? []).slice(0, limit).flatMap((item): SignalHit[] => {
    const rawTitle = item.title?.trim();
    const link = item.link?.trim();
    if (!rawTitle || !link) return [];
    const { headline, publisher } = splitPublisher(rawTitle);
    const kind = classifyNews(headline);
    const d = new Date(item.isoDate ?? item.pubDate ?? now);
    const at = Number.isNaN(d.getTime()) ? new Date(now).toISOString() : d.toISOString();
    const ageDays = (now - new Date(at).getTime()) / 86400000;
    return [
      {
        company: guessCompany(headline),
        kind,
        text: headline,
        sourceUrl: link,
        at,
        strength: strengthFor(kind, ageDays),
        data: { publisher, query },
      },
    ];
  });
}
