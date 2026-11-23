import { enm, int, llmJSON, obj, str } from "../llm";
import type { Persona, SessionState, Vote } from "../types";

export async function castVote(p: Persona, s: SessionState): Promise<Vote> {
  const execIds = new Set(s.personas.map((x) => x.id));
  const userLines = s.transcript.filter((l) => !execIds.has(l.speaker as Persona["id"]));
  // Conviction decides clear cases; the model judges the middle band and always writes the reason.
  const forced = p.conviction >= 60 ? "buy" : p.conviction < 45 ? "pass" : null;
  const transcript = s.transcript.map((l) => `[turn ${l.turn}] ${l.speaker}: ${l.text}`).join("\n");
  const busted = s.claimChecks.filter((c) => c.status === "contradicted").map((c) => `${c.claim} (contradicted)`);
  const { data } = await llmJSON<{ vote: "buy" | "pass"; reason: string; decisiveTurn: number }>({
    label: `vote:${p.id}`,
    system: `You are ${p.name}, ${p.title}. Personality: ${p.personality}. Priorities: ${p.priorities.join("; ")}. The sales meeting is over. Your conviction ended at ${p.conviction}/100. ${forced ? `Your vote is ${forced.toUpperCase()}; explain why in your own voice.` : "You are on the fence: vote buy if the team gave concrete commitments on your priorities (a pilot, terms, proof plan, next steps), pass if not."} Claims with no public source are normal for a seller\x27s own product and are not by themselves a reason to pass; contradicted claims are. reason = one or two sentences in your voice. decisiveTurn = the turn number of the salesperson line that most decided your vote.`,
    user: `Transcript:\n${transcript}\n\nClaims that did not verify: ${busted.join("; ") || "none"}`,
    schema: obj({ vote: enm(["buy", "pass"]), reason: str(), decisiveTurn: int() }),
    maxTokens: 600,
    mock: () => {
      const buy = forced === "buy" || (forced !== "pass" && p.conviction >= 52 && Math.random() < 0.5) || (p.conviction >= 52 && Math.random() < 0.5);
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
    vote: forced ?? data.vote,
    reason: data.reason,
    decisiveTurn: line?.turn ?? data.decisiveTurn,
    decisiveLine: line?.text ?? "",
  };
}
