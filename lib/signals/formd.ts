import type { SignalHit } from "./types";

// SEC requires a descriptive User-Agent and fair access (< 10 req/s).
const SEC_HEADERS = { "User-Agent": "DealRoom signals admin@dealroom.app", Accept: "application/json, text/xml, */*" };
const TIMEOUT_MS = 10000;
const MIN_GAP_MS = 125; // ~8 req/s across this module
const PAGE_SIZE = 100; // efts returns 100 hits per page

let nextSlot = 0;
async function throttle(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + MIN_GAP_MS;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

async function secFetch(url: string): Promise<Response | null> {
  await throttle();
  try {
    const res = await fetch(url, { headers: SEC_HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
    return res.ok ? res : null;
  } catch {
    return null;
  }
}

type EftsHit = {
  _id?: string;
  _source?: {
    ciks?: string[];
    display_names?: string[];
    file_date?: string;
    biz_states?: string[];
    biz_locations?: string[];
    adsh?: string;
    file_type?: string;
    items?: string[];
  };
};
type EftsResp = { hits?: { total?: { value?: number }; hits?: EftsHit[] } };

export type FormDFiling = {
  cik: string;
  adsh: string;
  name: string;
  fileDate: string;
  state?: string;
  location?: string;
  items: string[];
  indexUrl: string;
  docUrl: string;
};

export type FormDDetails = {
  issuerName?: string;
  state?: string;
  website?: string;
  industryGroupType?: string;
  entityType?: string;
  totalOfferingAmount?: number | "Indefinite";
  totalAmountSold?: number;
  isAmendment?: boolean;
};

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function filingUrls(cik: string, adsh: string) {
  const cikNum = String(Number(cik));
  const flat = adsh.replace(/-/g, "");
  const base = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${flat}`;
  return { indexUrl: `${base}/${adsh}-index.htm`, docUrl: `${base}/primary_doc.xml` };
}

function cleanName(display: string): string {
  return display.replace(/\s*\(CIK \d+\)\s*$/, "").trim();
}

/** List Form D filings (new notices only, no D/A) from EDGAR full-text search. */
export async function searchFormD(startdt: string, enddt: string, maxPages = 2): Promise<FormDFiling[]> {
  const out: FormDFiling[] = [];
  const seen = new Set<string>();
  for (let page = 0; page < maxPages; page++) {
    const url =
      `https://efts.sec.gov/LATEST/search-index?forms=D&dateRange=custom` +
      `&startdt=${startdt}&enddt=${enddt}&from=${page * PAGE_SIZE}`;
    const res = await secFetch(url);
    if (!res) break;
    let body: EftsResp;
    try {
      body = (await res.json()) as EftsResp;
    } catch {
      break;
    }
    const hits = body.hits?.hits ?? [];
    for (const h of hits) {
      const s = h._source;
      const cik = s?.ciks?.[0];
      const adsh = s?.adsh ?? h._id?.split(":")[0];
      if (!s || !cik || !adsh || seen.has(adsh)) continue;
      if (s.file_type && s.file_type !== "D") continue; // skip amendments
      seen.add(adsh);
      out.push({
        cik,
        adsh,
        name: cleanName(s.display_names?.[0] ?? ""),
        fileDate: s.file_date ?? "",
        state: s.biz_states?.[0],
        location: s.biz_locations?.[0],
        items: s.items ?? [],
        ...filingUrls(cik, adsh),
      });
    }
    if (hits.length < PAGE_SIZE) break;
  }
  return out;
}

function tag(xml: string, name: string): string | undefined {
  const m = xml.match(new RegExp(`<${name}>\\s*([^<]*?)\\s*</${name}>`, "i"));
  return m ? m[1].replace(/&amp;/g, "&").trim() : undefined;
}

function num(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number(v.replace(/[,$\s]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

export function parseFormDXml(xml: string): FormDDetails {
  const offering = tag(xml, "totalOfferingAmount");
  const issuerBlock = xml.match(/<primaryIssuer>([\s\S]*?)<\/primaryIssuer>/i)?.[1] ?? xml;
  // Form D has no standard website field; pick one up only if a filer added it.
  const website = tag(xml, "issuerWebsite") ?? tag(xml, "website");
  return {
    issuerName: tag(issuerBlock, "entityName"),
    state: tag(issuerBlock, "stateOrCountry"),
    website,
    industryGroupType: tag(xml, "industryGroupType"),
    entityType: tag(issuerBlock, "entityType"),
    totalOfferingAmount: offering && /indefinite/i.test(offering) ? "Indefinite" : num(offering),
    totalAmountSold: num(tag(xml, "totalAmountSold")),
    isAmendment: tag(xml, "isAmendment") === "true",
  };
}

export async function fetchFormDDetails(filing: FormDFiling): Promise<FormDDetails | null> {
  const res = await secFetch(filing.docUrl);
  if (!res) return null;
  try {
    return parseFormDXml(await res.text());
  } catch {
    return null;
  }
}

const NOISE_INDUSTRIES = /pooled investment fund|reits? and finance|real estate|commercial banking|insurance|investing|other banking|restaurants|lodging/i;
// Names that read as funds / SPVs / real-estate vehicles rather than operating companies.
const NOISE_NAME_END = /\b(fund|funds|lp|l\.p|holdings,? llc|partners,? llc|investors,? llc|reit|trust|properties|realty|apartments)\.?\s*$/i;
const NOISE_NAME_ANY = /\b(fund [ivx\d]+|fund,|l\.p\.|spv|feeder|co-?invest\w*|series [a-z0-9]+ of|a series of)\b/i;
// Exemption items 3C / 3C.1 / 3C.7 = Investment Company Act exclusions -> funds.
const FUND_ITEMS = /^3C/i;

export function isNoiseFiling(name: string, items: string[] = [], industry?: string): boolean {
  if (items.some((i) => FUND_ITEMS.test(i))) return true;
  if (NOISE_NAME_END.test(name) || NOISE_NAME_ANY.test(name)) return true;
  if (industry && NOISE_INDUSTRIES.test(industry)) return true;
  return false;
}

function fmtMoney(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1).replace(/\.0$/, "")}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}

function fmtDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function amountStrength(n: number): number {
  if (n >= 10e6) return 0.9;
  if (n >= 2e6) return 0.7;
  return 0.5;
}

function domainFrom(website?: string): string | undefined {
  if (!website) return undefined;
  try {
    const u = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`);
    const host = u.hostname.replace(/^www\./, "");
    return host.endsWith("sec.gov") ? undefined : host;
  } catch {
    return undefined;
  }
}

export type RecentFormDOpts = {
  days?: number;
  /** Max hits returned; also bounds primary_doc fetches to ~3x this. */
  limit?: number;
  /** Match industryGroupType, case-insensitive, e.g. "Other Technology", "Computers". */
  industries?: string[];
  /** Hard cap on primary_doc.xml fetches (default limit*3, max 150). */
  maxDocFetches?: number;
};

/** Recent operating-company raises from SEC Form D filings. */
export async function recentFormD(opts: RecentFormDOpts = {}): Promise<SignalHit[]> {
  const days = Math.max(1, opts.days ?? 7);
  const limit = Math.max(1, opts.limit ?? 25);
  const maxDocs = Math.min(150, opts.maxDocFetches ?? limit * 3);
  const wanted = (opts.industries ?? []).map((i) => i.toLowerCase());

  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);
  const pages = Math.min(5, Math.ceil(maxDocs / 40) + 1);
  const filings = (await searchFormD(ymd(start), ymd(end), pages)).filter((f) => !isNoiseFiling(f.name, f.items));

  const hits: SignalHit[] = [];
  let fetched = 0;
  const CONCURRENCY = 4;
  let cursor = 0;

  async function worker() {
    while (hits.length < limit && fetched < maxDocs && cursor < filings.length) {
      const f = filings[cursor++];
      fetched++;
      const d = await fetchFormDDetails(f);
      if (!d || d.isAmendment) continue;
      const industry = d.industryGroupType ?? "";
      if (wanted.length && !wanted.includes(industry.toLowerCase())) continue;
      const name = d.issuerName ?? f.name;
      if (isNoiseFiling(name, f.items, industry)) continue;
      const sold = d.totalAmountSold ?? 0;
      const offering = typeof d.totalOfferingAmount === "number" ? d.totalOfferingAmount : 0;
      if (sold <= 0 && offering <= 0 && d.totalOfferingAmount !== "Indefinite") continue;
      const day = fmtDay(f.fileDate);
      const text =
        sold > 0
          ? `Raised ${fmtMoney(sold)} (SEC Form D, ${day})`
          : offering > 0
            ? `Raising ${fmtMoney(offering)} (SEC Form D, ${day})`
            : `Filed Form D, amount undisclosed (${day})`;
      const strengthBase = sold > 0 ? sold : offering;
      if (hits.length >= limit) break;
      hits.push({
        company: name,
        domain: domainFrom(d.website),
        kind: "funding",
        text,
        sourceUrl: f.indexUrl,
        at: new Date(`${f.fileDate}T00:00:00Z`).toISOString(),
        strength: amountStrength(strengthBase),
        data: {
          cik: f.cik,
          accession: f.adsh,
          industryGroupType: industry || undefined,
          totalOfferingAmount: d.totalOfferingAmount,
          totalAmountSold: d.totalAmountSold,
          state: d.state ?? f.state,
          location: f.location,
          website: d.website,
          entityType: d.entityType,
          primaryDocUrl: f.docUrl,
        },
      });
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return hits.sort((a, b) => b.strength - a.strength || b.at.localeCompare(a.at)).slice(0, limit);
}
