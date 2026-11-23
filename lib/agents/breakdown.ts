import { arr, llmJSON, obj, str } from "../llm";
import type { Breakdown, ResearchSource } from "../types";

const item = obj({ text: str(), sourceUrl: str("One of the research URLs, or empty") });
const SCHEMA = obj({
  overview: str("3-4 sentences: who they are and what matters right now"),
  whatTheySell: arr(item),
  customers: arr(item),
  businessModel: arr(item),
  funding: arr(item),
  teamAndHiring: arr(item),
  recentNews: arr(item),
  strategicPriorities: arr(item),
  risks: arr(item),
  buyingTriggers: arr(item),
  howToPitch: arr(item),
});

/** Analyst agent: turns Telem research + Glasser data into a complete business breakdown of the prospect. */
export async function buildBreakdown(input: {
  company: string;
  url: string;
  offering: string;
  sources: ResearchSource[];
  enrichment: Record<string, unknown>;
}): Promise<Breakdown> {
  const sources = input.sources.map((s, i) => `[${i + 1}] (${s.kind ?? "web"}) ${s.title} ${s.url}\n${s.snippet.slice(0, 900)}`).join("\n\n");
  const { data } = await llmJSON<Breakdown>({
    label: "breakdown",
    maxTokens: 3500,
    system:
      "You are a sales research analyst. Write a complete, factual business breakdown of the prospect using ONLY the research and data given. Each item is one short sentence with the sourceUrl it came from (empty if it came from the enrichment data). 2-5 items per section; if the research says nothing for a section, give one item saying what is unknown. howToPitch: 3-4 concrete angles for the seller's offering tied to this company's priorities, risks or triggers.",
    user: `Prospect: ${input.company} (${input.url})\nSeller offers: ${input.offering}\n\nEnrichment (Glasser): ${JSON.stringify(input.enrichment)}\n\nResearch (Telem):\n${sources || "(none)"}`,
    schema: SCHEMA,
    mock: () => {
      const s0 = input.sources[0];
      const one = (text: string) => [{ text, sourceUrl: s0?.url ?? "" }];
      return {
        overview: `${input.company}: ${s0?.snippet.slice(0, 220) ?? "no research available"}`,
        whatTheySell: one(s0?.title ?? "Unknown from research"),
        customers: one("Not found in research"),
        businessModel: one("Not found in research"),
        funding: one(String(input.enrichment.funding ?? "Unknown")),
        teamAndHiring: one(`Employees: ${String(input.enrichment.employees ?? "unknown")}`),
        recentNews: one("No recent news found"),
        strategicPriorities: one("Not found in research"),
        risks: one("Not found in research"),
        buyingTriggers: one("Not found in research"),
        howToPitch: one(`Tie ${input.offering} to a measurable outcome for ${input.company}.`),
      };
    },
  });
  return data;
}
