// GTM Engine data model, layered onto the team room's leads and state.

export type Stage = "matched" | "contacted" | "replied" | "meeting" | "won" | "lost";
export const STAGES: { key: Stage; label: string }[] = [
  { key: "matched", label: "Matched" },
  { key: "contacted", label: "Contacted" },
  { key: "replied", label: "Replied" },
  { key: "meeting", label: "Meeting booked" },
  { key: "won", label: "Closed won" },
  { key: "lost", label: "Closed lost" },
];

export type Actor = "agent" | "rep";

export type Contact = {
  id: string;
  name: string;
  title: string;
  email?: string;
  emailStatus: "verified" | "risky" | "invalid" | "mx-valid" | "no-mx" | "guessed" | "unknown";
  persona?: string;
  linkedin?: string;
  previousCompanies?: string[];
  source: "glasser" | "inferred";
  confidence: number;
  /** The seller's own list this person is filed under (one list per contact). */
  list?: string;
  /** Private notes from the seller. */
  notes?: string;
};

export type Signal = { kind: "funding" | "hiring" | "launch" | "exec_hire" | "tech_change" | "expansion" | "other"; text: string; sourceUrl?: string };

export type Touch = {
  id: string;
  step: number;
  channel: "email" | "linkedin";
  variant: "A" | "B";
  to?: string;
  subject?: string;
  body: string;
  dayOffset: number;
  approval: "pending" | "approved" | "rejected";
  edited?: boolean;
  draftedBy: string;
  decidedAt?: string;
  sentAt?: string;
  messageId?: string;
  citations?: string[];
};

export type StageEvent = { at: string; stage: Stage; actor: Actor; who: string; note?: string };

export type LeadGtm = {
  stage?: Stage;
  industry?: string;
  hq?: string;
  fit?: number;
  intent?: number;
  score?: number;
  tier?: "A" | "B" | "C";
  scoreWhy?: string;
  signals?: Signal[];
  contacts?: Contact[];
  sequence?: Touch[];
  history?: StageEvent[];
  enriched?: "done" | "blocked" | "failed";
  enrichedAt?: string;
  /** The seller's verdict on this lead; the agent learns from these when it picks new companies. */
  feedback?: { fit: "good" | "bad"; reason?: string; at: string };
};

export type Confident<T> = T & { confidence: number };
export type Expansion = { id: string; segment: string; reasoning: string; evidence: string; status: "suggested" | "accepted" | "dismissed" };

export type IcpSpec = {
  summary: string;
  industries: Confident<{ name: string; naics: string }>[];
  companySize: Confident<{ headcount: string; revenue: string }>;
  personas: Confident<{ title: string; seniority: string; function: string }>[];
  triggers: Confident<{ event: string }>[];
  regions: Confident<{ name: string }>[];
  negativeSignals: string[];
  expansions: Expansion[];
  generatedAt: string;
};

export type Competitor = {
  name: string;
  domain: string;
  category: "direct" | "indirect" | "alternative";
  positioning: string;
  pricing: string;
  theirEdge: string;
  ourEdge: string;
  sourceUrl: string;
};

export type Activity = {
  id: string;
  at: string;
  actor: Actor;
  who: string;
  kind: "think" | "search" | "graph" | "enrich" | "draft" | "approve" | "reject" | "stage" | "billing" | "icp" | "discover";
  text: string;
  leadId?: string;
  ms?: number;
};

export type Intake = { product: string; customers: string; pricing: string; constraints: string };

export type Persona = {
  id: string;
  label: string;
  role: "champion" | "economic_buyer" | "user" | "blocker";
  titles: string[];
  excludeTitles: string[];
  seniority: string[];
  departments: string[];
  /** Company sizes where this person is the one to contact, e.g. "50-500". */
  companySize: string;
  pains: string[];
  triggers: string[];
  /** Where they show up: competitors whose posts they engage with, keywords they follow. */
  watch: { competitors: string[]; keywords: string[] };
  angle: string;
  cta: string;
  evidence: { text: string; url: string }[];
  confidence: number;
  enabled: boolean;
};

export type Targeting = {
  excludeServiceProviders: boolean;
  excludeFreelancers: boolean;
  excludeConsultants: boolean;
  /** Drop any company whose name, description or reason contains one of these. */
  excludeKeywords: string[];
  /** If set, a company must mention at least one of these to qualify. */
  mandatoryKeywords: string[];
  /** high: only strong matches get emails; broad: anyone who fits; off: no score filter. */
  precision: "high" | "broad" | "off";
  /** Plain-language extra rules the AI checks, e.g. "Must sell to hospitals". */
  extraCriteria: string;
  /** Drop companies bigger than this (0 = no cap). */
  maxEmployees?: number;
};
export const DEFAULT_TARGETING: Targeting = { excludeServiceProviders: true, excludeFreelancers: true, excludeConsultants: true, excludeKeywords: [], mandatoryKeywords: [], precision: "broad", extraCriteria: "" };

export type CampaignSettings = {
  language: string;
  tone: "friendly" | "direct" | "formal";
  goal: "meeting" | "reply" | "demo";
  cta: string;
  followUpDays: number;
  linkedinStep: boolean;
};
export const DEFAULT_CAMPAIGN: CampaignSettings = { language: "English", tone: "friendly", goal: "meeting", cta: "", followUpDays: 4, linkedinStep: true };

export type Knowledge = { valueProp: string; pains: string; features: string; proof: string };

export type TeamGtm = {
  targeting?: Targeting;
  campaign?: CampaignSettings;
  knowledge?: Knowledge;
  personas?: Persona[];
  personasConfirmed?: boolean;
  /** The rep's first name (from the team room); outreach is signed by them, not by the agent. */
  rep?: string;
  intake?: Intake;
  icpSpec?: IcpSpec;
  competitors?: Competitor[];
  activity?: Activity[];
  /** Named contact lists the seller made. */
  lists?: string[];
  /** Workspace preferences. */
  prefs?: Prefs;
};

export type Prefs = {
  /** Look up and verify emails for new leads automatically (uses credits). */
  autoEnrich: boolean;
  /** Only write emails to people who match one of the personas. */
  personaOnly: boolean;
  /** Average deal size in dollars, for the pipeline value on the dashboard. */
  dealSize?: number;
};
export const DEFAULT_PREFS: Prefs = { autoEnrich: true, personaOnly: true };
