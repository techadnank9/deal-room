import type { ClaimCheck, SessionState } from "../types";

export type Tactic = "probe" | "pressure" | "close";
export type Performance = "struggling" | "steady" | "winning";

export const TACTIC_BRIEF: Record<Tactic, string> = {
  probe:
    "Committee tactic: PROBE. The seller is holding steady. Dig into the open questions on your priorities and ask for one specific number or example.",
  pressure:
    "Committee tactic: PRESSURE. The seller is struggling (vague answers or claims that did not check out). Be tougher: name the weakest claim, demand proof or a customer reference, and do not let them change the subject.",
  close:
    "Committee tactic: CLOSE. The seller is winning the room. Move to buying questions: terms, rollout plan, who owns it on their side, what a pilot success looks like, next steps.",
};

/**
 * Director reads how the human is doing after each turn and decides how the committee adapts.
 * Uses this turn's conviction changes and fact checks plus the trend so far.
 */
export function assessPerformance(
  s: SessionState,
  deltas: number[],
  checks: ClaimCheck[],
): { performance: Performance; tactic: Tactic; reason: string } {
  const avgDelta = deltas.reduce((a, b) => a + b, 0) / Math.max(1, deltas.length);
  // Contradicted claims are what hurt; unsupported ones (no public source) only weigh a little.
  const failed = checks.filter((c) => c.status === "contradicted").length + checks.filter((c) => c.status === "unsupported").length * 0.34;
  const failedSoFar = s.claimChecks.filter((c) => c.status === "contradicted").length;
  const avgConviction = s.personas.reduce((a, p) => a + p.conviction, 0) / s.personas.length;

  let performance: Performance = "steady";
  if (avgDelta <= -3 || failed >= 1 || (failedSoFar >= 2 && avgDelta < 2)) performance = "struggling";
  else if (avgDelta >= 4 || avgConviction >= 60) performance = "winning";

  const tactic: Tactic = performance === "struggling" ? "pressure" : performance === "winning" ? "close" : "probe";
  const parts = [
    `room moved ${avgDelta >= 0 ? "+" : ""}${avgDelta.toFixed(1)} on average`,
    checks.some((c) => c.status === "contradicted") ? `${checks.filter((c) => c.status === "contradicted").length} claim(s) contradicted by sources` : checks.length ? `${checks.filter((c) => c.status === "unsupported").length} unverified claim(s), none contradicted` : "no checkable claims",
    `average conviction ${Math.round(avgConviction)}`,
  ];
  return { performance, tactic, reason: parts.join(", ") };
}
