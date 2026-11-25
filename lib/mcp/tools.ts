// Deal Room as an MCP connector: the same team (Maya, Arjun, Elena) and GTM engine the web app uses,
// exposed as tools so the pipeline runs from inside Claude or ChatGPT.
// Every tool names the seller's company; each company has its own room, exactly like the web app.

import { bookMeeting, loadTeam, removeLead, resolveCompanyUrl, teamSetup, teamTurn, withCompany, type Lead, type TeamState } from "../agents/team";
import { analytics, decideTouch, draftSequence, memorySearch, stageOf } from "../gtm/engine";
import { STAGES } from "../gtm/types";
import { withModel } from "../llm";
import { PRICES, usage } from "../sponsors/flexprice";

type Json = Record<string, unknown>;
type Schema = { type: "object"; properties: Record<string, Json>; required: string[]; additionalProperties: false };
type Args = Record<string, string | undefined>;

export type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Schema;
  annotations: { readOnlyHint: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint: boolean };
  run: (a: Args) => Promise<Json>;
};

const COMPANY = { type: "string", description: "The seller's own company: website URL or domain, e.g. acme.com. This is the company doing the selling, never the buyer." };
const LEAD = { type: "string", description: "The buyer: a lead id from list_leads, or the buyer company's name or domain." };
const schema = (properties: Record<string, Json>, required: string[]): Schema => ({ type: "object", properties, required, additionalProperties: false });

export class ToolError extends Error {}

function findLead(t: TeamState, ref: string | undefined): Lead {
  const r = (ref ?? "").trim().toLowerCase();
  if (!r) throw new ToolError("Say which lead: an id from list_leads, or the buyer company's name.");
  const bare = r.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  const hit =
    t.leads.find((l) => l.id.toLowerCase() === r) ??
    t.leads.find((l) => l.company.toLowerCase() === r || l.domain.toLowerCase() === bare) ??
    t.leads.find((l) => l.company.toLowerCase().includes(r));
  if (!hit) throw new ToolError(`No lead matches "${ref}". Known leads: ${t.leads.map((l) => l.company).join(", ") || "none yet (run find_buyers first)"}.`);
  return hit;
}

function brief(l: Lead) {
  return {
    id: l.id,
    company: l.company,
    domain: l.domain,
    why: l.why,
    source: l.sourceUrl,
    stage: stageOf(l),
    tier: l.tier,
    score: l.score,
    size: l.size,
    funding: l.funding,
    contacts: l.contacts?.length ?? 0,
    outreach: l.sequence?.length ? `${l.sequence.filter((m) => m.approval === "pending").length} pending, ${l.sequence.filter((m) => m.approval === "approved").length} approved` : "not drafted",
  };
}

function full(l: Lead) {
  return {
    ...brief(l),
    industry: l.industry,
    hq: l.hq,
    scoreWhy: l.scoreWhy,
    enrichment: l.enriched ?? "not run",
    signals: l.signals ?? [],
    people: (l.contacts ?? []).map((c) => ({ name: c.name, title: c.title, email: c.email, emailStatus: c.emailStatus, linkedin: c.linkedin, source: c.source })),
    outreachSequence: (l.sequence ?? []).map(touch),
    meeting: l.meeting,
  };
}

function touch(m: NonNullable<Lead["sequence"]>[number]) {
  return { touch_id: m.id, step: m.step, channel: m.channel, sendOnDay: m.dayOffset, to: m.to, subject: m.subject, body: m.body, approval: m.approval, edited: m.edited ?? false, citations: m.citations ?? [] };
}

/** The room must exist before anyone works in it; a tool called on a new company sets it up first. */
async function room(company: string): Promise<TeamState> {
  const t = await loadTeam();
  if (t.url) return t;
  await teamSetup(company, "there", false);
  return loadTeam();
}

const NOT_SENT = "Deal Room does not deliver email or LinkedIn messages yet: an approved message is marked ready and the user sends it themselves.";

export const TOOLS: Tool[] = [
  {
    name: "start_company",
    title: "Set up a company",
    description:
      "Start here. Reads the seller's website and works out what they sell, who buys it (ideal customer profile), their customers and pricing. Opens that company's Deal Room. Takes 10 to 30 seconds. Safe to call again: existing leads are kept.",
    inputSchema: schema({ company: COMPANY, your_name: { type: "string", description: "First name of the person selling. Outreach is signed with it." } }, ["company"]),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    run: async (a) => {
      const r = await teamSetup(a.company!, a.your_name?.trim() || "there", false);
      const t = r.state;
      return {
        company: t.company,
        website: t.url,
        sells: t.offering,
        idealCustomer: t.icp,
        knownCustomers: t.intake?.customers || undefined,
        pricing: t.intake?.pricing || undefined,
        leadsSoFar: t.leads.length,
        maya: r.line,
        next: "Call find_buyers to get buyer companies. A detailed ICP and a competitor map are being built in the background; get_company shows them once ready.",
      };
    },
  },
  {
    name: "find_buyers",
    title: "Find buyers",
    description:
      "Maya searches the live web for companies likely to buy from the seller, using buying signals (funding, hiring, launches). Returns new named companies with the reason and a source link. Competitors are never returned. Takes 30 to 90 seconds; call again for more. The first three new leads are enriched with people and scores in the background.",
    inputSchema: schema({ company: COMPANY, focus: { type: "string", description: "Optional segment to go after, e.g. 'fintech in Europe' or 'Series B dev tools'." } }, ["company"]),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    run: async (a) => {
      const t = await room(a.company!);
      const ask = a.focus?.trim() ? `Maya, find leads in this segment: ${a.focus.trim()}. They must match our ideal customer: ${t.icp ?? ""}` : `Maya, find leads that match our ideal customer: ${t.icp ?? ""}`;
      const r = await teamTurn(ask, t.rep ?? "You");
      return { maya: r.line, found: (r.found ?? []).map(brief), totalLeads: r.state.leads.length, next: "Call draft_outreach with a lead to get a three-touch sequence, or get_lead for people and signals." };
    },
  },
  {
    name: "list_leads",
    title: "List leads",
    description: "All buyer companies found so far for the seller, with stage, tier, score and outreach status.",
    inputSchema: schema({ company: COMPANY, stage: { type: "string", enum: STAGES.map((s) => s.key), description: "Only leads in this pipeline stage." } }, ["company"]),
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (a) => {
      const t = await loadTeam();
      const leads = t.leads.filter((l) => !a.stage || stageOf(l) === a.stage);
      return { company: t.company, count: leads.length, leads: leads.map(brief), hint: t.url ? undefined : "This company is not set up yet. Call start_company first." };
    },
  },
  {
    name: "get_lead",
    title: "Lead details",
    description: "Everything known about one buyer: buying signals with sources, decision-makers with email status, fit and intent score, the outreach sequence and any meeting.",
    inputSchema: schema({ company: COMPANY, lead: LEAD }, ["company", "lead"]),
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (a) => full(findLead(await loadTeam(), a.lead)),
  },
  {
    name: "draft_outreach",
    title: "Draft outreach",
    description: `Arjun writes a three-touch sequence for one buyer (email, LinkedIn note, follow-up email), grounded in that buyer's real signals. Enriches the lead first if needed (people and emails; uses $${PRICES.lead_enriched.toFixed(2)} of credit). Every message comes back as pending: show them to the user and use review_outreach with their decision. Takes 20 to 60 seconds. Calling again replaces the earlier draft.`,
    inputSchema: schema({ company: COMPANY, lead: LEAD }, ["company", "lead"]),
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    run: async (a) => {
      const l = findLead(await loadTeam(), a.lead);
      const t = await draftSequence(l.id);
      const now = t.leads.find((x) => x.id === l.id) ?? l;
      return {
        buyer: now.company,
        enrichment: now.enriched ?? "not run",
        note: now.enriched === "blocked" ? "Credits ran out, so people and emails were not looked up; the draft uses what was already known." : undefined,
        sequence: (now.sequence ?? []).map(touch),
        next: `Show these to the user. Nothing is approved until they say so; then call review_outreach. ${NOT_SENT}`,
      };
    },
  },
  {
    name: "review_outreach",
    title: "Approve, edit or reject a message",
    description: `Record the user's decision on one drafted message. Only call with a decision the user actually gave. 'edit' changes the subject or body and leaves it pending. 'approve' marks it ready, moves the lead to contacted and uses $${PRICES.outreach_sent.toFixed(2)} of credit. ${NOT_SENT}`,
    inputSchema: schema(
      {
        company: COMPANY,
        lead: LEAD,
        touch_id: { type: "string", description: "touch_id of the message, from draft_outreach or get_lead." },
        decision: { type: "string", enum: ["approve", "edit", "reject"] },
        subject: { type: "string", description: "New subject (edit only)." },
        body: { type: "string", description: "New body (edit only)." },
      },
      ["company", "lead", "touch_id", "decision"],
    ),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    run: async (a) => {
      const l = findLead(await loadTeam(), a.lead);
      const m = l.sequence?.find((x) => x.id === a.touch_id);
      if (!m) throw new ToolError(`No message ${a.touch_id} for ${l.company}. Its messages: ${(l.sequence ?? []).map((x) => `${x.id} (step ${x.step}, ${x.channel})`).join(", ") || "none, call draft_outreach first"}.`);
      const d = a.decision as "approve" | "edit" | "reject";
      if (!["approve", "edit", "reject"].includes(d)) throw new ToolError("decision must be approve, edit or reject.");
      if (d === "edit" && a.subject === undefined && a.body === undefined) throw new ToolError("An edit needs a new subject or body.");
      const t = await decideTouch(l.id, m.id, d, d === "edit" ? { subject: a.subject, body: a.body } : undefined);
      const now = t.leads.find((x) => x.id === l.id) ?? l;
      return { buyer: now.company, stage: stageOf(now), message: touch(now.sequence!.find((x) => x.id === m.id)!), note: d === "approve" ? NOT_SENT : undefined };
    },
  },
  {
    name: "prepare_meeting",
    title: "Prepare a meeting invite",
    description: "Elena picks the next free weekday slot for a 30-minute intro call with a buyer, writes the invite subject and note, and moves the lead to the meeting stage. Nothing is sent to the buyer: the user sends the invite from their own calendar.",
    inputSchema: schema({ company: COMPANY, lead: LEAD }, ["company", "lead"]),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    run: async (a) => {
      const t = await loadTeam();
      const l = findLead(t, a.lead);
      const r = await bookMeeting(l.id, t.rep ?? "You");
      return { buyer: l.company, elena: r.line, meeting: r.meeting?.meeting, note: "The buyer has not been invited. The user sends this from their own calendar." };
    },
  },
  {
    name: "remove_lead",
    title: "Remove a lead",
    description: "The user says a lead is not a buyer (a competitor or a wrong fit). Removes it and stops Maya from suggesting it again. Only call when the user asks.",
    inputSchema: schema({ company: COMPANY, lead: LEAD }, ["company", "lead"]),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    run: async (a) => {
      const l = findLead(await loadTeam(), a.lead);
      const t = await removeLead(l.id);
      return { removed: l.company, leadsLeft: t.leads.length };
    },
  },
  {
    name: "get_company",
    title: "Company profile, ICP and competitors",
    description: "What Deal Room knows about the seller: offering, detailed ideal customer profile with confidence scores, and the competitor map with sources.",
    inputSchema: schema({ company: COMPANY }, ["company"]),
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async () => {
      const t = await loadTeam();
      if (!t.url) return { hint: "This company is not set up yet. Call start_company first." };
      return { company: t.company, website: t.url, sells: t.offering, idealCustomer: t.icp, icp: t.icpSpec ?? "still being built, try again in a minute", competitors: t.competitors ?? "still being mapped, try again in a minute", excluded: t.excluded ?? [] };
    },
  },
  {
    name: "pipeline_summary",
    title: "Pipeline summary",
    description: "Funnel counts and conversion by stage, results by industry and tier, messages waiting for approval, recent team activity and the credit balance.",
    inputSchema: schema({ company: COMPANY }, ["company"]),
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async () => {
      const t = await loadTeam();
      const an = analytics(t);
      const bill = await usage().catch(() => null);
      const waiting = t.leads.flatMap((l) => (l.sequence ?? []).filter((m) => m.approval === "pending").map((m) => ({ buyer: l.company, lead: l.id, touch_id: m.id, step: m.step, channel: m.channel, subject: m.subject })));
      return {
        company: t.company,
        leads: t.leads.length,
        funnel: an.funnel,
        conversion: an.conv,
        byIndustry: an.byIndustry,
        byTier: an.byTier,
        waitingForApproval: waiting,
        meetings: t.leads.filter((l) => l.meeting).map((l) => ({ buyer: l.company, when: l.meeting!.when })),
        recentActivity: (t.activity ?? []).slice(0, 8).map((x) => `${x.who}: ${x.text}`),
        credits: bill ? { balance: bill.balance, prices: bill.prices } : undefined,
      };
    },
  },
  {
    name: "search_memory",
    title: "Search what the team knows",
    description: "Semantic search over everything collected for this seller: leads, buying signals, people, competitors and drafted messages. Use for questions like 'who just raised money' or 'which leads use Salesforce'.",
    inputSchema: schema({ company: COMPANY, query: { type: "string", description: "What to look for, in plain words." } }, ["company", "query"]),
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (a) => {
      if (!a.query?.trim()) throw new ToolError("query is empty.");
      const r = await memorySearch(a.query.trim());
      return { hits: r.hits.map((h) => ({ text: h.text, kind: h.metadata?.kind, lead: h.metadata?.leadId, source: h.metadata?.url || undefined })) };
    },
  },
];

/** Run one tool inside the seller's own room. A bare company name is looked up first, as on the web app. */
export async function callTool(name: string, args: Args): Promise<Json> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new ToolError(`Unknown tool: ${name}`);
  for (const k of tool.inputSchema.required) if (!args[k]?.toString().trim()) throw new ToolError(`Missing required argument: ${k}`);
  for (const k of Object.keys(args)) if (args[k] !== undefined && typeof args[k] !== "string") throw new ToolError(`Argument ${k} must be text.`);
  const company = await resolveCompanyUrl(args.company!);
  return withCompany(company, () => withModel(undefined, () => tool.run({ ...args, company })));
}
