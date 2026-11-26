// One-off prospecting (the Search page) and contact housekeeping (lists, notes, preferences).
// Search: describe who you want in plain words -> filters + live web search -> companies with a sourced reason.
// Nothing is saved until the seller adds results; added companies then go through the normal research + email flow.
import { randomUUID } from "node:crypto";
import { arr, llmJSON, obj, str } from "../llm";
import { loadTeam, saveTeam, resolveCompanyUrl, type Lead, type TeamState } from "../agents/team";
import { searchWeb } from "../sponsors/telem";
import { indexDocs } from "../sponsors/moss";
import { passesKeywords, targetingRules } from "./targeting";
import { DEFAULT_PREFS, type Prefs, type Signal } from "./types";
import { log } from "./engine";

export type ProspectFilters = { titles: string[]; industries: string[]; sizes: string[]; locations: string[]; signals: string[]; keywords: string[] };
export type Prospect = {
  company: string;
  domain: string;
  why: string;
  signal: string;
  kind: Signal["kind"];
  sourceUrl: string;
  sourceTitle: string;
  known: boolean;
};

const KINDS: Signal["kind"][] = ["funding", "hiring", "launch", "exec_hire", "tech_change", "expansion", "other"];

function domainKey(t: TeamState) {
  try {
    return new URL(/^https?:/.test(t.url ?? "") ? t.url! : `https://${t.url}`).hostname.replace(/^www\./, "");
  } catch {
    return t.company ?? "none";
  }
}
const cleanDomain = (u: string) => u.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].trim();

/** Plain-language audience -> filters + live web search -> up to 10 companies with a sourced reason. */
export async function prospectSearch(query: string): Promise<{ filters: ProspectFilters; results: Prospect[]; searched: string[] }> {
  const q = query.trim().slice(0, 400);
  if (!q) return { filters: { titles: [], industries: [], sizes: [], locations: [], signals: [], keywords: [] }, results: [], searched: [] };
  const t = await loadTeam();
  const { data: plan } = await llmJSON<ProspectFilters & { webQueries: string[] }>({
    label: "prospect-plan",
    maxTokens: 500,
    system:
      "Turn a seller's description of who they want to reach into search filters and 3 web search queries that surface COMPANIES showing that situation right now (news, launches, funding, hiring posts, directories). Write each query the way a person types into a search engine: 4-9 plain words, no site:, after:, quotes, OR or other operators. Make the 3 queries different angles (e.g. a launch directory, news, a hiring or funding angle) and add the year 2026 or the words this month to keep results recent. titles = job titles to contact. sizes = employee brackets like 1-10, 11-50, 51-200. signals = the buying situations (hiring, raised funds, launched, new office...). keywords = must-have words. Empty arrays when not stated.",
    user: `Seller sells: ${t.offering || t.company || "(unknown)"}\nIdeal customer: ${t.icp ?? t.icpSpec?.summary ?? "(not set)"}\n\nThey want: ${q}`,
    schema: obj({ titles: arr(str()), industries: arr(str()), sizes: arr(str()), locations: arr(str()), signals: arr(str()), keywords: arr(str()), webQueries: arr(str()) }),
    mock: () => ({ titles: [], industries: [], sizes: [], locations: [], signals: [], keywords: [], webQueries: [q] }),
  });
  const queries = (plan.webQueries?.length ? plan.webQueries : [q]).slice(0, 3);
  const pages = (await Promise.all(queries.map((x) => searchWeb(x, 8).then((r) => r.sources).catch(() => [])))).flat();
  const seenUrl = new Set<string>();
  const hits = pages.filter((p) => p.url && !seenUrl.has(p.url) && seenUrl.add(p.url)).slice(0, 24);
  const filters: ProspectFilters = { titles: plan.titles ?? [], industries: plan.industries ?? [], sizes: plan.sizes ?? [], locations: plan.locations ?? [], signals: plan.signals ?? [], keywords: plan.keywords ?? [] };
  if (!hits.length) return { filters, results: [], searched: queries };

  const { data } = await llmJSON<{ picks: { index: number; company: string; domain: string; why: string; signal: string; kind: string }[] }>({
    label: "prospect-pick",
    maxTokens: 1400,
    system: `From web results, list the real companies that match what the seller asked for. One entry per company (never the publisher, a news site, a directory, an investor, or the seller's competitors). index = the result number it came from. company = the company's real name only. domain = its own website if you can tell, else "". signal = the specific fact from the result (one short line). kind = one of ${KINDS.join(", ")}. why = one sentence on why they would want the seller's product now. Skip anything that does not fit the request.${targetingRules(t)}`,
    user: `Seller sells: ${t.offering || t.company || ""}\nCompetitors: ${(t.competitors ?? []).map((c) => c.name).join(", ")}\nThey asked for: ${q}\n\nResults:\n${hits.map((h, i) => `${i}. ${h.title} — ${h.snippet?.slice(0, 280) ?? ""} (${h.url})`).join("\n")}`,
    schema: obj({ picks: arr(obj({ index: { type: "integer" }, company: str(), domain: str(), why: str(), signal: str(), kind: str() })) }),
    mock: () => ({ picks: [] }),
  });

  const known = new Set(t.leads.flatMap((l) => [l.company.toLowerCase(), l.domain.toLowerCase()]));
  const excluded = new Set((t.excluded ?? []).map((x) => x.toLowerCase()));
  const out: Prospect[] = [];
  const seen = new Set<string>();
  for (const p of data.picks ?? []) {
    const h = hits[p.index];
    const name = (p.company ?? "").trim();
    if (!h || !name || seen.has(name.toLowerCase()) || excluded.has(name.toLowerCase())) continue;
    if (!passesKeywords(`${name} ${p.signal} ${p.why}`, t).ok) continue;
    seen.add(name.toLowerCase());
    const domain = cleanDomain(p.domain || "");
    out.push({
      company: name,
      domain,
      why: p.why,
      signal: p.signal || h.title,
      kind: (KINDS as string[]).includes(p.kind) ? (p.kind as Signal["kind"]) : "other",
      sourceUrl: h.url,
      sourceTitle: h.title,
      known: known.has(name.toLowerCase()) || (!!domain && known.has(domain)),
    });
    if (out.length >= 10) break;
  }
  return { filters, results: out, searched: queries };
}

/** Add chosen search results to the pipeline. They get researched and written to like any other lead. */
export async function addProspects(items: Prospect[]): Promise<Lead[]> {
  const t = await loadTeam();
  const have = new Set(t.leads.flatMap((l) => [l.company.toLowerCase(), l.domain.toLowerCase()]));
  const added: Lead[] = [];
  for (const p of items.slice(0, 25)) {
    if (!p?.company || have.has(p.company.toLowerCase())) continue;
    let domain = cleanDomain(p.domain || "");
    if (!domain) domain = cleanDomain(await resolveCompanyUrl(p.company).catch(() => ""));
    if (!domain || have.has(domain)) continue;
    have.add(domain);
    have.add(p.company.toLowerCase());
    const now = new Date().toISOString();
    added.push({
      id: randomUUID().slice(0, 8),
      company: p.company,
      domain,
      why: p.why,
      sourceUrl: p.sourceUrl,
      status: "new",
      foundBy: "You (search)",
      at: now,
      stage: "matched",
      signals: [{ kind: p.kind, text: p.signal, sourceUrl: p.sourceUrl }],
      history: [{ at: now, stage: "matched", actor: "rep", who: "You", note: "added from Search" }],
    });
  }
  if (!added.length) return [];
  const fresh = await loadTeam();
  fresh.leads.unshift(...added);
  log(fresh, { actor: "rep", who: "You", kind: "discover", text: `Added ${added.length} compan${added.length === 1 ? "y" : "ies"} from Search` });
  await saveTeam(fresh);
  await indexDocs(domainKey(fresh), added.map((l) => ({ id: `lead-${l.id}`, text: `${l.company} (${l.domain}). ${l.why}`, metadata: { kind: "lead", leadId: l.id, url: l.sourceUrl } }))).catch(() => {});
  return added;
}

/* ---------- lists, notes, preferences ---------- */

const cleanList = (s: string) => s.trim().replace(/\s+/g, " ").slice(0, 60);

export async function saveLists(lists: string[]): Promise<TeamState> {
  const t = await loadTeam();
  t.lists = [...new Set(lists.map(cleanList).filter(Boolean))].slice(0, 100);
  // A deleted list leaves its people unfiled.
  const keep = new Set(t.lists);
  for (const l of t.leads) for (const c of l.contacts ?? []) if (c.list && !keep.has(c.list)) c.list = undefined;
  await saveTeam(t);
  return t;
}

/** File contacts under a list (or take them off any list with list = ""). Creates the list if needed. */
export async function fileContacts(items: { leadId: string; contactId: string }[], list: string): Promise<TeamState> {
  const t = await loadTeam();
  const name = cleanList(list);
  if (name && !(t.lists ?? []).includes(name)) t.lists = [...(t.lists ?? []), name];
  for (const it of items) {
    const c = t.leads.find((l) => l.id === it.leadId)?.contacts?.find((x) => x.id === it.contactId);
    if (c) c.list = name || undefined;
  }
  await saveTeam(t);
  return t;
}

export async function saveContactNotes(leadId: string, contactId: string, notes: string): Promise<TeamState> {
  const t = await loadTeam();
  const c = t.leads.find((l) => l.id === leadId)?.contacts?.find((x) => x.id === contactId);
  if (c) c.notes = notes.slice(0, 4000);
  await saveTeam(t);
  return t;
}

export async function savePrefs(p: Partial<Prefs>): Promise<TeamState> {
  const t = await loadTeam();
  t.prefs = { ...DEFAULT_PREFS, ...(t.prefs ?? {}), ...p };
  await saveTeam(t);
  return t;
}
