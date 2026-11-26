import { ownerOfDomain, updateWorkspace, type Workspace } from "../workspace";
import { addProspects, fileContacts, markFit, previewQuery, prospectSearch, refineTouch } from "../gtm/prospect";
import { agentStatus, runNow } from "../agent/runner";
import { enqueue, getInbound, listInbound, listMailboxes, listOutbox, markHandled } from "../agent/store";
// Deal Room as an MCP connector: the same team (Maya, Arjun, Elena) and GTM engine the web app uses,
// exposed as tools so the pipeline runs from inside Claude or ChatGPT.
// Every tool names the seller's company; each company has its own room, exactly like the web app.

import { bookMeeting, loadTeam, removeLead, resolveCompanyUrl, teamSetup, teamTurn, withCompany, type Lead, type TeamState } from "../agents/team";
import { analytics, decideTouch, draftSequence, memorySearch, onLeadsFound, stageOf } from "../gtm/engine";
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
  run: (a: Args, ctx: { ws: Workspace | null }) => Promise<Json>;
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

const NOT_SENT = "An approved email is sent from the user's connected mailbox in their next sending window (if they connected one in Deal Room → Settings). LinkedIn notes are never sent automatically: the user sends those by hand.";

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
  /* ---------- workspace tools (need the workspace's MCP link) ---------- */
  {
    name: "search_prospects",
    title: "Search for prospects",
    description: "Describe who to find in plain words (e.g. 'founders who just launched an AI-built web app'). Searches the live web and returns companies with the signal, why they fit, and a source link. Nothing is saved; call add_prospect for the ones the user wants.",
    inputSchema: schema({ company: COMPANY, query: { type: "string", description: "Who to find, in plain words." } }, ["company", "query"]),
    annotations: { readOnlyHint: true, openWorldHint: true },
    run: async (a) => {
      const r = await prospectSearch(a.query ?? "");
      return { filters: r.filters, searched: r.searched, results: r.results };
    },
  },
  {
    name: "add_prospect",
    title: "Add a prospect to the agent",
    description: "Adds one company (usually from search_prospects) to the pipeline. The agent then finds the right people, verifies emails and writes the outreach for review.",
    inputSchema: schema(
      {
        company: COMPANY,
        buyer: { type: "string", description: "The buyer company's name." },
        domain: { type: "string", description: "The buyer's website domain, if known." },
        signal: { type: "string", description: "The fact that makes them a fit right now." },
        source_url: { type: "string", description: "Where the signal comes from." },
        why: { type: "string", description: "One sentence: why they would buy now." },
      },
      ["company", "buyer"],
    ),
    annotations: { readOnlyHint: false, openWorldHint: true },
    run: async (a) => {
      const added = await addProspects([{ company: a.buyer!, domain: a.domain ?? "", signal: a.signal ?? a.why ?? "", why: a.why ?? a.signal ?? "", sourceUrl: a.source_url ?? "", sourceTitle: "", kind: "other", known: false }]);
      if (added.length) void onLeadsFound(added);
      return added.length ? { added: brief(added[0]), next: "The agent is researching people and emails; drafts appear in review shortly." } : { added: null, note: "Already in the pipeline, or no website could be found for it." };
    },
  },
  {
    name: "list_contacts",
    title: "List contacts",
    description: "Everyone the agent found at its companies: name, title, persona, email and email status, list, and where they stand.",
    inputSchema: schema({ company: COMPANY, list: { type: "string", description: "Only people in this list." }, persona: { type: "string", description: "Only people matching this persona." } }, ["company"]),
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (a) => {
      const t = await loadTeam();
      const rows = t.leads.flatMap((l) => (l.contacts ?? []).map((c) => ({ lead_id: l.id, contact_id: c.id, name: c.name, title: c.title, persona: c.persona, buyer: l.company, email: c.email, email_status: c.emailStatus, list: c.list, stage: stageOf(l), fit: l.feedback?.fit })));
      return { contacts: rows.filter((r) => (!a.list || r.list === a.list) && (!a.persona || r.persona === a.persona)).slice(0, 200), lists: t.lists ?? [] };
    },
  },
  {
    name: "add_to_list",
    title: "Add a contact to a list",
    description: "Files one contact under a named list (created if new). Use list_contacts for the ids.",
    inputSchema: schema({ company: COMPANY, lead_id: { type: "string" }, contact_id: { type: "string" }, list: { type: "string", description: "List name; empty takes them off their list." } }, ["company", "lead_id", "contact_id", "list"]),
    annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
    run: async (a) => {
      await fileContacts([{ leadId: a.lead_id!, contactId: a.contact_id! }], a.list ?? "");
      return { ok: true, list: a.list };
    },
  },
  {
    name: "mark_fit",
    title: "Mark a lead good fit or not",
    description: "Teaches the agent: 'good' finds more like this, 'bad' (with a reason) avoids companies like it. Only record what the user said.",
    inputSchema: schema({ company: COMPANY, lead: LEAD, fit: { type: "string", enum: ["good", "bad"] }, reason: { type: "string", description: "Why it is not a fit (bad only)." } }, ["company", "lead", "fit"]),
    annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
    run: async (a) => {
      const l = findLead(await loadTeam(), a.lead);
      await markFit(l.id, a.fit === "good" ? "good" : "bad", a.reason);
      return { lead: l.company, fit: a.fit };
    },
  },
  {
    name: "refine_email",
    title: "Rewrite a drafted email",
    description: "Rewrites one pending email to an instruction ('shorter', 'softer ask'), keeping every fact, and saves it as an edit (still pending until approved).",
    inputSchema: schema({ company: COMPANY, lead: LEAD, touch_id: { type: "string" }, instruction: { type: "string" } }, ["company", "lead", "touch_id", "instruction"]),
    annotations: { readOnlyHint: false, openWorldHint: false },
    run: async (a) => {
      const l = findLead(await loadTeam(), a.lead);
      const d = await refineTouch(l.id, a.touch_id!, a.instruction ?? "");
      await decideTouch(l.id, a.touch_id!, "edit", { subject: d.subject || undefined, body: d.body });
      return { lead: l.company, touch_id: a.touch_id, subject: d.subject, body: d.body };
    },
  },
  {
    name: "get_inbox",
    title: "Read replies",
    description: "Replies from prospects, newest first, each with its category (interested, not now, unsubscribe…) and the drafted answer.",
    inputSchema: schema({ company: COMPANY, only_open: { type: "string", enum: ["yes", "no"], description: "yes = only replies not handled yet (default)." } }, ["company"]),
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (a, { ws }) => {
      const w = need(ws);
      const rows = await listInbound(w.id, 100);
      return {
        replies: rows
          .filter((r) => a.only_open === "no" || !r.handled)
          .map((r) => ({ reply_id: r.id, from: r.from_email, subject: r.subject, category: r.category, text: r.clean ?? r.text?.slice(0, 1500), drafted_answer: r.draft, received: r.received_at, handled: Boolean(r.handled) })),
      };
    },
  },
  {
    name: "send_reply",
    title: "Answer a reply",
    description: "Sends an answer to a prospect who wrote back, from the connected mailbox, in the same thread, right away. Only send what the user approved.",
    inputSchema: schema({ company: COMPANY, reply_id: { type: "string" }, body: { type: "string", description: "The answer. Empty uses the drafted answer." } }, ["company", "reply_id"]),
    annotations: { readOnlyHint: false, openWorldHint: true },
    run: async (a, { ws }) => {
      const w = need(ws);
      const r = await getInbound(w.id, a.reply_id!);
      if (!r || !r.from_email) throw new ToolError("No reply with that id.");
      const boxes = await listMailboxes(w.id);
      const box = boxes.find((x) => x.id === r.mailbox_id) ?? boxes[0];
      if (!box) throw new ToolError("No mailbox is connected. Connect one in Deal Room → Settings.");
      const body = (a.body ?? "").trim() || r.draft || "";
      if (!body) throw new ToolError("Nothing to send: give a body.");
      await enqueue({ workspaceId: w.id, leadId: r.lead_id ?? "", touchId: `reply-${r.id}`, mailboxId: box.id, to: r.from_email, subject: r.subject?.startsWith("Re:") ? r.subject : `Re: ${r.subject ?? ""}`, body, inReplyTo: r.message_id ?? undefined, at: new Date(Date.now() + 30e3) });
      await markHandled(w.id, r.id);
      return { sent_to: r.from_email, within: "a minute" };
    },
  },
  {
    name: "agent_status",
    title: "Agent status",
    description: "Whether the agent is running, autopilot or review mode, schedule, today's usage, the next sending window, recent log lines and the send queue.",
    inputSchema: schema({ company: COMPANY }, ["company"]),
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (_a, { ws }) => {
      const w = need(ws);
      const [status, outbox, boxes] = await Promise.all([agentStatus(w), listOutbox(w.id, 30), listMailboxes(w.id)]);
      return {
        running: w.settings.active,
        mode: w.settings.autopilot ? "autopilot (approved automatically)" : "review (waits for approval)",
        schedule: { timezone: w.settings.timezone, start_hour: w.settings.launchHour, days: w.settings.days, new_leads_per_day: w.settings.dailyLeadTarget },
        mailboxes: boxes.map((b) => ({ email: b.email, provider: b.provider ?? "smtp", daily_cap: b.dailyCap })),
        status,
        queue: outbox.map((o) => ({ to: o.to_email, subject: o.subject, status: o.status, at: o.scheduled_at, error: o.error })),
      };
    },
  },
  {
    name: "control_agent",
    title: "Start, pause or switch mode",
    description: "start / pause the agent, run_now (search for new leads now), autopilot_on (send approved-by-agent emails without review) or autopilot_off (every email waits for review). Only on the user's request.",
    inputSchema: schema({ company: COMPANY, action: { type: "string", enum: ["start", "pause", "run_now", "autopilot_on", "autopilot_off"] } }, ["company", "action"]),
    annotations: { readOnlyHint: false, openWorldHint: true },
    run: async (a, { ws }) => {
      const w = need(ws);
      if (a.action === "run_now") return { found: await runNow(w) };
      const patch = a.action === "start" ? { active: true } : a.action === "pause" ? { active: false } : { autopilot: a.action === "autopilot_on" };
      const after = await updateWorkspace(w.id, { settings: patch });
      return { running: after?.settings.active, autopilot: after?.settings.autopilot };
    },
  },
  {
    name: "preview_leads",
    title: "Preview leads for the current targeting",
    description: "Five companies the current targeting finds right now, each with signal and source. Use with mark_fit / add_prospect to tune targeting.",
    inputSchema: schema({ company: COMPANY }, ["company"]),
    annotations: { readOnlyHint: true, openWorldHint: true },
    run: async () => {
      const r = await prospectSearch(previewQuery(await loadTeam()));
      return { results: r.results.filter((x) => !x.known).slice(0, 5) };
    },
  },
];

function need(ws: Workspace | null): Workspace {
  if (!ws) throw new ToolError("This tool needs your workspace's private MCP link (Deal Room → MCP).");
  return ws;
}


/** Run one tool inside the seller's own room. A bare company name is looked up first, as on the web app. */
/** ws = the workspace the caller's key belongs to (null without a key). A key pins every call to its own company;
 *  without one, a company that belongs to a workspace is refused, so nobody can read or approve another customer's outreach. */
export async function callTool(name: string, args: Args, ws: Workspace | null = null): Promise<Json> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new ToolError(`Unknown tool: ${name}`);
  if (ws?.url) args = { ...args, company: ws.url };
  for (const k of tool.inputSchema.required) if (!args[k]?.toString().trim()) throw new ToolError(`Missing required argument: ${k}`);
  for (const k of Object.keys(args)) if (args[k] !== undefined && typeof args[k] !== "string") throw new ToolError(`Argument ${k} must be text.`);
  const company = await resolveCompanyUrl(args.company!);
  const owner = await ownerOfDomain(company);
  if (owner && owner !== ws?.id) throw new ToolError("This company has a Deal Room workspace. Connect with that workspace's own MCP link (Deal Room → MCP) to work on it.");
  return withCompany(company, () => withModel(undefined, () => tool.run({ ...args, company }, { ws })));
}
