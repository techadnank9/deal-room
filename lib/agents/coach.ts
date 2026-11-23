import { arr, llmJSON, obj, str } from "../llm";
import type { SessionState } from "../types";

/** Three concrete things the seller should fix, grounded in this session. */
export async function coachFixes(s: SessionState): Promise<string[]> {
  const transcript = s.transcript.map((l) => `[turn ${l.turn}] ${l.speaker}: ${l.text}`).join("\n");
  const votes = (s.votes ?? []).map((v) => `${v.id} ${v.vote}: ${v.reason}`).join("\n");
  const claims = s.claimChecks.map((c) => `${c.claim} => ${c.status}`).join("\n");
  const { data } = await llmJSON<{ fixes: string[] }>({
    label: "coach",
    system:
      "You are a blunt sales coach reviewing a rehearsal. Give exactly three fixes. Each fix: one sentence, specific, references what the seller actually said or failed to say, and says what to do instead.",
    user: `Selling: ${s.offering} to ${s.brief.company}\n\nTranscript:\n${transcript}\n\nVotes:\n${votes}\n\nFact checks:\n${claims || "none"}`,
    schema: obj({ fixes: arr(str()) }),
    maxTokens: 800,
    mock: () => {
      const weakest = [...s.personas].sort((a, b) => a.conviction - b.conviction);
      const fixes = weakest.map(
        (p) => `${p.name} (${p.title}) ended at ${p.conviction}: open with a concrete answer to "${p.objections[0]?.text ?? p.priorities[0]}".`,
      );
      if (s.claimChecks.some((c) => c.status !== "verified")) {
        fixes[2] = "Bring a source for every number you say. Unverified claims cost you trust in the room.";
      }
      return { fixes };
    },
  });
  return data.fixes.slice(0, 3);
}
