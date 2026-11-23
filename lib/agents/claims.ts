import { arr, enm, llmJSON, obj, str } from "../llm";
import { searchWeb } from "../sponsors/telem";
import type { Brief, ClaimCheck } from "../types";

/** Claim extractor: pull checkable factual claims (ideally with a number) out of the seller's line. */
export async function extractClaims(utterance: string, brief: Brief): Promise<string[]> {
  const { data } = await llmJSON<{ claims: string[] }>({
    label: "claims",
    system:
      "Extract checkable factual claims from a salesperson's line. A checkable claim states a specific fact, usually with a number, about the seller's product, customers, the market, or the prospect company. Ignore opinions, promises, and questions. Return at most 2 claims, each rewritten as a standalone sentence. Return an empty list if there are none.",
    user: `Prospect: ${brief.company}\nSalesperson said: "${utterance}"`,
    schema: obj({ claims: arr(str()) }),
    maxTokens: 800,
    mock: () => ({
      claims: utterance
        .split(/(?<=[.!?])\s+/)
        .filter((s) => /\d/.test(s))
        .slice(0, 2),
    }),
  });
  return data.claims.slice(0, 2);
}

/** Analyst agent: checks a claim against web research and the account brief. */
export async function analystCheck(claim: string, brief: Brief): Promise<ClaimCheck> {
  const { sources } = await searchWeb(claim);
  const all = [...sources, ...brief.sources];
  const evidence = [
    ...brief.facts.map((f) => `FACT: ${f.text} (${f.sourceUrl})`),
    ...all.map((s) => `SOURCE: ${s.title} (${s.url}): ${s.snippet}`),
  ].join("\n");
  const defaultUrl = all[0]?.url || brief.facts[0]?.sourceUrl || "";

  const { data } = await llmJSON<ClaimCheck>({
    label: "analyst",
    system:
      'You are a fact-checking analyst in a sales meeting. Judge the claim ONLY against the evidence given. "verified" = evidence about the SAME subject (the seller\'s own product/company, or the prospect) supports it. Evidence about a different company or product never verifies a claim about the seller (e.g. another vendor offering a 30-day pilot does not verify that this seller does). "contradicted" = evidence about the same subject says otherwise. "unsupported" = evidence does not address the same subject. Be strict. sourceUrl must be one of the evidence URLs (or empty if none). note = one short sentence naming what the evidence actually covers.',
    user: `Prospect: ${brief.company}\nClaim made by the seller: ${claim}\n\nEvidence:\n${evidence || "(none)"}`,
    schema: obj({
      claim: str(),
      status: enm(["verified", "unsupported", "contradicted"]),
      sourceUrl: str(),
      note: str(),
    }),
    maxTokens: 600,
    mock: () => mockCheck(claim, brief, defaultUrl),
  });
  return { ...data, claim };
}

function mockCheck(claim: string, brief: Brief, url: string): ClaimCheck {
  const nums = claim.match(/\d[\d,.]*/g) ?? [];
  const hay = [...brief.facts.map((f) => f.text), ...brief.sources.map((s) => s.snippet)].join(" ");
  const hit = nums.some((n) => hay.includes(n));
  return {
    claim,
    status: hit ? "verified" : "unsupported",
    sourceUrl: url,
    note: hit ? "Number appears in the account research." : "No source in the research backs this number.",
  };
}
