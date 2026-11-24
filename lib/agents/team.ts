import { randomUUID } from "node:crypto";
import { arr, enm, llmJSON, obj, str } from "../llm";
import { kvGet, kvSet } from "../db";
import { researchSeller, searchWeb } from "../sponsors/telem";
import { enrichCompany } from "../sponsors/glasser";
import { buildPipeline } from "../pipeline";

// Your AI sales team. Model ids map to the 3D characters (cfo/tech/procurement GLBs) and ElevenLabs voices.
export const TEAM = [
  { id: "cfo", name: "Maya", role: "Lead researcher", does: "finds and qualifies leads with live web research" },
  { id: "tech", name: "Arjun", role: "Outreach", does: "writes outreach emails for any lead" },
  { id: "procurement", name: "Elena", role: "Pipeline", does: "tracks every lead and deal and tells you what to do next" },
] as const;
export type TeamId = (typeof TEAM)[number]["id"];

export type Lead = {
  id: string;
  company: string;
  domain: string;
  why: string;
  sourceUrl: string;
  size?: string;
  funding?: string;
  status: "new" | "contacted" | "meeting";
  email?: { subject: string; body: string };
  foundBy: string;
  at: string;
};
export type TeamState = { offering: string; company?: string; url?: string; icp?: string; queries?: string[]; leads: Lead[]; chat: { who: string; text: string; at: string }[] };

const KEY = "team-state";
export async function loadTeam(): Promise<TeamState> {
  return (await kvGet<TeamState>(KEY)) ?? { offering: "", leads: [], chat: [] };
}
async function saveTeam(t: TeamState) {
  t.chat = t.chat.slice(-60);
  await kvSet(KEY, t);
}

function domainOf(u: string) {
  try {
    return new URL(/^https?:/.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
}

export type TeamReply = { speaker: TeamId; line: string; found?: Lead[]; email?: Lead; state: TeamState };

/** You talk; the right teammate answers and does the work. */
export async function teamTurn(text: string, player: string, offeringInput?: string): Promise<TeamReply> {
  const t = await loadTeam();
  if (offeringInput?.trim()) t.offering = offeringInput.trim();
  t.chat.push({ who: player, text, at: new Date().toISOString() });

  // 1. Who should handle it, and what do they do.
  const leadNames = t.leads.map((l) => l.company).join(", ") || "none yet";
  const { data: plan } = await llmJSON<{ agent: TeamId; action: "find_leads" | "draft_email" | "pipeline" | "chat"; query: string; company: string }>({
    label: "team-route",
    maxTokens: 300,
    system: `Our company: ${t.company ?? "?"}. Ideal customer: ${t.icp ?? "unknown"}. Route the seller's request to one teammate. Teammates: ${TEAM.map((m) => `${m.id}=${m.name} (${m.role}: ${m.does})`).join("; ")}. If the seller names a teammate, pick them. action: find_leads (search the web for new prospect companies; query = a web search query for companies that match who would buy what we sell, include the segment the seller asked for), draft_email (company = which lead), pipeline (status update on leads and deals), chat (anything else).`,
    user: `We sell: ${t.offering || "(not said yet)"}\nKnown leads: ${leadNames}\nSeller says: "${text}"`,
    schema: obj({ agent: enm(["cfo", "tech", "procurement"]), action: enm(["find_leads", "draft_email", "pipeline", "chat"]), query: str(), company: str() }),
    mock: () => ({
      agent: /arjun|email|outreach/i.test(text) ? "tech" : /elena|pipeline|status|update/i.test(text) ? "procurement" : "cfo",
      action: /email|outreach/i.test(text) ? "draft_email" : /pipeline|status|update/i.test(text) ? "pipeline" : "find_leads",
      query: `${text} companies`,
      company: t.leads[0]?.company ?? "",
    }),
  });

  const me = TEAM.find((m) => m.id === plan.agent) ?? TEAM[0];
  let line = "";
  let found: Lead[] | undefined;
  let email: Lead | undefined;

  if (plan.action === "find_leads") {
    // 2. Telem search for prospects, LLM picks real companies, Glasser enriches them.
    const { sources } = await searchWeb(plan.query || t.queries?.[0] || `${t.offering} companies`);
    const { data } = await llmJSON<{ leads: { company: string; domain: string; why: string; sourceUrl: string; sellsSameKindOfProduct?: boolean }[]; say: string }>({
      label: "team-leads",
      maxTokens: 1500,
      system: `You are ${me.name}, lead researcher on a sales team. From the search results, pick up to 5 REAL companies that would BUY what we sell (they have the problem we solve). NEVER pick our own company, and NEVER pick competitors or vendors that sell the same kind of product as us; skip media sites, directories, review sites and agencies. domain = the company's own website domain. why = one specific reason from the results. sourceUrl = the result URL it came from. Skip companies already in the lead list. say = 1-2 natural spoken sentences to the seller (first name ${player}) about the buyers you found (do not mention competitors).`,
      user: `Our company: ${t.company ?? "?"} (${t.url ?? ""})\nWe sell: ${t.offering || "(unknown)"}\nIdeal customer: ${t.icp ?? "unknown"}\nAlready have: ${leadNames}\nSearch results (Telem):\n${sources.map((x, i) => `[${i + 1}] ${x.title} ${x.url}\n${x.snippet.slice(0, 400)}`).join("\n\n") || "(none)"}`,
      schema: obj({ leads: arr(obj({ company: str(), domain: str(), why: str(), sourceUrl: str(), sellsSameKindOfProduct: { type: "boolean", description: "true if this company is a vendor/agency/tool in our own category (a competitor), not a buyer" } })), say: str() }),
      mock: () => ({ leads: [], say: `${player}, I couldn't reach live search right now.` }),
    });
    const ours = (t.url ? domainOf(t.url) : "").split(".")[0];
    const fresh = data.leads
      .filter((l) => !l.sellsSameKindOfProduct)
      .filter((l) => l.company && !t.leads.some((x) => x.company.toLowerCase() === l.company.toLowerCase()))
      .filter((l) => !ours || (!domainOf(l.domain || "").startsWith(ours) && !l.company.toLowerCase().replace(/\s/g, "").includes(ours)))
      .slice(0, 5);
    const enriched = await Promise.all(
      fresh.map(async (l, i) => {
        const domain = domainOf(l.domain || l.company);
        const e = i < 3 ? await enrichCompany(domain).catch(() => null) : null;
        const lead: Lead = {
          id: randomUUID().slice(0, 8),
          company: l.company,
          domain,
          why: l.why,
          sourceUrl: l.sourceUrl,
          size: e?.provider === "glasser" ? e.data.employees : undefined,
          funding: e?.provider === "glasser" ? e.data.funding : undefined,
          status: "new",
          foundBy: me.name,
          at: new Date().toISOString(),
        };
        return lead;
      }),
    );
    t.leads.unshift(...enriched);
    found = enriched;
    line = enriched.length ? data.say : `${player}, I searched but didn't find solid new companies. Try telling me a segment, like "fintech startups in New York".`;
  } else if (plan.action === "draft_email") {
    const lead = t.leads.find((l) => plan.company && l.company.toLowerCase().includes(plan.company.toLowerCase())) ?? t.leads[0];
    if (!lead) line = `${player}, we don't have any leads yet. Ask Maya to find some first.`;
    else {
      const { data } = await llmJSON<{ subject: string; body: string; say: string }>({
        label: "team-email",
        maxTokens: 800,
        system: `You are ${me.name}, outreach on a sales team. Write a short, specific cold email (under 110 words) from ${player} to ${lead.company} using the reason we found. No hype. Then say = one natural spoken sentence to ${player}.`,
        user: `We sell: ${t.offering}\nLead: ${lead.company} (${lead.domain}). Why them: ${lead.why}${lead.size ? `. Size: ${lead.size}` : ""}${lead.funding ? `. Funding: ${lead.funding}` : ""}`,
        schema: obj({ subject: str(), body: str(), say: str() }),
        mock: () => ({ subject: `${lead.company} + us`, body: `Hi ${lead.company} team,\n\n${lead.why}\n\nWorth a 20-minute call?\n\n${player}`, say: `Drafted the email to ${lead.company}.` }),
      });
      lead.email = { subject: data.subject, body: data.body };
      lead.status = lead.status === "new" ? "contacted" : lead.status;
      email = lead;
      line = data.say;
    }
  } else {
    const { deals } = await buildPipeline();
    const { data } = await llmJSON<{ say: string }>({
      label: "team-chat",
      maxTokens: 400,
      system: `You are ${me.name}, ${me.role} on ${player}'s sales team (${me.does}). Answer in 1-3 natural spoken sentences, using only the facts given. If useful, suggest which teammate to ask next (Maya finds leads, Arjun writes emails, Elena tracks the pipeline).`,
      user: `We sell: ${t.offering || "(not said yet)"}\nLeads: ${t.leads.map((l) => `${l.company} (${l.status})`).join(", ") || "none"}\nDeals in meetings: ${deals.map((d) => `${d.company} ${d.stage} risk ${d.risk}`).join("; ") || "none"}\nSeller says: "${text}"`,
      schema: obj({ say: str() }),
      mock: () => ({ say: `${player}, we have ${t.leads.length} leads and ${deals.length} deals in meetings.` }),
    });
    line = data.say;
  }

  t.chat.push({ who: me.id, text: line, at: new Date().toISOString() });
  await saveTeam(t);
  return { speaker: me.id, line, found, email, state: t };
}

/** You enter your company URL: Maya researches you with Telem, works out what you sell and who buys it, then goes hunting. */
export async function teamSetup(url: string, player: string): Promise<TeamReply> {
  const research = await researchSeller(url, "");
  const domain = domainOf(url);
  const { data } = await llmJSON<{ company: string; offering: string; icp: string; queries: string[]; say: string }>({
    label: "team-setup",
    maxTokens: 900,
    system: `You are Maya, lead researcher joining ${player}'s sales team. From the research about their own company, work out: company name; offering (what they sell, one line); icp (who buys it: industry, size, stage, buyer role, one line); queries (3 web search queries that surface specific BUYER companies matching the ICP. Do NOT put our product category words in the query (e.g. for a QA tool do not say "QA" or "testing"; search "SaaS startup raises Series B 2026" instead), otherwise the results are all competitors: search for buying signals such as funding rounds, hiring for the role that has the problem, or launches, e.g. "SaaS startup raises Series B 2026 hiring QA engineers"); say (2 natural spoken sentences to ${player}: what you understood they sell and who you'll go after).`,
    user: `Company website: ${url}\nResearch (Telem):\n${research.sources.map((x, i) => `[${i + 1}] ${x.title} ${x.url}\n${x.snippet.slice(0, 500)}`).join("\n\n") || "(none)"}`,
    schema: obj({ company: str(), offering: str(), icp: str(), queries: arr(str()), say: str() }),
    mock: () => ({ company: domain, offering: `${domain}'s product`, icp: "B2B software companies", queries: [`${domain} competitors customers`], say: `${player}, I looked at ${domain}. I'll start finding companies that look like your customers.` }),
  });
  const t: TeamState = { offering: data.offering, company: data.company, url, icp: data.icp, queries: data.queries, leads: [], chat: [] };
  const prev = await loadTeam();
  if (prev.url === url) t.leads = prev.leads; // same company: keep its leads
  t.chat.push({ who: "cfo", text: data.say, at: new Date().toISOString() });
  await saveTeam(t);
  const hunt = await teamTurn(`Maya, find leads that match our ideal customer: ${data.icp}`, player);
  return { ...hunt, line: `${data.say} ${hunt.line}` };
}
