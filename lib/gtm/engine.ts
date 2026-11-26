import { randomUUID } from "node:crypto";
import { promises as dns } from "node:dns";
import { arr, enm, int, llmJSON, obj, str } from "../llm";
import { loadTeam, saveTeam, type Lead, type TeamState } from "../agents/team";
import { searchWeb } from "../sponsors/telem";
import { enrichCompany, findEmail } from "../sponsors/glasser";
import { matchPersona, targetTitles } from "./personas";
import { campaignOf, clearsPrecision, passesKeywords, targetingOf } from "./targeting";
import { canSpend, meter, PRICES } from "../sponsors/flexprice";
import { indexDocs, mossAnswer, search } from "../sponsors/moss";
import type { Activity, Actor, Competitor, Contact, IcpSpec, Intake, Signal, Stage, Touch } from "./types";

const num = (d?: string): Record<string, unknown> => ({ type: "number", ...(d ? { description: d } : {}) });
const conf = num("confidence 0.00-1.00 that this field is right, given the evidence");

function domainKey(t: TeamState) {
  try {
    return new URL(/^https?:/.test(t.url ?? "") ? t.url! : `https://${t.url}`).hostname.replace(/^www\./, "");
  } catch {
    return t.company ?? "none";
  }
}

export function log(t: TeamState, a: Omit<Activity, "id" | "at">) {
  t.activity = [{ id: randomUUID().slice(0, 10), at: new Date().toISOString(), ...a }, ...(t.activity ?? [])].slice(0, 300);
}

export function stageOf(l: Lead): Stage {
  if (l.stage) return l.stage;
  return l.status === "meeting" ? "meeting" : "matched";
}

function setStage(t: TeamState, l: Lead, stage: Stage, actor: Actor, who: string, note?: string) {
  if (stageOf(l) === stage && l.history?.length) return;
  l.stage = stage;
  l.status = stage === "meeting" || stage === "won" ? "meeting" : stage === "matched" ? "new" : "contacted";
  l.history = [...(l.history ?? []), { at: new Date().toISOString(), stage, actor, who, note }];
  log(t, { actor, who, kind: "stage", text: `${l.company} → ${stage}${note ? ` (${note})` : ""}`, leadId: l.id });
}

/* ---------------- Module 1: intake + ICP ---------------- */

export async function buildIcp(intake: Intake): Promise<TeamState> {
  const t = await loadTeam();
  t.intake = intake;
  log(t, { actor: "agent", who: "Maya", kind: "think", text: "Reading the product intake and inferring the ideal customer profile" });
  const { data } = await llmJSON<Omit<IcpSpec, "generatedAt" | "expansions"> & { expansions: { segment: string; reasoning: string; evidence: string }[] }>({
    label: "gtm-icp",
    maxTokens: 2500,
    system:
      "You are a B2B go-to-market strategist. From the product intake, infer a precise Ideal Customer Profile. Use real NAICS codes (2-6 digits). Each field carries a confidence 0.00-1.00: high only when the intake states or clearly implies it, low when you are extrapolating. personas: 3-5 buyer titles with seniority (C-level, VP, Director, Manager, IC) and function. triggers: 4-6 observable buying events (funding, exec hires, tech-stack changes, hiring for a role, expansion, compliance deadline). negativeSignals: 3-5 explicit disqualifiers (hiring freeze, non-target regions, too small, competitor customer locked in). expansions: 2-3 adjacent or non-obvious segments that are NOT in the core ICP, each with reasoning and the evidence from the intake that supports it. summary: one line who-buys-it.",
    user: `Company: ${t.company ?? "?"} (${t.url ?? ""})\nWhat they sell (from site): ${t.offering || "?"}\n\nIntake:\nProduct, features, constraints: ${intake.product}\nExisting customers / reference wins: ${intake.customers || "(none given)"}\nPricing / contract value: ${intake.pricing || "(not given)"}\nOther constraints: ${intake.constraints || "(none)"}`,
    schema: obj({
      summary: str(),
      industries: arr(obj({ name: str(), naics: str(), confidence: conf })),
      companySize: obj({ headcount: str(), revenue: str(), confidence: conf }),
      personas: arr(obj({ title: str(), seniority: str(), function: str(), confidence: conf })),
      triggers: arr(obj({ event: str(), confidence: conf })),
      regions: arr(obj({ name: str(), confidence: conf })),
      negativeSignals: arr(str()),
      expansions: arr(obj({ segment: str(), reasoning: str(), evidence: str() })),
    }),
    mock: () => ({
      summary: "Series A-C B2B SaaS companies scaling their engineering teams",
      industries: [{ name: "Software Publishers", naics: "513210", confidence: 0.7 }],
      companySize: { headcount: "50-500", revenue: "$5M-$100M", confidence: 0.6 },
      personas: [{ title: "VP Engineering", seniority: "VP", function: "Engineering", confidence: 0.7 }],
      triggers: [{ event: "Raised a Series A/B in the last 6 months", confidence: 0.7 }],
      regions: [{ name: "North America", confidence: 0.6 }],
      negativeSignals: ["Announced layoffs or a hiring freeze"],
      expansions: [{ segment: "Fintech compliance teams", reasoning: "Same workflow pain", evidence: "Intake mentions audit trails" }],
    }),
  });
  const prev = t.icpSpec?.expansions ?? [];
  t.icpSpec = {
    ...data,
    expansions: data.expansions.map((e) => ({ id: randomUUID().slice(0, 6), ...e, status: prev.find((p) => p.segment === e.segment)?.status ?? "suggested" })),
    generatedAt: new Date().toISOString(),
  };
  applyIcp(t);
  log(t, { actor: "agent", who: "Maya", kind: "icp", text: `ICP ready: ${data.summary}` });
  await saveTeam(t);
  await indexDocs(domainKey(t), [{ id: "icp", text: `Ideal customer: ${data.summary}. Personas: ${data.personas.map((p) => p.title).join(", ")}. Triggers: ${data.triggers.map((x) => x.event).join("; ")}`, metadata: { kind: "icp" } }]);
  return t;
}

/** The ICP text the lead hunters use: core profile + accepted expansions, minus negative signals. */
function applyIcp(t: TeamState) {
  const s = t.icpSpec;
  if (!s) return;
  const acc = s.expansions.filter((e) => e.status === "accepted").map((e) => e.segment);
  t.icp = `${s.summary}. Size ${s.companySize.headcount} employees. Buyers: ${s.personas.map((p) => p.title).join(", ")}. Buying triggers: ${s.triggers.map((x) => x.event).join("; ")}.${acc.length ? ` Also target: ${acc.join("; ")}.` : ""} Exclude: ${s.negativeSignals.join("; ")}.`;
  t.queries = undefined; // regenerate hunting angles from the new ICP
}

export async function decideExpansion(id: string, status: "accepted" | "dismissed" | "suggested"): Promise<TeamState> {
  const t = await loadTeam();
  const e = t.icpSpec?.expansions.find((x) => x.id === id);
  if (e) {
    e.status = status;
    applyIcp(t);
    log(t, { actor: "rep", who: "You", kind: "icp", text: `${status === "accepted" ? "Accepted" : status === "dismissed" ? "Dismissed" : "Reset"} expansion segment: ${e.segment}` });
    await saveTeam(t);
  }
  return t;
}

/* ---------------- Module 2: competitors ---------------- */

export async function mapCompetitors(): Promise<TeamState> {
  const t = await loadTeam();
  log(t, { actor: "agent", who: "Maya", kind: "search", text: `Searching the web for ${t.company ?? "our"} competitors and alternatives` });
  const [a, b] = await Promise.all([
    searchWeb(`${t.company ?? ""} competitors alternatives`).catch(() => ({ sources: [] })),
    searchWeb(`${t.offering} software pricing plans`).catch(() => ({ sources: [] })),
  ]);
  const sources = [...a.sources, ...b.sources].slice(0, 12);
  const { data } = await llmJSON<{ competitors: Competitor[] }>({
    label: "gtm-competitors",
    maxTokens: 2500,
    system:
      "Map the competitive landscape for the seller. Return 4-7 REAL companies from the search results only: direct (same product), indirect (different product, same job), alternative (in-house build, spreadsheets, an agency). positioning = their one-line pitch. pricing = public pricing tiers if the results show them, else 'not public'. theirEdge / ourEdge = one honest structural advantage each. sourceUrl = the result URL the facts came from (mandatory). Never invent a company that is not in the results, except category 'alternative' entries like 'in-house build' (sourceUrl may then be '').",
    user: `Seller: ${t.company} (${t.url}) sells: ${t.offering}\nSearch results:\n${sources.map((x, i) => `[${i + 1}] ${x.title} ${x.url}\n${x.snippet.slice(0, 500)}`).join("\n\n") || "(none)"}`,
    schema: obj({
      competitors: arr(
        obj({ name: str(), domain: str(), category: enm(["direct", "indirect", "alternative"]), positioning: str(), pricing: str(), theirEdge: str(), ourEdge: str(), sourceUrl: str() }),
      ),
    }),
    mock: () => ({ competitors: [] }),
  });
  t.competitors = data.competitors;
  t.excluded = [...new Set([...(t.excluded ?? []), ...data.competitors.filter((c) => c.category === "direct").map((c) => c.name)])];
  log(t, { actor: "agent", who: "Maya", kind: "discover", text: `Mapped ${data.competitors.length} competitors; direct ones are now excluded from lead lists` });
  await saveTeam(t);
  await indexDocs(
    domainKey(t),
    data.competitors.map((c) => ({ id: `comp-${c.name.toLowerCase().replace(/\W+/g, "-")}`, text: `Competitor ${c.name} (${c.category}): ${c.positioning}. Pricing: ${c.pricing}`, metadata: { kind: "competitor", url: c.sourceUrl } })),
  );
  return t;
}

/* ---------------- Module 4: enrichment ---------------- */

async function mxValid(domain: string) {
  try {
    const mx = await dns.resolveMx(domain);
    return mx.length > 0;
  } catch {
    return false;
  }
}

function guessEmail(name: string, domain: string) {
  const parts = name.toLowerCase().normalize("NFKD").replace(/[^a-z\s-]/g, "").trim().split(/\s+/);
  if (parts.length < 2) return undefined;
  return `${parts[0]}.${parts[parts.length - 1]}@${domain}`;
}

/** Enrich one lead: credit-gated by Flexprice, people from Glasser, MX-validated emails, signals + fit/intent score. */
export async function enrichLead(leadId: string, actor: Actor = "agent"): Promise<TeamState> {
  const t = await loadTeam();
  const l = t.leads.find((x) => x.id === leadId);
  if (!l) return t;
  if (!(await canSpend("lead_enriched"))) {
    if (l.enriched !== "done") l.enriched = "blocked";
    log(t, { actor: "agent", who: "Flexprice", kind: "billing", text: `Enrichment of ${l.company} blocked: credit balance below $${PRICES.lead_enriched.toFixed(2)}`, leadId });
    await saveTeam(t);
    return t;
  }
  log(t, { actor, who: actor === "agent" ? "Maya" : "You", kind: "enrich", text: `Enriching ${l.company}: company record, decision-makers, email deliverability`, leadId });
  const titles = targetTitles(t);
  const [e, mx, research] = await Promise.all([
    enrichCompany(l.domain, titles).catch(() => null),
    mxValid(l.domain),
    searchWeb(`${l.company} ${new Date().getFullYear()} funding OR hiring OR launch OR appoints`).catch(() => ({ sources: [] })),
  ]);
  const people = e?.provider === "glasser" ? (e.data.people ?? []).filter((p) => p.name) : [];
  // Glasser masks surnames: resolve the top decision-makers' full names, LinkedIn and past employers from public results.
  const resolved = await Promise.all(people.slice(0, 3).map((p) => resolvePerson(p.name!, p.title ?? "", l.company).catch(() => null)));
  const contacts: Contact[] = people.slice(0, 5).map((p, i) => {
    const r = resolved[i];
    const name = r?.fullName || p.name!;
    const email = p.email || guessEmail(name, l.domain);
    return {
      id: `${l.id}-p${i}`,
      name,
      title: p.title ?? "",
      email,
      emailStatus: p.email ? (mx ? "mx-valid" : "no-mx") : email ? (mx ? "guessed" : "no-mx") : "unknown",
      linkedin: p.linkedin || r?.linkedin || undefined,
      previousCompanies: p.previous?.length ? p.previous : r?.previousCompanies?.length ? r.previousCompanies : undefined,
      source: "glasser",
      confidence: p.email ? 0.9 : r?.fullName ? (mx ? 0.7 : 0.4) : 0.3,
    };
  });
  log(t, { actor: "agent", who: "Maya", kind: "search", text: `${l.company}: Glasser returned ${people.length} decision-makers; resolved ${resolved.filter((r) => r?.fullName).length} full names from public profiles`, leadId });
  // Persona match first, then a verified email for the best 2 matches (find + verify through the provider waterfall).
  const personas = t.personas ?? [];
  for (const c of contacts) c.persona = matchPersona(c.title, personas, l.size ?? e?.data.employees, `${l.company} ${l.why} ${e?.data.industry ?? ""} ${e?.data.description ?? ""}`)?.label;
  contacts.sort((a, b) => Number(!!b.persona) - Number(!!a.persona));
  for (const c of contacts.filter((x) => x.name.includes(" ")).slice(0, 2)) {
    const found = await findEmail(c.name, l.domain);
    if (found) {
      c.email = found.email;
      c.emailStatus = found.status === "unknown" ? c.emailStatus : found.status;
      c.confidence = found.status === "verified" ? 0.95 : found.status === "risky" ? 0.6 : 0.2;
    }
  }

  const { data } = await llmJSON<{
    industry: string;
    hq: string;
    signals: Signal[];
    fit: number;
    intent: number;
    why: string;
    inferredContacts: { name: string; title: string; sourceUrl: string }[];
  }>({
    label: "gtm-score",
    maxTokens: 1500,
    system:
      "Score a B2B prospect against the ICP. fit 0-100 = how well the firmographics match (industry, size, region, buyer exists). intent 0-100 = strength and recency of buying signals. signals = 1-4 concrete buying signals from the evidence only, each with the sourceUrl it came from (never invent). inferredContacts = named decision-makers that the search results explicitly mention at this company (name, title, sourceUrl); [] if none. why = one line explaining the score.",
    user: `ICP: ${t.icp ?? t.icpSpec?.summary ?? "unknown"}\nNegative signals: ${(t.icpSpec?.negativeSignals ?? []).join("; ")}\nProspect: ${l.company} (${l.domain}). Found because: ${l.why} (${l.sourceUrl})\nCompany data (Glasser): ${JSON.stringify({ employees: e?.data.employees, funding: e?.data.funding, industry: e?.data.industry, city: e?.data.city, revenue: e?.data.revenue, latestFunding: e?.data.latestFunding, techStack: e?.data.techStack?.slice(0, 8) })}\nRecent news:\n${research.sources.slice(0, 5).map((x) => `- ${x.title} ${x.url}: ${x.snippet.slice(0, 300)}`).join("\n") || "(none)"}`,
    schema: obj({
      industry: str(),
      hq: str(),
      signals: arr(obj({ kind: enm(["funding", "hiring", "launch", "exec_hire", "tech_change", "expansion", "other"]), text: str(), sourceUrl: str() })),
      fit: int(),
      intent: int(),
      why: str(),
      inferredContacts: arr(obj({ name: str(), title: str(), sourceUrl: str() })),
    }),
    mock: () => ({ industry: e?.data.industry ?? "", hq: e?.data.city ?? "", signals: [{ kind: "other", text: l.why, sourceUrl: l.sourceUrl }], fit: 60, intent: 50, why: "Heuristic score (no model)", inferredContacts: [] }),
  });
  if (!contacts.length) {
    for (const [i, p] of data.inferredContacts.slice(0, 3).entries()) {
      const email = guessEmail(p.name, l.domain);
      contacts.push({ id: `${l.id}-i${i}`, name: p.name, title: p.title, email, emailStatus: email ? (mx ? "guessed" : "no-mx") : "unknown", source: "inferred", confidence: mx ? 0.45 : 0.2 });
    }
  }
  l.contacts = contacts;
  l.industry = data.industry || e?.data.industry;
  l.hq = data.hq || e?.data.city;
  l.size ??= e?.data.employees;
  l.funding ??= e?.data.funding;
  l.signals = data.signals;
  l.fit = clamp(data.fit);
  l.intent = clamp(data.intent);
  l.score = Math.round(l.fit * 0.6 + l.intent * 0.4);
  l.tier = l.score >= 75 ? "A" : l.score >= 55 ? "B" : "C";
  l.scoreWhy = data.why;
  l.enriched = "done";
  l.enrichedAt = new Date().toISOString();
  const kw = passesKeywords(`${l.company} ${l.why} ${e?.data.description ?? ""} ${l.industry ?? ""}`, t);
  const cap = targetingOf(t).maxEmployees ?? 0;
  const headcountNow = Number(String(l.size ?? "").replace(/[^0-9-]/g, "").split("-").pop() || 0);
  const tooBig = cap > 0 && headcountNow > cap;
  if ((!kw.ok && targetingOf(t).precision !== "off") || tooBig) {
    l.stage = "lost";
    l.history = [...(l.history ?? []), { at: new Date().toISOString(), stage: "lost", actor: "agent", who: "Maya", note: tooBig ? `over ${cap} employees` : kw.why }];
  }
  l.stage ??= "matched";
  l.history ??= [{ at: l.at, stage: "matched", actor: "agent", who: l.foundBy }];
  await meter("lead_enriched", { lead: l.domain }, l.company);
  log(t, { actor: "agent", who: "Maya", kind: "enrich", text: `${l.company}: score ${l.score} (Tier ${l.tier}), ${contacts.length} contacts, MX ${mx ? "valid" : "missing"}. Charged $${PRICES.lead_enriched.toFixed(2)}`, leadId });
  await saveTeam(t);
  await indexDocs(domainKey(t), [
    { id: `lead-${l.id}`, text: `${l.company} (${l.domain}) ${l.industry ?? ""} ${l.hq ?? ""}. ${l.why}. Score ${l.score} tier ${l.tier}.`, metadata: { kind: "lead", leadId: l.id, url: l.sourceUrl } },
    ...data.signals.map((s, i) => ({ id: `sig-${l.id}-${i}`, text: `${l.company} signal (${s.kind}): ${s.text}`, metadata: { kind: "signal", leadId: l.id, url: s.sourceUrl } })),
    ...contacts.map((c) => ({ id: `person-${c.id}`, text: `${c.name}, ${c.title} at ${l.company}${c.previousCompanies?.length ? `; previously at ${c.previousCompanies.join(", ")}` : ""}`, metadata: { kind: "person", leadId: l.id } })),
  ]);
  return t;
}

/** One web search per person: full name, LinkedIn URL and previous employers, only if a result clearly matches. */
async function resolvePerson(first: string, title: string, company: string) {
  const { sources } = await searchWeb(`${first} ${title} ${company} linkedin`);
  if (!sources.length) return null;
  const { data } = await llmJSON<{ fullName: string; linkedin: string; previousCompanies: string[] }>({
    label: "gtm-person",
    maxTokens: 300,
    system: `Find the person whose first name is "${first}" and who is (or recently was) "${title}" at ${company}. Only use a result that clearly names this person at this company. fullName = their full name, or "" if no result matches. linkedin = their linkedin.com/in/ URL from the results, or "". previousCompanies = earlier employers named in the results (max 4), or [].`,
    user: sources.slice(0, 6).map((x, i) => `[${i + 1}] ${x.title} ${x.url}\n${x.snippet.slice(0, 300)}`).join("\n\n"),
    schema: obj({ fullName: str(), linkedin: str(), previousCompanies: arr(str()) }),
    mock: () => ({ fullName: "", linkedin: "", previousCompanies: [] }),
  });
  if (!data.fullName || !data.fullName.toLowerCase().startsWith(first.toLowerCase())) return null;
  const names = data.fullName.toLowerCase().normalize("NFKD").replace(/[^a-z\s]/g, "").split(/\s+/).filter((x) => x.length > 1);
  const slug = (data.linkedin.toLowerCase().match(/linkedin\.com\/in\/([^/?#]+)/) ?? [])[1] ?? "";
  const okLinkedin = slug && names.some((n) => slug.includes(n));
  return { fullName: data.fullName, linkedin: okLinkedin ? data.linkedin : "", previousCompanies: data.previousCompanies.filter((c) => c && c.toLowerCase() !== company.toLowerCase()) };
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

/** New leads from the team room: index them in Moss and enrich the first few (credits permitting). */
export async function onLeadsFound(leads: Lead[]) {
  if (!leads.length) return;
  const t = await loadTeam();
  await indexDocs(
    domainKey(t),
    leads.map((l) => ({ id: `lead-${l.id}`, text: `${l.company} (${l.domain}). ${l.why}`, metadata: { kind: "lead", leadId: l.id, url: l.sourceUrl } })),
  );
  for (const l of leads.slice(0, 3)) await enrichLead(l.id).catch((e) => console.error("[gtm] enrich", e));
  // Write the email right away for anyone we found a usable address for (it then waits in Review, or autopilot approves it).
  const after = await loadTeam();
  for (const l of after.leads.filter((x) => leads.some((y) => y.id === x.id) && !x.sequence?.length)) {
    const ok = (l.contacts ?? []).some((c) => c.email && ["verified", "risky", "mx-valid", "guessed"].includes(c.emailStatus)) && l.stage !== "lost" && clearsPrecision(l.score, after);
    if (ok) await draftSequence(l.id, { enrich: false }).catch((e) => console.error("[gtm] draft", e));
  }
}

/* ---------------- Module 4: outreach + HITL ---------------- */

export async function draftSequence(leadId: string, opts: { enrich?: boolean } = {}): Promise<TeamState> {
  let t = await loadTeam();
  let l = t.leads.find((x) => x.id === leadId);
  if (!l) return t;
  // Background drafts write from what we already have; only a rep's request pays for a fresh enrichment.
  if (!l.enriched && opts.enrich !== false) {
    t = await enrichLead(leadId);
    l = t.leads.find((x) => x.id === leadId)!;
  }
  // Pick the person whose title is highest in their persona's title list (a persona lists its best titles first).
  const rankOf = (c: Contact) => {
    const p = (t.personas ?? []).find((x) => x.label === c.persona);
    if (!p) return 99;
    const tl = c.title.toLowerCase();
    const i = p.titles.findIndex((x) => tl.includes(x.toLowerCase()) || x.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2).every((w) => tl.includes(w)));
    return i === -1 ? 50 : i;
  };
  const usable = (l.contacts ?? []).filter((c) => c.email && c.emailStatus !== "no-mx" && c.emailStatus !== "invalid");
  const who = [...usable].sort((a, b) => rankOf(a) - rankOf(b) || Number(b.emailStatus === "verified") - Number(a.emailStatus === "verified"))[0] ?? l.contacts?.[0];
  const persona = t.icpSpec?.personas.find((p) => who?.title && who.title.toLowerCase().includes(p.function.toLowerCase())) ?? t.icpSpec?.personas[0];
  // The confirmed persona this person matches: its pains, angle and ask shape the email.
  const buyer = (t.personas ?? []).find((p) => p.enabled && p.label === who?.persona) ?? (t.personas ?? []).find((p) => p.enabled);
  // Ground the copy: Moss pulls the most relevant signals/sources we hold on this company.
  const mem = await search(domainKey(t), `${l.company} buying signal ${l.why}`, { topK: 4 });
  log(t, { actor: "agent", who: "Arjun", kind: "search", text: `Moss recalled ${mem.hits.length} facts about ${l.company} in ${mem.ms} ms`, leadId, ms: mem.ms });
  await meter("search_query", { lead: l.domain }, `recall ${l.company}`);
  const facts = [...(l.signals ?? []).map((s) => `${s.text} (${s.sourceUrl})`), ...mem.hits.filter((h) => h.metadata?.leadId === l!.id).map((h) => h.text)];
  const variant: "A" | "B" = t.leads.filter((x) => x.sequence?.length).length % 2 ? "B" : "A";
  const cmp = campaignOf(t);
  const { data } = await llmJSON<{ email1: { subject: string; body: string }; linkedin: { body: string }; email2: { subject: string; body: string } }>({
    label: "gtm-sequence",
    maxTokens: 1500,
    system: `You are Arjun, outbound writer. Write a 3-touch sequence from a rep at ${t.company ?? "our company"} to ${who ? `${who.name} (${who.title})` : `the ${persona?.title ?? "buyer"}`} at ${l.company}. Weave in ONE specific trigger signal from the facts (name it concretely) and tie it to our value. Persona tone: ${persona?.seniority === "C-level" ? "brief, outcome and money first, max 70 words" : "practical, specific, max 100 words"}. ${buyer ? `This person is a "${buyer.label}". Their pains: ${buyer.pains.join("; ")}. The theme to lead with (say it in your own natural words, never copy this sentence): ${buyer.angle} ` : ""}CTA: ${cmp.cta.trim() || buyer?.cta || (cmp.goal === "demo" ? "booking a short demo" : cmp.goal === "reply" ? "a one-line reply" : variant === "A" ? "a 15-minute call this week" : "permission to send a 2-minute teardown video")}. Tone: ${cmp.tone}. Write in ${cmp.language}. email1 = first touch. linkedin = connection note under 280 characters. email2 = follow-up ${cmp.followUpDays} days later, new angle, under 70 words.${t.knowledge ? ` What we know about our own product (use it, don't invent other claims): value: ${t.knowledge.valueProp}; pains we solve: ${t.knowledge.pains}; features: ${t.knowledge.features}; proof: ${t.knowledge.proof}.` : ""} Sign every email and note as ${t.rep ?? "the team"} from ${t.company ?? "our company"} (the rep sends it, not you). Never use placeholders like [Name]; use the real names given or a role. No hype words.`,
    user: `We sell: ${t.offering}\nICP: ${t.icp ?? ""}\nProspect: ${l.company} (${l.domain}), ${l.industry ?? ""}, ${l.size ?? "?"} employees, funding ${l.funding ?? "?"}\nFacts:\n${facts.map((f) => `- ${f}`).join("\n") || l.why}`,
    schema: obj({ email1: obj({ subject: str(), body: str() }), linkedin: obj({ body: str() }), email2: obj({ subject: str(), body: str() }) }),
    mock: () => ({
      email1: { subject: `${l!.company}: ${l!.why.slice(0, 40)}`, body: `Hi ${who?.name.split(" ")[0] ?? "there"},\n\nSaw that ${l!.why.toLowerCase()}. Teams at that stage usually hit the problem ${t.company} solves.\n\nOpen to 15 minutes this week?` },
      linkedin: { body: `Hi ${who?.name.split(" ")[0] ?? ""}, following ${l!.company}'s recent news. Would love to connect.` },
      email2: { subject: "Re: quick follow-up", body: "One more idea on this, happy to share a short teardown." },
    }),
  });
  const cites = (l.signals ?? []).map((s) => s.sourceUrl).filter(Boolean).slice(0, 3) as string[];
  const mk = (step: number, channel: Touch["channel"], dayOffset: number, body: string, subject?: string): Touch => ({
    id: randomUUID().slice(0, 8),
    step,
    channel,
    variant,
    to: channel === "email" ? who?.email : who?.linkedin ?? who?.name,
    subject,
    body,
    dayOffset,
    approval: "pending",
    draftedBy: "Arjun",
    citations: cites,
  });
  l.sequence = [mk(1, "email", 0, data.email1.body, data.email1.subject), ...(cmp.linkedinStep ? [mk(2, "linkedin", 1, data.linkedin.body)] : []), mk(3, "email", cmp.followUpDays, data.email2.body, data.email2.subject)];
  l.email = { subject: data.email1.subject, body: data.email1.body };
  log(t, { actor: "agent", who: "Arjun", kind: "draft", text: `Drafted a 3-touch sequence (variant ${variant}) for ${l.company}; waiting for your approval`, leadId });
  await saveTeam(t);
  await indexDocs(domainKey(t), [{ id: `msg-${l.id}`, text: `Outreach to ${l.company}: ${data.email1.subject}. ${data.email1.body}`, metadata: { kind: "message", leadId: l.id } }]);
  return t;
}

/** Human-in-the-loop gate: nothing is sent until a rep approves it here. */
export async function decideTouch(leadId: string, touchId: string, decision: "approve" | "reject" | "edit", edit?: { subject?: string; body?: string }): Promise<TeamState> {
  const t = await loadTeam();
  const l = t.leads.find((x) => x.id === leadId);
  const m = l?.sequence?.find((x) => x.id === touchId);
  if (!l || !m) return t;
  if (decision === "edit") {
    if (edit?.subject !== undefined) m.subject = edit.subject;
    if (edit?.body !== undefined) m.body = edit.body;
    m.edited = true;
    log(t, { actor: "rep", who: "You", kind: "approve", text: `Edited ${m.channel} step ${m.step} for ${l.company}`, leadId });
  } else if (decision === "reject") {
    m.approval = "rejected";
    m.decidedAt = new Date().toISOString();
    log(t, { actor: "rep", who: "You", kind: "reject", text: `Rejected ${m.channel} step ${m.step} for ${l.company}`, leadId });
  } else {
    m.approval = "approved";
    m.decidedAt = new Date().toISOString();
    // Approved emails are sent by the agent's sender in your sending window (lib/agent/runner.ts), from your mailbox.
    log(t, { actor: "rep", who: "You", kind: "approve", text: `Approved ${m.channel} step ${m.step} to ${m.to ?? l.company}; it goes out in your next sending window`, leadId });
  }
  await saveTeam(t);
  return t;
}

export async function moveStage(leadId: string, stage: Stage, actor: Actor = "rep"): Promise<TeamState> {
  const t = await loadTeam();
  const l = t.leads.find((x) => x.id === leadId);
  if (!l) return t;
  setStage(t, l, stage, actor, actor === "rep" ? "You" : "Elena");
  await saveTeam(t);
  return t;
}

/* ---------------- Module 3: knowledge graph ---------------- */

export type GNode = { id: string; label: string; type: "Product" | "Company" | "Person" | "Competitor" | "Signal" | "Customer"; tier?: string; stage?: string };
export type GEdge = { from: string; to: string; rel: "works_at" | "competes_with" | "matched_to" | "contacted_via" | "replied_to" | "previously_employed_at" | "has_signal" | "lookalike_of" };
export type WarmPath = { leadId: string; company: string; hops: string[]; why: string };

/** Build the graph from what the agents found, then run multi-hop queries over it (warm intros, lookalikes, displacement). */
export async function graph(): Promise<{ nodes: GNode[]; edges: GEdge[]; warm: WarmPath[]; lookalikes: { customer: string; leadId: string; company: string; score: number }[]; displacement: { company: string; competitor: string; signal: string }[]; ms: number }> {
  const t = await loadTeam();
  const t0 = performance.now();
  const nodes = new Map<string, GNode>();
  const edges: GEdge[] = [];
  const add = (n: GNode) => nodes.set(n.id, nodes.get(n.id) ?? n);
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const product = `prod:${slug(t.company ?? "us")}`;
  add({ id: product, label: t.company ?? "Our product", type: "Product" });
  const customers = (t.intake?.customers ?? "").split(/[,;\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 8);
  for (const c of customers) {
    add({ id: `co:${slug(c)}`, label: c, type: "Customer" });
    edges.push({ from: `co:${slug(c)}`, to: product, rel: "matched_to" });
  }
  for (const c of t.competitors ?? []) {
    add({ id: `cmp:${slug(c.name)}`, label: c.name, type: "Competitor" });
    edges.push({ from: `cmp:${slug(c.name)}`, to: product, rel: "competes_with" });
  }
  for (const l of t.leads) {
    const co = `co:${slug(l.company)}`;
    add({ id: co, label: l.company, type: "Company", tier: l.tier, stage: stageOf(l) });
    edges.push({ from: co, to: product, rel: "matched_to" });
    for (const [i, s] of (l.signals ?? []).entries()) {
      add({ id: `sig:${l.id}:${i}`, label: s.text.slice(0, 60), type: "Signal" });
      edges.push({ from: co, to: `sig:${l.id}:${i}`, rel: "has_signal" });
    }
    for (const p of l.contacts ?? []) {
      const pid = `per:${slug(p.name)}`;
      add({ id: pid, label: `${p.name} · ${p.title}`, type: "Person" });
      edges.push({ from: pid, to: co, rel: "works_at" });
      for (const prev of p.previousCompanies ?? []) {
        const pc = `co:${slug(prev)}`;
        add({ id: pc, label: prev, type: customers.some((c) => slug(c) === slug(prev)) ? "Customer" : "Company" });
        edges.push({ from: pid, to: pc, rel: "previously_employed_at" });
      }
      if (l.sequence?.some((m) => m.approval === "approved")) edges.push({ from: product, to: pid, rel: "contacted_via" });
      if (["replied", "meeting", "won"].includes(stageOf(l))) edges.push({ from: pid, to: product, rel: "replied_to" });
    }
  }
  // Lookalikes: Moss matches each reference customer to the leads that read most like it.
  const dk = domainKey(t);
  const lookalikes: { customer: string; leadId: string; company: string; score: number }[] = [];
  for (const c of customers.slice(0, 4)) {
    const r = await search(dk, `B2B company similar to ${c}`, { topK: 1, kind: "lead" });
    for (const h of r.hits.filter((x) => x.score > 0.2)) {
      const l = t.leads.find((x) => x.id === h.metadata?.leadId);
      if (l) {
        edges.push({ from: `co:${slug(l.company)}`, to: `co:${slug(c)}`, rel: "lookalike_of" });
        lookalikes.push({ customer: c, leadId: l.id, company: l.company, score: Math.round(h.score * 100) / 100 });
      }
    }
  }

  // Multi-hop: shortest path from our product to each lead that does NOT use the direct matched_to edge.
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (["lookalike_of", "has_signal", "contacted_via", "replied_to"].includes(e.rel)) continue; // our own outreach or similarity is not an intro path
    if (e.rel === "matched_to" && e.to === product && !nodes.get(e.from)?.type.startsWith("Customer")) continue;
    for (const [a, b] of [[e.from, e.to], [e.to, e.from]]) adj.set(a, [...(adj.get(a) ?? []), b]);
  }
  const warm: WarmPath[] = [];
  for (const l of t.leads) {
    const target = `co:${slug(l.company)}`;
    const prev = new Map<string, string>([[product, ""]]);
    const q = [product];
    while (q.length && !prev.has(target)) {
      const cur = q.shift()!;
      for (const n of adj.get(cur) ?? [])
        if (!prev.has(n) && nodes.get(n)?.type !== "Signal") {
          prev.set(n, cur);
          q.push(n);
        }
    }
    if (!prev.has(target)) continue;
    const hops: string[] = [];
    for (let c = target; c; c = prev.get(c)!) hops.unshift(nodes.get(c)?.label ?? c);
    if (hops.length < 3 || hops.length > 5) continue;
    warm.push({ leadId: l.id, company: l.company, hops, why: `intro path through ${hops.slice(1, -1).join(" → ")}` });
  }
  // Displacement: leads whose signals mention a mapped competitor (renewal, migration, churn).
  const displacement: { company: string; competitor: string; signal: string }[] = [];
  for (const l of t.leads)
    for (const s of l.signals ?? [])
      for (const c of t.competitors ?? []) if (s.text.toLowerCase().includes(c.name.toLowerCase())) displacement.push({ company: l.company, competitor: c.name, signal: s.text });

  const ms = Math.round((performance.now() - t0) * 10) / 10;
  await meter("graph_query", { nodes: String(nodes.size) }, `${nodes.size} nodes, ${warm.length} warm paths`);
  return { nodes: [...nodes.values()], edges, warm, lookalikes, displacement, ms };
}

/* ---------------- Module 5: analytics ---------------- */

export function analytics(t: TeamState) {
  const order: Stage[] = ["matched", "contacted", "replied", "meeting", "won"];
  const reached = (l: Lead, s: Stage) => {
    const hist = new Set([...(l.history ?? []).map((h) => h.stage), stageOf(l)]);
    const idx = order.indexOf(s);
    return order.some((x, i) => i >= idx && hist.has(x)) || (s === "matched" && true);
  };
  const funnel = order.map((s) => ({ stage: s, count: t.leads.filter((l) => reached(l, s)).length }));
  const conv = funnel.slice(1).map((f, i) => ({ from: funnel[i].stage, to: f.stage, rate: funnel[i].count ? Math.round((100 * f.count) / funnel[i].count) : 0 }));
  const group = (key: (l: Lead) => string) => {
    const m = new Map<string, { leads: number; contacted: number; replied: number }>();
    for (const l of t.leads) {
      const k = key(l) || "Unknown";
      const v = m.get(k) ?? { leads: 0, contacted: 0, replied: 0 };
      v.leads++;
      if (reached(l, "contacted")) v.contacted++;
      if (reached(l, "replied")) v.replied++;
      m.set(k, v);
    }
    return [...m.entries()].map(([k, v]) => ({ key: k, ...v })).sort((a, b) => b.leads - a.leads).slice(0, 8);
  };
  const touches = t.leads.flatMap((l) => (l.sequence ?? []).map((m) => ({ ...m, replied: reached(l, "replied") })));
  const variants = (["A", "B"] as const).flatMap((v) =>
    (["email", "linkedin"] as const).map((ch) => {
      const xs = touches.filter((m) => m.variant === v && m.channel === ch);
      return { variant: v, channel: ch, drafted: xs.length, approved: xs.filter((m) => m.approval === "approved").length, replied: xs.filter((m) => m.approval === "approved" && m.replied).length };
    }),
  );
  const acts = t.activity ?? [];
  return {
    funnel,
    conv,
    byIndustry: group((l) => l.industry ?? ""),
    byTier: group((l) => (l.tier ? `Tier ${l.tier}` : "Unscored")),
    variants,
    attribution: { agent: acts.filter((a) => a.actor === "agent").length, rep: acts.filter((a) => a.actor === "rep").length },
    pendingApprovals: touches.filter((m) => m.approval === "pending").length,
  };
}

export async function memorySearch(q: string) {
  const t = await loadTeam();
  const r = await search(domainKey(t), q, { topK: 8 });
  await meter("search_query", {}, q.slice(0, 60));
  log(t, { actor: "rep", who: "You", kind: "search", text: `Searched GTM memory: "${q}" (${r.hits.length} hits, ${r.ms} ms via ${r.provider})`, ms: r.ms });
  await saveTeam(t);
  return r;
}

/** Put everything we know about this company into Moss (used after a restart or when Moss was unavailable). */
export async function reindexAll() {
  const t = await loadTeam();
  const docs: { id: string; text: string; metadata?: Record<string, string> }[] = [];
  if (t.icpSpec) docs.push({ id: "icp", text: `Ideal customer: ${t.icpSpec.summary}`, metadata: { kind: "icp" } });
  for (const c of t.competitors ?? []) docs.push({ id: `comp-${c.name.toLowerCase().replace(/\W+/g, "-")}`, text: `Competitor ${c.name} (${c.category}): ${c.positioning}. Pricing: ${c.pricing}`, metadata: { kind: "competitor", url: c.sourceUrl } });
  for (const l of t.leads) {
    docs.push({ id: `lead-${l.id}`, text: `${l.company} (${l.domain}) ${l.industry ?? ""} ${l.hq ?? ""}. ${l.why}.${l.score ? ` Score ${l.score} tier ${l.tier}.` : ""}`, metadata: { kind: "lead", leadId: l.id, url: l.sourceUrl } });
    (l.signals ?? []).forEach((s, i) => docs.push({ id: `sig-${l.id}-${i}`, text: `${l.company} signal (${s.kind}): ${s.text}`, metadata: { kind: "signal", leadId: l.id, url: s.sourceUrl ?? "" } }));
    for (const c of l.contacts ?? []) docs.push({ id: `person-${c.id}`, text: `${c.name}, ${c.title} at ${l.company}${c.previousCompanies?.length ? `; previously at ${c.previousCompanies.join(", ")}` : ""}`, metadata: { kind: "person", leadId: l.id } });
    if (l.email) docs.push({ id: `msg-${l.id}`, text: `Outreach to ${l.company}: ${l.email.subject}. ${l.email.body}`, metadata: { kind: "message", leadId: l.id } });
  }
  await indexDocs(domainKey(t), docs);
  return docs.length;
}

export type Recall = { ms: number; hits: number; provider: "moss" | "local"; model?: string; inferMs?: number; facts: string[] };

/**
 * Voice: a teammate answers from GTM memory. Moss search (in-process, this company only) finds the facts in a few ms,
 * then Moss inference speaks the answer from those facts; our own model is the fallback.
 */
export async function recallAnswer(question: string, speaker: { name: string; role: string }, player: string): Promise<{ line: string; recall: Recall }> {
  const t = await loadTeam();
  const r = await search(domainKey(t), question, { topK: 6 });
  await meter("search_query", { via: "voice" }, question.slice(0, 60));
  const facts = r.hits.filter((h) => h.score > 0.05).map((h) => `[${h.metadata?.kind ?? "fact"}] ${h.text.slice(0, 280)}`);
  const pipeline = t.leads.slice(0, 12).map((l) => `${l.company}: ${stageOf(l)}${l.tier ? `, Tier ${l.tier} (${l.score})` : ""}`).join("; ");
  const instructions = `You are ${speaker.name}, ${speaker.role} on ${player}'s sales team at ${t.company ?? "our company"}. Answer out loud in 1-3 short natural sentences, using ONLY the facts and pipeline given. Name specific companies, people and signals. If the facts do not answer it, say what you do know and what you will look into next. Never ask ${player} a question. Never mention facts, memory, recall or the pipeline as sources; just say it like a teammate who knows. No lists, no markdown.`;
  const input = `${player} asks: "${question}"\n\nFacts recalled from memory:\n${facts.join("\n") || "(none)"}\n\nPipeline: ${pipeline || "no leads yet"}`;
  let line = "";
  let model: string | undefined;
  let inferMs: number | undefined;
  const inf = await mossAnswer(instructions, input);
  if (inf) {
    line = inf.text.replace(/\s*\n+\s*/g, " ");
    model = inf.model;
    inferMs = inf.ms;
  } else {
    const { data } = await llmJSON<{ say: string }>({
      label: "team-recall",
      maxTokens: 300,
      system: instructions,
      user: input,
      schema: obj({ say: str() }),
      mock: () => ({ say: facts[0] ? `Here's what I have: ${facts[0].replace(/^\[[^\]]+\]\s*/, "")}` : `${player}, I don't have anything on that yet.` }),
    });
    line = data.say;
  }
  const recall: Recall = { ms: r.ms, hits: facts.length, provider: r.provider, model, inferMs, facts: facts.slice(0, 4) };
  log(t, { actor: "agent", who: speaker.name, kind: "search", text: `Voice: Moss recalled ${facts.length} facts in ${r.ms} ms${model ? `, answered by ${model} in ${inferMs} ms` : ""} for "${question.slice(0, 60)}"`, ms: r.ms });
  await saveTeam(t);
  return { line, recall };
}

/** Called by the sender after an email really goes out. */
export async function markTouchSent(leadId: string, touchId: string, messageId: string) {
  const t = await loadTeam();
  const l = t.leads.find((x) => x.id === leadId);
  const m = l?.sequence?.find((x) => x.id === touchId);
  if (!l || !m) return;
  m.sentAt = new Date().toISOString();
  m.messageId = messageId;
  await meter("outreach_sent", { lead: l.domain, channel: m.channel, variant: m.variant }, `${l.company} ${m.channel}`);
  log(t, { actor: "agent", who: "Arjun", kind: "approve", text: `Sent ${m.channel} step ${m.step} to ${m.to}. Charged $${PRICES.outreach_sent.toFixed(2)}`, leadId });
  if (m.step === 1 && stageOf(l) === "matched") setStage(t, l, "contacted", "agent", "Arjun", "first email sent");
  await saveTeam(t);
}

/** A person replied: stop the sequence, move the lead, record why. */
export async function markReplied(leadId: string, category: string, snippet: string) {
  const t = await loadTeam();
  const l = t.leads.find((x) => x.id === leadId);
  if (!l) return;
  for (const m of l.sequence ?? []) if (!m.sentAt && m.approval !== "rejected") m.approval = "rejected";
  if (["interested", "not_now", "other"].includes(category) && ["matched", "contacted"].includes(stageOf(l))) setStage(t, l, "replied", "agent", "Elena", category.replace("_", " "));
  if (category === "unsubscribe" || category === "not_interested") setStage(t, l, "lost", "agent", "Elena", category.replace("_", " "));
  log(t, { actor: "agent", who: "Elena", kind: "stage", text: `${l.company} replied (${category.replace("_", " ")}): "${snippet.slice(0, 90)}"`, leadId });
  await saveTeam(t);
}

/** Save the agent's targeting, campaign and company-knowledge settings. */
export async function saveAgentSettings(patch: { targeting?: TeamState["targeting"]; campaign?: TeamState["campaign"]; knowledge?: TeamState["knowledge"] }) {
  const t = await loadTeam();
  if (patch.targeting) t.targeting = patch.targeting;
  if (patch.campaign) t.campaign = patch.campaign;
  if (patch.knowledge) t.knowledge = patch.knowledge;
  log(t, { actor: "rep", who: "You", kind: "icp", text: `Updated ${Object.keys(patch).join(" and ")}` });
  await saveTeam(t);
  return t;
}

/** Your own list: rows of company, domain, name, title, email. Contacts you give us skip the people search. */
export async function importLeads(rows: { company?: string; domain?: string; name?: string; title?: string; email?: string }[]) {
  const t = await loadTeam();
  const have = new Set(t.leads.map((l) => l.domain.toLowerCase()));
  const added: Lead[] = [];
  for (const r of rows.slice(0, 500)) {
    const domain = (r.domain || (r.email?.split("@")[1] ?? "")).toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
    if (!domain || have.has(domain)) continue;
    have.add(domain);
    const lead: Lead = {
      id: randomUUID().slice(0, 8),
      company: r.company || domain.split(".")[0],
      domain,
      why: "Imported from your list",
      sourceUrl: `https://${domain}`,
      status: "new",
      foundBy: "You (import)",
      at: new Date().toISOString(),
      stage: "matched",
      history: [{ at: new Date().toISOString(), stage: "matched", actor: "rep", who: "You", note: "imported" }],
    };
    if (r.name && r.email) {
      lead.contacts = [{ id: `${lead.id}-u0`, name: r.name, title: r.title ?? "", email: r.email.toLowerCase(), emailStatus: "unknown", source: "inferred", confidence: 0.8, persona: matchPersona(r.title ?? "", t.personas ?? [], undefined)?.label }];
    }
    added.push(lead);
  }
  t.leads.unshift(...added);
  log(t, { actor: "rep", who: "You", kind: "discover", text: `Imported ${added.length} compan${added.length === 1 ? "y" : "ies"} from a list` });
  await saveTeam(t);
  await indexDocs(domainKey(t), added.map((l) => ({ id: `lead-${l.id}`, text: `${l.company} (${l.domain}). ${l.why}`, metadata: { kind: "lead", leadId: l.id, url: l.sourceUrl } })));
  return added.length;
}
