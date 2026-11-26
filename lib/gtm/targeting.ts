// Advanced targeting: rules every lead source and the writer respect.
import { DEFAULT_CAMPAIGN, DEFAULT_TARGETING, type CampaignSettings, type Targeting } from "./types";

type T = { targeting?: Targeting; campaign?: CampaignSettings };

export function targetingOf(t: T): Targeting {
  return { ...DEFAULT_TARGETING, ...(t.targeting ?? {}) };
}
export function campaignOf(t: T): CampaignSettings {
  return { ...DEFAULT_CAMPAIGN, ...(t.campaign ?? {}) };
}

/** Rules appended to every "pick companies" prompt. */
export function targetingRules(t: T): string {
  const g = targetingOf(t);
  const r: string[] = [];
  const ex = [g.excludeServiceProviders && "agencies and service providers", g.excludeFreelancers && "freelancers and one-person shops", g.excludeConsultants && "consultancies"].filter(Boolean);
  if (ex.length) r.push(`Never pick ${ex.join(", ")}.`);
  if (g.excludeKeywords.length) r.push(`Never pick a company whose name or business involves: ${g.excludeKeywords.join(", ")}.`);
  if (g.mandatoryKeywords.length) r.push(`Only pick companies clearly related to at least one of: ${g.mandatoryKeywords.join(", ")}.`);
  if (g.extraCriteria.trim()) r.push(`Every company must also satisfy: ${g.extraCriteria.trim()}`);
  return r.length ? ` Targeting rules from the seller: ${r.join(" ")}` : "";
}

/** Hard keyword checks on a candidate's text (name, reason, description). */
export function passesKeywords(text: string, t: T): { ok: boolean; why?: string } {
  const g = targetingOf(t);
  const low = text.toLowerCase();
  const bad = g.excludeKeywords.find((k) => k.trim() && low.includes(k.trim().toLowerCase()));
  if (bad) return { ok: false, why: `mentions excluded keyword "${bad}"` };
  if (g.mandatoryKeywords.length && !g.mandatoryKeywords.some((k) => k.trim() && low.includes(k.trim().toLowerCase()))) return { ok: false, why: "missing a required keyword" };
  return { ok: true };
}

/** Email statuses the agent may write to and send to. Unverified guesses bounce and hurt the domain: never. */
export function sendable(status: string | undefined, prefs?: { allowCatchAll?: boolean }): boolean {
  return status === "verified" || (status === "risky" && prefs?.allowCatchAll !== false);
}

/** Does this lead's score clear the precision bar for getting an email? */
export function clearsPrecision(score: number | undefined, t: T): boolean {
  const p = targetingOf(t).precision;
  if (p === "off") return true;
  if (score === undefined) return false;
  return p === "high" ? score >= 65 : score >= 45;
}

/** Recent fit / not-fit marks, as prompt text for whoever picks new companies. Empty until the seller marks some. */
export function fitExamples(t: { leads: { company: string; why: string; feedback?: { fit: "good" | "bad"; reason?: string; at: string } }[] }, max = 12): string {
  const marked = t.leads.filter((l) => l.feedback).sort((a, b) => b.feedback!.at.localeCompare(a.feedback!.at)).slice(0, max);
  if (!marked.length) return "";
  const good = marked.filter((l) => l.feedback!.fit === "good").map((l) => `${l.company} (${l.why.slice(0, 90)})`);
  const bad = marked.filter((l) => l.feedback!.fit === "bad").map((l) => `${l.company}${l.feedback!.reason ? ` — ${l.feedback!.reason}` : ""}`);
  return ` Learn from the seller's own verdicts on earlier leads.${good.length ? ` Good fits (find more like these): ${good.join("; ")}.` : ""}${bad.length ? ` Not a fit (avoid companies like these, for the reason given): ${bad.join("; ")}.` : ""}`;
}

