export type ExecId = "cfo" | "tech" | "procurement";
export const EXEC_IDS: ExecId[] = ["cfo", "tech", "procurement"];

export type Persona = {
  id: ExecId;
  name: string;
  title: string;
  priorities: string[];
  objections: { text: string; sourceUrl: string }[];
  conviction: number;
  voice: string;
  personality: string;
};

export type Gesture = "idle" | "nod" | "headShake" | "armsCrossed" | "leanIn" | "whisper";
export const GESTURES: Gesture[] = ["idle", "nod", "headShake", "armsCrossed", "leanIn", "whisper"];

export type ObjectionType = "price" | "roi" | "security" | "integration" | "timing" | "vendor_risk" | "proof" | "none";
export const OBJECTION_TYPES: ObjectionType[] = ["price", "roi", "security", "integration", "timing", "vendor_risk", "proof", "none"];

export type ExecTurn = {
  privateThought: string;
  privateMessage?: { to: string; text: string } | null;
  urgeToSpeak: number;
  spokenLine: string;
  convictionDelta: number;
  gesture: Gesture;
  reason: string;
  objectionType: ObjectionType;
  allyWith?: string;
  offer?: string;
  worldEvent?: string;
};

export type ClaimStatus = "verified" | "unsupported" | "contradicted";
export type ClaimCheck = { claim: string; status: ClaimStatus; sourceUrl: string; note: string };

export type ResearchSource = { title: string; url: string; snippet: string; kind?: string };

export type Brief = {
  company: string;
  domain: string;
  summary: string;
  facts: { text: string; sourceUrl: string }[];
  sources: ResearchSource[];
  enrichment?: Record<string, unknown>;
  researchProvider: string;
  seller?: { url: string; name: string; sources: ResearchSource[]; provider: string };
  enrichmentProvider: string;
  breakdown?: Breakdown;
  steps?: { label: string; provider: string; found: number; ms: number }[];
};

export type TranscriptLine = { turn: number; speaker: string; text: string };

export type Whisper = { turn: number; from: ExecId; to: string; text: string };

export type Vote = {
  id: ExecId;
  vote: "buy" | "pass";
  reason: string;
  decisiveTurn: number;
  decisiveLine: string;
};

export type SessionState = {
  id: string;
  url: string;
  offering: string;
  brief: Brief;
  personas: Persona[];
  transcript: TranscriptLine[];
  whispers: Whisper[];
  claimChecks: (ClaimCheck & { turn: number })[];
  turn: number;
  status: "active" | "finished";
  votes?: Vote[];
  fixes?: string[];
  bandRoomId?: string;
  bandProvider?: string;
  backdropUrl?: string | null;
  portraits?: Partial<Record<ExecId, string>>;
  imagesPending?: boolean;
  model?: string;
  players?: { name: string; color: string; joinedAt: string }[];
  alliances?: Partial<Record<ExecId, string | null>>;
  worldEvents?: { turn: number; by: ExecId; kind: string; text: string }[];
  log?: SharedLogEntry[];
  seq?: number;
  live?: { speaker: string; line: string; gestures: Record<string, Gesture>; gestureAt: number; check: ClaimCheck | null; whispers: { from: string; to: string }[]; event: { kind: string; text: string; by: string } | null };
  lastHumanAt?: number;
  busyUntil?: number;
  autoStreak?: number;
  tactic?: "probe" | "pressure" | "close";
  tacticHistory?: { turn: number; tactic: string; performance: string; reason: string }[];
  createdAt: string;
};

export type TurnResponse = {
  turn: number;
  speaker: ExecId;
  spokenLine: string;
  gestures: Record<ExecId, Gesture>;
  convictions: Record<ExecId, number>;
  thoughts: Record<ExecId, { privateThought: string; reason: string; delta: number; urge: number }>;
  factChecks: ClaimCheck[];
  whisperPairs: { from: ExecId; to: string }[];
  adaptation: { tactic: string; performance: string; reason: string; changed: boolean };
  done: boolean;
};

export const MAX_TURNS = 8;

export type SharedLogEntry = {
  key: string;
  turn: number;
  actor: string;
  action: string;
  detail?: string;
  reason?: string;
  hidden?: boolean;
  tone?: "good" | "bad" | "neutral";
};

export const WORLD_EVENTS = ["none", "budget_freeze", "competitor_bid", "exec_sponsor_joins"] as const;
export const PLAYER_COLORS = ["#16140f", "#2563eb", "#b45309", "#be185d"];

export type BreakdownItem = { text: string; sourceUrl: string };
export type Breakdown = {
  overview: string;
  whatTheySell: BreakdownItem[];
  customers: BreakdownItem[];
  businessModel: BreakdownItem[];
  funding: BreakdownItem[];
  teamAndHiring: BreakdownItem[];
  recentNews: BreakdownItem[];
  strategicPriorities: BreakdownItem[];
  risks: BreakdownItem[];
  buyingTriggers: BreakdownItem[];
  howToPitch: BreakdownItem[];
};
