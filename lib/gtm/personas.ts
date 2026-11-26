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
  const [stories, roles] = await Promise.all([
    searchWeb(`${company} customer story case study`).catch(() => ({ sources: [] })),
    searchWeb(`${company} ${t.offering.slice(0, 80)} who buys "head of" OR VP OR director`).catch(() => ({ sources: [] })),
  ]);
  const sources = [...stories.sources, ...roles.sources].slice(0, 12);
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
- confidence 0.00-1.00: high only with direct evidence (a case study quoting that title).`,
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

export function matchPersona(title: string, personas: Persona[]): Persona | null {
  const tl = expandTitle(title);
  let best: { p: Persona; s: number } | null = null;
  for (const p of personas.filter((x) => x.enabled)) {
    if (p.excludeTitles.some((x) => x && tl.includes(expandTitle(x).trim()))) continue;
    for (const want of p.titles) {
      const words = expandTitle(want).split(/[^a-z]+/).filter((w) => w.length > 2 && !["and", "the", "for", "head"].includes(w));
      const hit = words.filter((w) => tl.includes(w)).length / Math.max(1, words.length);
      if (hit > (best?.s ?? 0.49)) best = { p, s: hit };
    }
  }
  return best?.p ?? null;
}
