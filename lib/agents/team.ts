import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { arr, enm, llmJSON, obj, str } from "../llm";
import { kvGet, kvSet } from "../db";
import { researchSeller, searchWeb } from "../sponsors/telem";
import { enrichCompany } from "../sponsors/glasser";
import { passesKeywords, targetingRules } from "../gtm/targeting";

// Your AI sales team. Model ids map to the 3D characters (cfo/tech/procurement GLBs) and ElevenLabs voices.
export const TEAM = [
  {
    id: "cfo",
    name: "Maya",
    role: "Lead researcher",
    does: "finds and qualifies leads with live web research",
  },
  {
    id: "tech",
    name: "Arjun",
    role: "Outreach",
    does: "writes outreach emails for any lead",
  },
  {
    id: "procurement",
    name: "Elena",
    role: "Pipeline",
    does: "tracks every lead and deal and tells you what to do next",
  },
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
  meeting?: { when: string; start: string; subject: string; invite: string };
  foundBy: string;
  at: string;
} & import("../gtm/types").LeadGtm;
export type TeamState = {
  offering: string;
  company?: string;
  url?: string;
  icp?: string;
  queries?: string[];
  leads: Lead[];
  chat: { who: string; text: string; at: string }[];
  /** Companies the seller marked "not a buyer" (competitors, wrong fit). Maya never suggests them again. */
  excluded?: string[];
} & import("../gtm/types").TeamGtm;

// Every company gets its own room: requests run inside withCompany(domain), and load/save use that company's key.
const companyScope = new AsyncLocalStorage<string>();
/** The company domain the current request or job runs for. */
export function currentCompany() {
  return companyScope.getStore() ?? "";
}
export function withCompany<T>(urlOrDomain: string | undefined, fn: () => Promise<T>): Promise<T> {
  const d = urlOrDomain?.trim() ? domainOf(urlOrDomain.trim()).toLowerCase() : "";
  return d ? companyScope.run(d, fn) : fn();
}
function key() {
  const d = companyScope.getStore();
  return d ? `team-state:${d}` : "team-state:none";
}
export async function loadTeam(): Promise<TeamState> {
  const t = (await kvGet<TeamState>(key())) ?? { offering: "", leads: [], chat: [] };
  for (const l of t.leads) {
    if (l.email) l.email = { subject: clean(l.email.subject, t), body: clean(l.email.body, t) };
    if (l.meeting) l.meeting = { ...l.meeting, subject: clean(l.meeting.subject, t), invite: clean(l.meeting.invite, t) };
  }
  return t;
}

/** No template placeholders ever reach the seller: [Your Company] becomes the real name, other [..] slots are dropped. */
function clean(text: string, t: Pick<TeamState, "company">) {
  return text
    .replace(/\[(your|our|my)?\s*company( name)?\]/gi, t.company ?? "our team")
    .replace(/\s*\[[^\]\n]{1,40}\]/g, "")
    .replace(/ from ,/g, ",");
}
const RANK = { new: 0, contacted: 1, meeting: 2 } as const;
/**
 * Save without losing work from requests that ran at the same time (you talking while a teammate works):
 * merge with what is stored now. `replace` is for setup and pruning, where dropping leads is the point.
 */
export async function saveTeam(t: TeamState, opts: { replace?: boolean } = {}) {
  const cur = opts.replace ? null : await kvGet<TeamState>(key());
  if (cur && cur.url === t.url) {
    const mine = new Map(t.leads.map((l) => [l.id, l]));
    for (const old of cur.leads) {
      const l = mine.get(old.id);
      if (!l) {
        t.leads.push(old);
        continue;
      }
      l.email ??= old.email;
      l.meeting ??= old.meeting;
      for (const k of Object.keys(old) as (keyof Lead)[]) if (l[k] === undefined) (l as Record<string, unknown>)[k] = old[k];
      if (RANK[old.status] > RANK[l.status]) l.status = old.status;
    }
    // A lead the seller removed while this request was still working (background enrichment, a draft) stays removed.
    t.excluded = [...new Set([...(cur.excluded ?? []), ...(t.excluded ?? [])])].slice(-100);
    const gone = new Set(t.excluded.map((x) => x.toLowerCase()));
    t.leads = t.leads.filter((l) => !gone.has(l.company.toLowerCase()));
    const seen = new Set(t.chat.map((c) => `${c.at}|${c.who}|${c.text}`));
    t.chat.push(...cur.chat.filter((c) => !seen.has(`${c.at}|${c.who}|${c.text}`)));
    t.chat.sort((x, y) => x.at.localeCompare(y.at));
    const seenA = new Set((t.activity ?? []).map((a) => a.id));
    t.activity = [...(t.activity ?? []), ...(cur.activity ?? []).filter((a) => !seenA.has(a.id))].sort((x, y) => y.at.localeCompare(x.at)).slice(0, 300);
    t.icpSpec ??= cur.icpSpec;
    t.competitors ??= cur.competitors;
    t.intake ??= cur.intake;
    t.personas ??= cur.personas;
    t.personasConfirmed ??= cur.personasConfirmed;
    t.targeting ??= cur.targeting;
    t.campaign ??= cur.campaign;
    t.knowledge ??= cur.knowledge;
    t.leads.sort((x, y) => y.at.localeCompare(x.at));
  }
  // GTM data is never dropped, even by a replace (prune/setup) that raced with the ICP or competitor builders.
  if (opts.replace) {
    const now = await kvGet<TeamState>(key());
    if (now && (!t.url || now.url === t.url)) {
      t.icpSpec ??= now.icpSpec;
      t.competitors ??= now.competitors;
      t.intake ??= now.intake;
      t.personas ??= now.personas;
      t.personasConfirmed ??= now.personasConfirmed;
      t.targeting ??= now.targeting;
      t.campaign ??= now.campaign;
      t.knowledge ??= now.knowledge;
      const seenA = new Set((t.activity ?? []).map((a) => a.id));
      t.activity = [...(t.activity ?? []), ...(now.activity ?? []).filter((a) => !seenA.has(a.id))].sort((x, y) => y.at.localeCompare(x.at)).slice(0, 300);
      const byId = new Map(now.leads.map((l) => [l.id, l]));
      for (const l of t.leads) {
        const o = byId.get(l.id);
        if (o) for (const k of Object.keys(o) as (keyof Lead)[]) if (l[k] === undefined) (l as Record<string, unknown>)[k] = o[k];
      }
    }
  }
  t.chat = t.chat.slice(-60);
  await kvSet(key(), t);
}

function domainOf(u: string) {
  try {
    return new URL(/^https?:/.test(u) ? u : `https://${u}`).hostname.replace(
      /^www\./,
      "",
    );
  } catch {
    return u;
  }
}

export type TeamReply = {
  speaker: TeamId;
  line: string;
  found?: Lead[];
  email?: Lead;
  meeting?: Lead;
  recall?: import("../gtm/engine").Recall;
  state: TeamState;
};

// Teammates act, they never ask the seller for permission or next steps.
const ACT =
  ' You already did the work: say what you did and what you are doing next. NEVER ask the seller a question, never ask for permission, never say "let me know" or "want me to".';

/** Next weekday slot at 10:00 or 14:00 local, at least a day out. */
function nextSlot(i: number) {
  const d = new Date();
  d.setDate(d.getDate() + 1 + Math.floor(i / 2));
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  d.setHours(i % 2 ? 14 : 10, 0, 0, 0);
  return d;
}

/** Elena books a meeting with a lead: picks a slot, writes the invite, moves the lead to "meeting". */
export async function bookMeeting(
  leadId: string,
  player: string,
): Promise<TeamReply> {
  const t = await loadTeam();
  const lead = t.leads.find((l) => l.id === leadId);
  const me = TEAM[2];
  if (!lead) return { speaker: me.id, line: "That lead is gone.", state: t };
  const start = nextSlot(t.leads.filter((l) => l.meeting).length);
  const when = start.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const { data } = await llmJSON<{
    subject: string;
    invite: string;
    say: string;
  }>({
    label: "team-book",
    maxTokens: 600,
    system: `You are Elena, pipeline on ${player}'s sales team. You booked a 30-minute intro call with a lead. Write the calendar invite: subject and a short invite note (under 70 words) from ${player} with a clear agenda tied to why they need us. say = one natural spoken sentence to ${player} saying the meeting is booked and when.${ACT}`,
    user: `We sell: ${t.offering}\nLead: ${lead.company} (${lead.domain}). Why them: ${lead.why}\nSlot: ${when}`,
    schema: obj({ subject: str(), invite: str(), say: str() }),
    mock: () => ({
      subject: `${lead.company} × intro call`,
      invite: `30 minutes to walk through ${lead.why.toLowerCase()} and agree on next steps.`,
      say: `${player}, I booked ${lead.company} for ${when} and sent the invite.`,
    }),
  });
  lead.meeting = {
    when,
    start: start.toISOString(),
    subject: data.subject,
    invite: data.invite,
  };
  lead.status = "meeting";
  lead.stage = "meeting";
  lead.history = [...(lead.history ?? []), { at: new Date().toISOString(), stage: "meeting", actor: "agent", who: "Elena", note: when }];
  t.activity = [{ id: randomUUID().slice(0, 10), at: new Date().toISOString(), actor: "agent" as const, who: "Elena", kind: "stage" as const, text: `${lead.company} → meeting booked for ${when}`, leadId: lead.id }, ...(t.activity ?? [])];
  t.chat.push({ who: me.id, text: data.say, at: new Date().toISOString() });
  await saveTeam(t);
  return { speaker: me.id, line: data.say, meeting: lead, state: t };
}

/** You talk; the right teammate answers and does the work. */
export async function teamTurn(
  text: string,
  player: string,
  offeringInput?: string,
  auto = false,
): Promise<TeamReply> {
  const t = await loadTeam();
  // Setup (your URL) is the source of truth; a typed offering only fills in when setup never ran.
  if (offeringInput?.trim() && !t.company) t.offering = offeringInput.trim();
  t.chat.push({ who: player, text, at: new Date().toISOString() });
  if (player && player !== "You") t.rep = player;

  // 1. Who should handle it, and what do they do.
  const leadNames = t.leads.map((l) => l.company).join(", ") || "none yet";
  const { data: plan } = await llmJSON<{
    agent: TeamId;
    action: "find_leads" | "draft_email" | "pipeline" | "ask" | "chat";
    query: string;
    company: string;
  }>({
    label: "team-route",
    maxTokens: 300,
    system: `Our company: ${t.company ?? "?"}. Ideal customer: ${t.icp ?? "unknown"}. Route the seller's request to one teammate. Teammates: ${TEAM.map((m) => `${m.id}=${m.name} (${m.role}: ${m.does})`).join("; ")}. If the seller names a teammate, pick them. action: find_leads (search the web for new prospect companies; query = a web search query for companies that match who would buy what we sell, include the segment the seller asked for), draft_email (company = which lead), pipeline (status update on leads and deals), ask (any question about what we know: a lead, company, person, buying signal, competitor, our ICP, or who is hiring/raising/launching; answered from team memory), chat (small talk or anything else).`,
    user: `We sell: ${t.offering || "(not said yet)"}\nKnown leads: ${leadNames}\nSeller says: "${text}"`,
    schema: obj({
      agent: enm(["cfo", "tech", "procurement"]),
      action: enm(["find_leads", "draft_email", "pipeline", "ask", "chat"]),
      query: str(),
      company: str(),
    }),
    mock: () => ({
      agent: /arjun|email|outreach/i.test(text)
        ? "tech"
        : /elena|pipeline|status|update/i.test(text)
          ? "procurement"
          : "cfo",
      action: /email|outreach/i.test(text)
        ? "draft_email"
        : /pipeline|status|update/i.test(text)
          ? "pipeline"
          : /\?|what do we know|who is|who's|tell me about/i.test(text)
            ? "ask"
            : "find_leads",
      query: `${text} companies`,
      company: t.leads[0]?.company ?? "",
    }),
  });

  const me = TEAM.find((m) => m.id === plan.agent) ?? TEAM[0];
  let line = "";
  let found: Lead[] | undefined;
  let email: Lead | undefined;
  let recall: import("../gtm/engine").Recall | undefined;

  if (plan.action === "find_leads") {
    // 2. Telem search for prospects, LLM picks real companies, Glasser enriches them.
    // Maya keeps hunting: if a search yields no buyers she tries the next angle herself instead of asking.
    const tried: string[] = [];
    const queue = [plan.query, ...(t.queries ?? [])].filter(
      (q): q is string => !!q?.trim(),
    );
    let data: {
      leads: {
        company: string;
        domain: string;
        why: string;
        sourceUrl: string;
        sellsSameKindOfProduct?: boolean;
      }[];
      say: string;
    } = { leads: [], say: "" };
    let fresh: typeof data.leads = [];
    for (let attempt = 0; attempt < 4 && !fresh.length; attempt++) {
      let q = queue.find((x) => !tried.includes(x));
      if (!q) {
        const { data: nq } = await llmJSON<{ query: string }>({
          label: "team-new-query",
          maxTokens: 200,
          system:
            "You are a sharp B2B lead researcher. Write ONE new web search query that surfaces specific named companies likely to BUY the offering, through a buying signal (recent funding, hiring for the role with the problem, product launch, expansion). Do not use the offering's own category words (that returns competitors). Make it different from the queries already tried.",
          user: `We sell: ${t.offering}\nIdeal customer: ${t.icp ?? "unknown"}\nSeller asked: "${text}"\nAlready tried: ${tried.join(" | ") || "none"}`,
          schema: obj({ query: str() }),
          mock: () => ({
            query: `startups raised Series A ${new Date().getFullYear()} hiring engineers`,
          }),
        });
        q = nq.query;
      }
      tried.push(q);
      const { sources } = await searchWeb(q);
      ({ data } = await llmJSON<{
        leads: {
          company: string;
          domain: string;
          why: string;
          sourceUrl: string;
          sellsSameKindOfProduct?: boolean;
        }[];
        say: string;
      }>({
        label: "team-leads",
        maxTokens: 1500,
        system: `You are ${me.name}, lead researcher on a sales team. From the search results, pick up to 5 REAL companies that would BUY what we sell (they have the problem we solve). NEVER pick our own company, and NEVER pick competitors or vendors that sell the same kind of product as us; skip media sites, directories, review sites and agencies. domain = the company's own website domain. why = one specific reason from the results. sourceUrl = the result URL it came from. Skip companies already in the lead list. The seller has rejected some companies as competitors or not buyers: never pick those, and never pick companies of the same kind as them. say = 1-2 natural spoken sentences to the seller (first name ${player}) about the buyers you found (do not mention competitors).${targetingRules(t)}${ACT}`,
        user: `Our company: ${t.company ?? "?"} (${t.url ?? ""})\nWe sell: ${t.offering || "(unknown)"}\nIdeal customer: ${t.icp ?? "unknown"}\nAlready have: ${leadNames}\nRejected by the seller (competitors / not buyers): ${(t.excluded ?? []).join(", ") || "none"}\nSearch results (Telem):\n${sources.map((x, i) => `[${i + 1}] ${x.title} ${x.url}\n${x.snippet.slice(0, 400)}`).join("\n\n") || "(none)"}`,
        schema: obj({
          leads: arr(
            obj({
              company: str(),
              domain: str(),
              why: str(),
              sourceUrl: str(),
              sellsSameKindOfProduct: {
                type: "boolean",
                description:
                  "true if this company is a vendor/agency/tool in our own category (a competitor), not a buyer",
              },
            }),
          ),
          say: str(),
        }),
        mock: () => ({
          leads: [],
          say: `${player}, I couldn't reach live search right now.`,
        }),
      }));
      const ours = (t.url ? domainOf(t.url) : "").split(".")[0];
      const rejected = new Set((t.excluded ?? []).map((x) => x.toLowerCase()));
      fresh = data.leads
        .filter((l) => !rejected.has(l.company.toLowerCase()))
        .filter((l) => passesKeywords(`${l.company} ${l.domain} ${l.why}`, t).ok)
        .filter((l) => !l.sellsSameKindOfProduct)
        .filter(
          (l) =>
            l.company &&
            !t.leads.some(
              (x) => x.company.toLowerCase() === l.company.toLowerCase(),
            ),
        )
        .filter(
          (l) =>
            !ours ||
            (!domainOf(l.domain || "").startsWith(ours) &&
              !l.company.toLowerCase().replace(/\s/g, "").includes(ours)),
        )
        .slice(0, 5);
      // Second check: drop anyone who sells what we sell (competitors are not leads).
      if (fresh.length) {
        const { data: judge } = await llmJSON<{ competitors: string[] }>({
          label: "team-competitors",
          maxTokens: 300,
          system:
            "List which of these companies are competitors of the seller: they sell a product or service in the same category (for a QA/testing tool, any QA, testing or test-automation company or agency is a competitor). Return their names exactly as given; return [] if none.",
          user: `Seller sells: ${t.offering}\nCompanies:\n${fresh.map((l) => `${l.company}: ${l.why}`).join("\n")}`,
          schema: obj({ competitors: arr(str()) }),
          mock: () => ({ competitors: [] }),
        });
        const bad = new Set(judge.competitors.map((c) => c.toLowerCase()));
        fresh = fresh.filter((l) => !bad.has(l.company.toLowerCase()));
      }
    }
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
    line = enriched.length
      ? data.say
      : `${player}, I ran ${tried.length} different searches and none turned up real buyers we don't already have. I'm switching angles to hiring and funding signals next.`;
  } else if (plan.action === "draft_email") {
    const lead =
      t.leads.find(
        (l) =>
          plan.company &&
          l.company.toLowerCase().includes(plan.company.toLowerCase()),
      ) ?? t.leads[0];
    if (!lead)
      line = `${player}, we don't have any leads yet. Ask Maya to find some first.`;
    else {
      // Outreach goes through the approval queue (human in the loop): Arjun drafts, you approve before anything is sent.
      await saveTeam(t);
      const { draftSequence } = await import("../gtm/engine");
      const after = await draftSequence(lead.id, { enrich: !auto });
      const done = after.leads.find((l) => l.id === lead.id);
      Object.assign(t, { activity: after.activity });
      if (done) Object.assign(lead, { email: done.email, sequence: done.sequence, contacts: done.contacts, signals: done.signals, score: done.score, tier: done.tier, enriched: done.enriched, fit: done.fit, intent: done.intent, stage: done.stage, history: done.history });
      email = lead;
      line = `${player}, I drafted a three-step sequence for ${lead.company}${done?.contacts?.[0] ? ` to ${done.contacts[0].name}` : ""}. It's in your approval queue; nothing goes out until you approve it.`;
    }
  } else if (plan.action === "ask" || plan.action === "pipeline") {
    // Voice answers come from GTM memory: Moss search (a few ms, in-process) + Moss inference.
    await saveTeam(t);
    const { recallAnswer } = await import("../gtm/engine");
    const r = await recallAnswer(text, me, player);
    line = r.line;
    recall = r.recall;
    const after = await loadTeam();
    t.activity = after.activity;
  } else {
    const meetings = t.leads.filter((l) => l.meeting);
    const { data } = await llmJSON<{ say: string }>({
      label: "team-chat",
      maxTokens: 400,
      system: `You are ${me.name}, ${me.role} on ${player}'s sales team (${me.does}). Answer in 1-3 natural spoken sentences, using only the facts given. If useful, suggest which teammate to ask next (Maya finds leads, Arjun writes emails, Elena tracks the pipeline and books meetings).${ACT}`,
      user: `We sell: ${t.offering || "(not said yet)"}\nLeads: ${t.leads.map((l) => `${l.company} (${l.status})`).join(", ") || "none"}\nMeetings booked: ${meetings.map((l) => `${l.company} ${l.meeting!.when}`).join("; ") || "none"}\nSeller says: "${text}"`,
      schema: obj({ say: str() }),
      mock: () => ({
        say: `${player}, we have ${t.leads.length} leads and ${meetings.length} meetings booked.`,
      }),
    });
    line = data.say;
  }

  t.chat.push({ who: me.id, text: line, at: new Date().toISOString() });
  await saveTeam(t);
  if (found?.length) {
    const leads = found;
    void import("../gtm/engine").then((m) => m.onLeadsFound(leads)).catch((e) => console.error("[gtm] onLeadsFound", e));
  }
  return { speaker: me.id, line, found, email, recall, state: t };
}

/** You enter your company URL: Maya researches you with Telem, works out what you sell and who buys it, then goes hunting. */
export async function teamSetup(
  url: string,
  player: string,
  hunt = true,
): Promise<TeamReply> {
  url = await resolveCompanyUrl(url);
  const research = await researchSeller(url, "");
  const domain = domainOf(url);
  const { data } = await llmJSON<{
    company: string;
    offering: string;
    icp: string;
    queries: string[];
    say: string;
    customers: string[];
    pricing: string;
  }>({
    label: "team-setup",
    maxTokens: 900,
    system: `You are Maya, lead researcher joining ${player}'s sales team. From the research about their own company, work out: company name; offering (what they sell, one line); icp (who buys it: industry, size, stage, buyer role, one line); queries (3 web search queries that surface specific BUYER companies matching the ICP. Do NOT put our product category words in the query (e.g. for a QA tool do not say "QA" or "testing"; search "SaaS startup raises Series B 2026" instead), otherwise the results are all competitors: search for buying signals such as funding rounds, hiring for the role that has the problem, or launches, e.g. "SaaS startup raises Series B 2026 hiring QA engineers"); say (2 natural spoken sentences to ${player}: what you understood they sell and who you'll go after); customers (customer or logo company names the research explicitly shows, max 8, [] if none); pricing (pricing model or tiers if shown, else "").${ACT}`,
    user: `Company website: ${url}\nResearch (Telem):\n${research.sources.map((x, i) => `[${i + 1}] ${x.title} ${x.url}\n${x.snippet.slice(0, 500)}`).join("\n\n") || "(none)"}`,
    schema: obj({
      company: str(),
      offering: str(),
      icp: str(),
      queries: arr(str()),
      say: str(),
      customers: arr(str()),
      pricing: str(),
    }),
    mock: () => ({
      customers: [],
      pricing: "",
      company: domain,
      offering: `${domain}'s product`,
      icp: "B2B software companies",
      queries: [`${domain} competitors customers`],
      say: `${player}, I looked at ${domain}. I'll start finding companies that look like your customers.`,
    }),
  });
  const t: TeamState = {
    offering: data.offering,
    company: data.company,
    url,
    icp: data.icp,
    queries: data.queries,
    leads: [],
    chat: [],
    rep: player && player !== "there" ? player : undefined,
  };
  const prev = await loadTeam();
  if (prev.url) {
    t.leads = prev.leads; // same company again: keep its leads and what you rejected
    t.excluded = prev.excluded;
  }
  t.chat.push({ who: "cfo", text: data.say, at: new Date().toISOString() });
  // The URL is the whole intake: what they sell, who their customers are, pricing. The GTM engine starts from it.
  t.intake ??= prev.intake ?? { product: data.offering, customers: data.customers.join(", "), pricing: data.pricing, constraints: "" };
  t.icpSpec ??= prev.icpSpec;
  t.competitors ??= prev.competitors;
  t.activity = prev.activity;
  await saveTeam(t, { replace: true });
  await pruneCompetitors();
  if (!t.icpSpec) {
    const intake = t.intake;
    void import("../gtm/engine")
      .then(async (m) => {
        await m.buildIcp(intake);
        await m.mapCompetitors();
        const { generatePersonas } = await import("../gtm/personas");
        await generatePersonas();
      })
      .catch((e) => console.error("[gtm] auto ICP", e));
  }
  // quick setup: return as soon as Maya knows the company; the page starts the hunt right away.
  if (!hunt) return { speaker: "cfo", line: data.say, state: await loadTeam() };
  const found = await teamTurn(
    `Maya, find leads that match our ideal customer: ${data.icp}`,
    player,
  );
  return { ...found, line: `${data.say} ${found.line}` };
}

/** Remove any stored lead that sells what we sell (competitors are never leads). */
export async function pruneCompetitors(): Promise<string[]> {
  const t = await loadTeam();
  if (!t.leads.length) return [];
  const { data } = await llmJSON<{ competitors: string[] }>({
    label: "team-prune",
    maxTokens: 400,
    system:
      "List which of these companies are competitors of the seller: they sell a product or service in the same category (for a QA/testing tool, any QA, testing, test-automation or quality-engineering company or agency is a competitor). Return their names exactly as given; return [] if none.",
    user: `Seller: ${t.company ?? ""} sells: ${t.offering}\nCompanies:\n${t.leads.map((l) => `${l.company}: ${l.why}`).join("\n")}`,
    schema: obj({ competitors: arr(str()) }),
    mock: () => ({ competitors: [] }),
  });
  const bad = new Set(data.competitors.map((c) => c.toLowerCase()));
  const ours = (t.url ? domainOf(t.url) : "").split(".")[0];
  const removed = t.leads
    .filter(
      (l) =>
        bad.has(l.company.toLowerCase()) || (ours && l.domain.startsWith(ours)),
    )
    .map((l) => l.company);
  t.leads = t.leads.filter((l) => !removed.includes(l.company));
  await saveTeam(t, { replace: true });
  return removed;
}

/** The seller says a lead is not a buyer (a competitor, or wrong fit): drop it and never suggest it again. */
export async function removeLead(leadId: string): Promise<TeamState> {
  const t = await loadTeam();
  const lead = t.leads.find((l) => l.id === leadId);
  if (!lead) return t;
  t.leads = t.leads.filter((l) => l.id !== leadId);
  t.excluded = [...new Set([...(t.excluded ?? []), lead.company])].slice(-100);
  await saveTeam(t, { replace: true });
  return t;
}

/** Accept whatever you type: a full URL, a bare domain, or just a company name ("lingcode"); a name is looked up with Telem. */
export async function resolveCompanyUrl(input: string): Promise<string> {
  const raw = input.trim();
  if (/\.[a-z]{2,}/i.test(raw)) return raw;
  const { sources } = await searchWeb(`${raw} company official website`).catch(() => ({ sources: [] as { url: string; title: string }[] }));
  const skip = /(linkedin|crunchbase|twitter|x\.com|facebook|youtube|wikipedia|github|medium|reddit|g2|capterra|producthunt)\./i;
  const name = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  const hit = sources.map((x) => domainOf(x.url)).find((d) => !skip.test(d) && d.replace(/[^a-z0-9]/g, "").includes(name)) ?? sources.map((x) => domainOf(x.url)).find((d) => !skip.test(d));
  return hit ?? `${raw}.com`;
}
