export type SignalHit = {
  company: string;
  domain?: string;
  kind: "hiring" | "funding" | "launch" | "news";
  text: string;
  sourceUrl: string;
  at: string /* ISO */;
  strength: number /* 0-1 */;
  data?: Record<string, unknown>;
};
