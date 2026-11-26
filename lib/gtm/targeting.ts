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

/** Does this lead's score clear the precision bar for getting an email? */
export function clearsPrecision(score: number | undefined, t: T): boolean {
  const p = targetingOf(t).precision;
  if (p === "off") return true;
  if (score === undefined) return false;
  return p === "high" ? score >= 65 : score >= 45;
}
