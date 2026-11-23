import { enm, int, llmJSON, obj, str } from "../llm";
import type { Persona, SessionState, Vote } from "../types";

export async function castVote(p: Persona, s: SessionState): Promise<Vote> {
  const userLines = s.transcript.filter((l) => l.speaker === "user");
  const transcript = s.transcript.map((l) => `[turn ${l.turn}] ${l.speaker}: ${l.text}`).join("\n");
  const busted = s.claimChecks.filter((c) => c.status !== "verified").map((c) => `${c.claim} (${c.status})`);
  const { data } = await llmJSON<{ vote: "buy" | "pass"; reason: string; decisiveTurn: number }>({
    label: `vote:${p.id}`,
    system: `You are ${p.name}, ${p.title}. Personality: ${p.personality}. Priorities: ${p.priorities.join("; ")}. The sales meeting is over. Your conviction ended at ${p.conviction}/100 (above 60 usually means buy, but use judgment). Vote "buy" or "pass". reason = one or two sentences in your voice. decisiveTurn = the turn number of the salesperson line that most decided your vote.`,
    user: `Transcript:\n${transcript}\n\nClaims that did not verify: ${busted.join("; ") || "none"}`,
    schema: obj({ vote: enm(["buy", "pass"]), reason: str(), decisiveTurn: int() }),
    maxTokens: 600,
    mock: () => {
      const buy = p.conviction >= 60 || (p.conviction >= 52 && Math.random() < 0.5);
      const decisive = userLines.length ? userLines[Math.floor(Math.random() * userLines.length)].turn : 0;
      return {
        vote: buy ? "buy" : "pass",
        reason: buy
          ? `You addressed ${p.priorities[0].toLowerCase()} well enough for me to move forward.`
          : `I never got a convincing answer on ${p.priorities[0].toLowerCase()}.`,
        decisiveTurn: decisive,
      };
    },
  });
  const line = userLines.find((l) => l.turn === data.decisiveTurn) ?? userLines[userLines.length - 1];
  return {
    id: p.id,
    vote: data.vote,
    reason: data.reason,
    decisiveTurn: line?.turn ?? data.decisiveTurn,
    decisiveLine: line?.text ?? "",
  };
}
