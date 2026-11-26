import { randomUUID } from "node:crypto";
import { arr, enm, llmJSON, obj, str } from "../llm";
import { loadTeam, saveTeam } from "../agents/team";
import { searchWeb } from "../sponsors/telem";
import type { Persona } from "./types";

const num = (d?: string) => ({ type: "number", ...(d ? { description: d } : {}) });

/**
 * Buyer personas from evidence: customer stories and case studies (who signed), the problem's owner, competitors.
 * The user confirms or edits them before the agent searches for people.
 */
export async function generatePersonas(): Promise<Persona[]> {
  const t = await loadTeam();
  const company = t.company ?? "";
  const cap = t.targeting?.maxEmployees ?? 0;
  const tiny = cap > 0 && cap <= 20;
  const problem = (t.knowledge?.pains || t.icpSpec?.summary || t.offering).slice(0, 90);
  const comp = (t.competitors ?? []).slice(0, 2).map((c) => c.name);
  // Research from several angles: who the seller's customers are, how buyers describe the problem in their own words
  // (communities), what reviewers of competitors say (their roles), and what the seller's pricing implies.
  const queries = [
    `${company} customer story case study`,
    tiny ? `${problem} solo founder indie hacker reddit` : `${company} ${t.offering.slice(0, 80)} who buys "head of" OR VP OR director`,
    `${problem} ${tiny ? "small startup founders" : "teams"} pain forum discussion`,
    ...comp.map((c) => `${c} review G2 reviewer role company size`),
    `${company} pricing plans who is it for`,
  ];
  const results = await Promise.all(queries.map((q) => searchWeb(q, 5).catch(() => ({ sources: [] as { title: string; url: string; snippet: string }[] }))));
  const seenUrl = new Set<string>();
  const sources = results
    .flatMap((r) => r.sources)
    .filter((x) => x.url && !seenUrl.has(x.url) && seenUrl.add(x.url))
    .slice(0, 20);
  const { data } = await llmJSON<{ personas: Omit<Persona, "id" | "enabled">[] }>({
    label: "gtm-personas",
    maxTokens: 3500,
    system: `You define buyer personas for a B2B seller: the PEOPLE to contact inside target companies. Return 3-4 personas covering the buying group: the champion who feels the pain, the economic buyer who signs, and (if relevant) the main user or a likely blocker. For each:
- label: short name like "QA Lead" or "Engineering Leader".
- titles: 4-8 real job titles to search for (include common variants). excludeTitles: titles that look similar but are wrong (interns, consultants, agencies, sales of the same tool).
- seniority (e.g. Director, VP, C-level, Manager) and departments.
- companySize: the employee range where THIS persona is the right first contact (e.g. at <50 people the CTO decides; at 300+ a Director of QA).
- pains: 2-3 pains in the persona's own words. triggers: 2-4 observable events that make now a good time for THIS persona.
- watch.competitors: competitor or adjacent brands whose LinkedIn posts this persona would react to; watch.keywords: 3-5 topics they post or comment about.
- angle: one sentence on what to lead with. cta: the ask that fits their seniority.
- evidence: 1-3 items quoting the research (customer stories naming a title are the strongest), each with the url it came from. Never invent a url; use [] if no evidence.
- confidence 0.00-1.00: high only with direct evidence (a case study quoting that title).
${tiny ? `IMPORTANT: the seller only sells to solo founders and tiny teams (at most ${cap} people). Every persona must fit a company of 1-${cap} people: founders, solo makers, technical co-founders, the one engineer. No managers, directors, VPs, QA leads, agencies or enterprise roles. companySize must stay within 1-${cap}. At this size one person decides and uses the product, so make the personas differ by SITUATION (e.g. non-technical founder who built with an AI app builder vs. technical founder shipping fast vs. bootstrapper with paying users), not by department. Use the community research for pains in their own words.` : cap ? `Target companies have at most ${cap} employees; keep companySize within that.` : ""}
${t.targeting?.extraCriteria ? `The seller's own targeting notes: ${t.targeting.extraCriteria}` : ""}`,
    user: `Seller: ${company} (${t.url ?? ""})\nSells: ${t.offering}\nICP: ${t.icpSpec?.summary ?? t.icp ?? ""}\nReference customers: ${t.intake?.customers || "(none named)"}\nCompetitors: ${(t.competitors ?? []).map((c) => c.name).join(", ") || "(unknown)"}\n\nResearch:\n${sources.map((x, i) => `[${i + 1}] ${x.title} ${x.url}\n${x.snippet.slice(0, 400)}`).join("\n\n") || "(none)"}`,
    schema: obj({
      personas: arr(
        obj({
          label: str(),
          role: enm(["champion", "economic_buyer", "user", "blocker"]),
          titles: arr(str()),
          excludeTitles: arr(str()),
          seniority: arr(str()),
          departments: arr(str()),
          companySize: str(),
          pains: arr(str()),
          triggers: arr(str()),
          watch: obj({ competitors: arr(str()), keywords: arr(str()) }),
          angle: str(),
          cta: str(),
          evidence: arr(obj({ text: str(), url: str() })),
          confidence: num("0.00-1.00"),
        }),
      ),
    }),
    mock: () => ({
      personas: (t.icpSpec?.personas ?? [{ title: "Head of Engineering", seniority: "Director", function: "Engineering", confidence: 0.5 }]).map((p) => ({
        label: p.title,
        role: "champion" as const,
        titles: [p.title],
        excludeTitles: ["Intern", "Consultant"],
        seniority: [p.seniority],
        departments: [p.function],
        companySize: t.icpSpec?.companySize.headcount ?? "",
        pains: [],
        triggers: (t.icpSpec?.triggers ?? []).map((x) => x.event).slice(0, 3),
        watch: { competitors: (t.competitors ?? []).map((c) => c.name).slice(0, 3), keywords: [] },
        angle: "",
        cta: "15-minute call",
        evidence: [],
        confidence: p.confidence,
      })),
    }),
  });
  const urls = new Set(sources.map((s) => s.url));
  const personas: Persona[] = data.personas.map((p) => ({
    ...p,
    id: randomUUID().slice(0, 8),
    evidence: p.evidence.filter((e) => urls.has(e.url)),
    confidence: Math.max(0, Math.min(1, p.confidence)),
    enabled: true,
  }));
  const fresh = await loadTeam();
  fresh.personas = personas;
  fresh.personasConfirmed = false;
  fresh.activity = [
    { id: randomUUID().slice(0, 10), at: new Date().toISOString(), actor: "agent" as const, who: "Maya", kind: "icp" as const, text: `Proposed ${personas.length} buyer personas: ${personas.map((p) => p.label).join(", ")}` },
    ...(fresh.activity ?? []),
  ];
  await saveTeam(fresh);
  return personas;
}

export async function savePersonas(personas: Persona[], confirm: boolean) {
  const t = await loadTeam();
  t.personas = personas;
  if (confirm) t.personasConfirmed = true;
  await saveTeam(t);
  return t;
}

/** Titles the people search should look for, from enabled personas (falls back to the ICP's personas). */
export function targetTitles(t: { personas?: Persona[]; icpSpec?: { personas: { title: string }[] } }) {
  const on = (t.personas ?? []).filter((p) => p.enabled);
  if (on.length) return [...new Set(on.flatMap((p) => p.titles))].slice(0, 20);
  return (t.icpSpec?.personas ?? []).map((p) => p.title);
}

/** Which persona a job title matches (simple word overlap, excludes first). */
const ABBR: Record<string, string> = {
  ceo: "chief executive officer",
  cto: "chief technology officer",
  cfo: "chief financial officer",
  coo: "chief operating officer",
  cmo: "chief marketing officer",
  cpo: "chief product officer",
  cro: "chief revenue officer",
  ciso: "chief information security officer",
  cio: "chief information officer",
  svp: "senior vice president",
  evp: "executive vice president",
  vp: "vice president",
  qa: "quality assurance",
  hr: "human resources",
  eng: "engineering",
  "r&d": "research and development",
};
/** Lowercase and spell out common abbreviations so "CTO" matches "Chief Technology Officer". */
function expandTitle(t: string) {
  return ` ${t.toLowerCase()} `
    .replace(/[,/|()]/g, " ")
    .replace(/\b(ceo|cto|cfo|coo|cmo|cpo|cro|ciso|cio|svp|evp|vp|qa|hr|eng|r&d)\b/g, (m) => ABBR[m] ?? m)
    .replace(/\s+/g, " ");
}

/** Employee range a persona targets, from text like "5-50 employees" or "100-2,000". */
function sizeRange(text: string): [number, number] | null {
  const m = text.replace(/,/g, "").match(/(\d+)\s*[-–to]+\s*(\d+)/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}
function headcount(size?: string): number | null {
  if (!size) return null;
  const nums = (size.replace(/,/g, "").match(/\d+/g) ?? []).map(Number);
  if (!nums.length) return null;
  return nums.length > 1 ? Math.round((nums[0] + nums[1]) / 2) : nums[0];
}

/**
 * Which persona a job title matches. Scores by how many distinctive title words match (so "Co-Founder & CTO"
 * prefers the CTO persona over a plain "Founder" one), and, when the company size is known, prefers the persona
 * whose company-size range fits.
 */
export function matchPersona(title: string, personas: Persona[], companySize?: string, companyText?: string): Persona | null {
  const tl = expandTitle(title);
  const n = headcount(companySize);
  const isAgency = /agency|studio|development services|dev shop|consultanc|software house|app builders?|outsourc/i.test(companyText ?? "");
  let best: { p: Persona; s: number } | null = null;
  for (const p of personas.filter((x) => x.enabled)) {
    if (p.excludeTitles.some((x) => x && tl.includes(expandTitle(x).trim()))) continue;
    // Agency personas only fit companies that are agencies or studios.
    if (/agency|studio/i.test(p.label) && !isAgency) continue;
    const range = sizeRange(p.companySize);
    // Far outside the persona's company size: not this persona (a CEO of 80 people is not a solo founder).
    if (n !== null && range && (n > range[1] * 3 || n < range[0] * 0.3)) continue;
    let top = 0;
    for (const want of p.titles) {
      const words = expandTitle(want).split(/[^a-z]+/).filter((w) => w.length > 2 && !["and", "the", "for", "head"].includes(w));
      if (!words.length) continue;
      const hit = words.filter((w) => tl.includes(w)).length;
      if (hit / words.length < 0.5) continue;
      top = Math.max(top, hit + hit / words.length);
    }
    if (!top) continue;
    if (n !== null && range) top += n >= range[0] * 0.7 && n <= range[1] * 1.3 ? 2 : -2;
    if (top > (best?.s ?? 0)) best = { p, s: top };
  }
  return best?.p ?? null;
}
