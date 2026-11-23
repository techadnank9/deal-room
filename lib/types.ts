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
};

export type ClaimStatus = "verified" | "unsupported" | "contradicted";
export type ClaimCheck = { claim: string; status: ClaimStatus; sourceUrl: string; note: string };

export type ResearchSource = { title: string; url: string; snippet: string };

export type Brief = {
  company: string;
  domain: string;
  summary: string;
  facts: { text: string; sourceUrl: string }[];
  sources: ResearchSource[];
  enrichment?: Record<string, unknown>;
  researchProvider: string;
  enrichmentProvider: string;
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
  done: boolean;
};

export const MAX_TURNS = 8;
