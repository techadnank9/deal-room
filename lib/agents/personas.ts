import { arr, int, llmJSON, obj, str, enm } from "../llm";
import type { Brief, ExecId, Persona, ResearchSource } from "../types";

const VOICES: Record<ExecId, string> = { cfo: "voice-a", tech: "voice-b", procurement: "voice-c" };

type BriefAndPersonas = {
  company: string;
  summary: string;
  facts: { text: string; sourceUrl: string }[];
  personas: Omit<Persona, "voice">[];
};

const SCHEMA = obj({
  company: str("Company display name"),
  summary: str("3-4 sentence account brief for a seller"),
  facts: arr(obj({ text: str(), sourceUrl: str() })),
  personas: arr(
    obj({
      id: enm(["cfo", "tech", "procurement"]),
      name: str("Realistic fictional full name"),
      title: str(),
      personality: str("One sentence: temperament and speaking style"),
      priorities: arr(str()),
      objections: arr(obj({ text: str(), sourceUrl: str() })),
      conviction: int("Starting conviction 30-50"),
    }),
  ),
});

export async function buildBriefAndPersonas(input: {
  url: string;
  domain: string;
  offering: string;
  sources: ResearchSource[];
  enrichment: Record<string, unknown>;
  memory: string;
}): Promise<{ brief: Pick<Brief, "company" | "summary" | "facts">; personas: Persona[]; source: string }> {
  const sourcesText = input.sources
    .map((s, i) => `[${i + 1}] ${s.title} (${s.url})\n${s.snippet}`)
    .join("\n\n");
  const system = `You build sales meetings. Given research about a prospect company, write a short account brief and three buying-committee executives: a CFO (id "cfo"), a technical lead (id "tech"), and a procurement lead (id "procurement"). Casting is fixed to match the 3D characters: the CFO is an East Asian woman in her late 50s, the technical lead is a South Asian man in his early 30s, the procurement lead is a Latina woman in her mid 40s; pick fitting fictional names. The names are fictional, but every objection must be grounded in the research provided and cite one of its URLs as sourceUrl. If research is thin, ground objections in what the homepage says the company does. Each executive has 3 priorities and 2-3 objections specific to what is being sold. Starting conviction between 30 and 50. Facts: 3-6 short factual statements from the research, each with its source URL.`;
  const user = `Prospect URL: ${input.url}
What the seller sells: ${input.offering}

Research:
${sourcesText || "(no research returned)"}

Enrichment data: ${JSON.stringify(input.enrichment)}
${input.memory ? `\nMemory from earlier meetings against this account (executives remember these):\n${input.memory}` : ""}`;

  const { data, source } = await llmJSON<BriefAndPersonas>({
    system,
    user,
    schema: SCHEMA,
    label: "personas",
    mock: () => mockBriefAndPersonas(input),
  });

  const byId = new Map(data.personas.map((p) => [p.id, p]));
  const fallback = mockBriefAndPersonas(input).personas;
  const personas: Persona[] = (["cfo", "tech", "procurement"] as ExecId[]).map((id) => {
    const p = byId.get(id) ?? fallback.find((f) => f.id === id)!;
    return { ...p, id, conviction: clamp(p.conviction, 30, 50), voice: VOICES[id] };
  });
  return { brief: { company: data.company, summary: data.summary, facts: data.facts }, personas, source };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, Math.round(Number.isFinite(n) ? n : lo)));
}

function mockBriefAndPersonas(input: { url: string; domain: string; offering: string; sources: ResearchSource[] }): BriefAndPersonas {
  const src = input.sources[0];
  const srcUrl = src?.url || `https://${input.domain}`;
  const company = (src?.title || input.domain).split(/[|\-–:]/)[0].trim() || input.domain;
  const snippet = src?.snippet?.slice(0, 220) || `${company} is the prospect.`;
  const rnd = () => 30 + Math.floor(Math.random() * 21);
  return {
    company,
    summary: `${company} (${input.domain}). ${snippet} You are pitching: ${input.offering}. Research is from a basic homepage fetch (mock mode), so treat the committee as skeptical by default.`,
    facts: [{ text: snippet, sourceUrl: srcUrl }],
    personas: [
      {
        id: "cfo",
        name: "Dana Whitfield",
        title: "Chief Financial Officer",
        personality: "Dry, numbers-first, interrupts vague claims.",
        priorities: ["Payback under 12 months", "Predictable spend", "Board-ready ROI story"],
        objections: [
          { text: `What is the payback period on ${input.offering} for a company like ${company}?`, sourceUrl: srcUrl },
          { text: "We froze net-new tooling budget this quarter.", sourceUrl: srcUrl },
        ],
        conviction: rnd(),
      },
      {
        id: "tech",
        name: "Ravi Menon",
        title: "VP of Engineering",
        personality: "Curious but allergic to hand-waving; asks how it actually works.",
        priorities: ["Integration with current stack", "Security review", "Low maintenance burden"],
        objections: [
          { text: "How does this integrate with what we already run, and who maintains it?", sourceUrl: srcUrl },
          { text: "Our security review takes 8 weeks. Do you have SOC 2?", sourceUrl: srcUrl },
        ],
        conviction: rnd(),
      },
      {
        id: "procurement",
        name: "Marisol Ortega",
        title: "Head of Procurement",
        personality: "Polite, relentless about terms, compares every vendor.",
        priorities: ["Price vs alternatives", "Contract flexibility", "Vendor stability"],
        objections: [
          { text: "Why you over the two cheaper vendors we already talked to?", sourceUrl: srcUrl },
          { text: "We need month-to-month terms for the first pilot.", sourceUrl: srcUrl },
        ],
        conviction: rnd(),
      },
    ],
  };
}
