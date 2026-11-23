import { enm, int, llmJSON, obj, str } from "../llm";
import { TACTIC_BRIEF } from "./director";
import {
  GESTURES,
  OBJECTION_TYPES,
  type ClaimCheck,
  type ExecId,
  type ExecTurn,
  type Gesture,
  type ObjectionType,
  type Persona,
  type SessionState,
} from "../types";

const TURN_SCHEMA = obj({
  privateThought: str("What you privately think right now, 1-2 sentences, candid"),
  privateMessage: {
    anyOf: [
      obj({ to: enm(["cfo", "tech", "procurement"]), text: str("Private side message to one colleague") }),
      { type: "null" },
    ],
  },
  urgeToSpeak: int("0-10, how badly you want to speak next"),
  spokenLine: str("What you would say out loud if you get the floor: 1-2 sentences, natural speech, no stage directions"),
  convictionDelta: int("-20 to 20, how much this turn moved you toward buying"),
  gesture: enm(GESTURES),
  reason: str("One sentence: why your conviction moved (or did not)"),
  objectionType: enm(OBJECTION_TYPES),
});

function personaBlock(p: Persona) {
  return `You are ${p.name}, ${p.title} (id "${p.id}"). Personality: ${p.personality}
Priorities: ${p.priorities.join("; ")}
Your grounded objections (from research): ${p.objections.map((o) => `${o.text} [${o.sourceUrl}]`).join(" | ")}`;
}

export async function executiveTurn(args: {
  persona: Persona;
  session: SessionState;
  utterance: string;
  inbox: { from: string; text: string }[];
  factChecks: ClaimCheck[];
}): Promise<ExecTurn> {
  const { persona: p, session: s, utterance, inbox, factChecks } = args;
  const others = s.personas.filter((o) => o.id !== p.id).map((o) => `${o.id}: ${o.name}, ${o.title}`).join("; ");
  const transcript = s.transcript.slice(-16).map((l) => `${l.speaker}: ${l.text}`).join("\n");
  const system = `${personaBlock(p)}

You are in a sales meeting at ${s.brief.company}. A salesperson is pitching: "${s.offering}". Your colleagues: ${others}.
Account brief: ${s.brief.summary}

Stay in character. You are a real buyer: skeptical but fair. Reward specifics, proof, and answers to YOUR priorities. Punish vagueness and dodged questions. Fact checks: "contradicted" means public evidence says the seller is wrong = big drop. "unsupported" only means the analyst found no public source, which is normal for a seller's own product details; treat it as a reason to ask for proof (0 to -3), not as a lie, and still reward a concrete, credible offer. Your current conviction is ${p.conviction}/100. Score convictionDelta on THIS line alone, with real range: vague hype or a busted claim = -6 to -15; a fair but generic answer = -2 to +3; a specific, credible answer to one of your priorities (concrete numbers, a pilot plan, terms, a reference) = +5 to +15, even if you still have questions. Do not reuse the same number every turn; the committee tactic changes what you ask next, never how fairly you score. Only send a privateMessage when you genuinely want to coordinate with one colleague (not every turn). Pick the gesture that matches your reaction. objectionType = the main concern your line raises ("none" if you are satisfied).

${TACTIC_BRIEF[s.tactic ?? "probe"]}`;
  const user = `Transcript so far:
${transcript || "(meeting just started)"}

Salesperson just said: "${utterance}"

Analyst fact checks on that line: ${factChecks.length ? factChecks.map((c) => `"${c.claim}" => ${c.status} (${c.note})`).join("; ") : "none"}
Private messages to you: ${inbox.length ? inbox.map((m) => `from ${m.from}: ${m.text}`).join("; ") : "none"}`;

  const { data } = await llmJSON<ExecTurn>({
    label: `exec:${p.id}`,
    system,
    user,
    schema: TURN_SCHEMA,
    maxTokens: 1200,
    mock: () => {
      const t = mockTurn(p, utterance, factChecks, s.turn);
      if (s.tactic === "close" && t.convictionDelta >= 0) t.spokenLine = "Let's talk terms. What would a 30-day pilot look like, and who owns it on your side?";
      if (s.tactic === "pressure" && t.convictionDelta < 0) t.spokenLine = `You keep avoiding it. Show me proof on ${p.priorities[0].toLowerCase()} or a customer I can call.`;
      return t;
    },
  });
  return {
    ...data,
    urgeToSpeak: clamp(data.urgeToSpeak, 0, 10),
    convictionDelta: clamp(data.convictionDelta, -20, 20),
    gesture: GESTURES.includes(data.gesture) ? data.gesture : "idle",
    privateMessage: data.privateMessage && data.privateMessage.to !== p.id ? data.privateMessage : null,
  };
}

/** Director: highest urge speaks; ties broken randomly so runs differ. */
export function pickSpeaker(turns: Record<ExecId, ExecTurn>): ExecId {
  const entries = Object.entries(turns) as [ExecId, ExecTurn][];
  const max = Math.max(...entries.map(([, t]) => t.urgeToSpeak));
  const top = entries.filter(([, t]) => t.urgeToSpeak === max);
  return top[Math.floor(Math.random() * top.length)][0];
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, Math.round(Number.isFinite(n) ? n : 0)));
}

const KEYWORDS: Record<ExecId, RegExp> = {
  cfo: /\b(roi|save|saving|cost|revenue|payback|margin|\$|percent|%|budget|month|year)\b/i,
  tech: /\b(api|integrat|security|soc ?2|sso|data|deploy|cloud|stack|latency|uptime|engineer)\b/i,
  procurement: /\b(price|pricing|contract|terms|discount|pilot|trial|vendor|reference|customer|support)\b/i,
};
const OBJ: Record<ExecId, ObjectionType> = { cfo: "roi", tech: "integration", procurement: "price" };

function mockTurn(p: Persona, utterance: string, checks: ClaimCheck[], turn: number): ExecTurn {
  const hit = KEYWORDS[p.id].test(utterance);
  const specific = /\d/.test(utterance);
  const busted = checks.some((c) => c.status === "contradicted");
  const unsupported = checks.some((c) => c.status === "unsupported");
  const noise = Math.floor(Math.random() * 9) - 4;
  let delta = (hit ? 8 : -3) + (specific ? 3 : -2) + (busted ? -12 : 0) + (unsupported ? -4 : 0) + noise;
  if (utterance.trim().split(/\s+/).length < 6) delta -= 4;
  delta = clamp(delta, -20, 20);
  const objection = p.objections[turn % p.objections.length]?.text ?? "Tell me more.";
  const gesture: Gesture = delta >= 6 ? (Math.random() < 0.5 ? "nod" : "leanIn") : delta <= -6 ? (Math.random() < 0.5 ? "headShake" : "armsCrossed") : "idle";
  const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
  const prio = p.priorities[turn % p.priorities.length].toLowerCase();
  const spokenLine =
    delta >= 6
      ? pick([
          `Okay, that helps on ${prio}. What would the first ninety days look like?`,
          `That's closer to what I need. Can you put that number in writing?`,
          `Fine. If that holds up, ${prio} stops being my blocker.`,
          `I like that. Who else our size is doing this today?`,
        ])
      : busted
        ? pick([
            "Our analyst says that number doesn't hold up. Why should I trust the rest?",
            "That claim just got contradicted on the screen. Want to try again?",
          ])
        : unsupported && Math.random() < 0.5
          ? pick(["Where does that number come from?", "I can't find a source for that. Do you have one?"])
          : pick([objection, `You still haven't told me anything about ${prio}.`, `Let me be direct: ${objection}`]);
  const whisperTo = (["cfo", "tech", "procurement"] as ExecId[]).filter((x) => x !== p.id)[Math.floor(Math.random() * 2)];
  return {
    privateThought: hit
      ? `They are finally talking about ${p.priorities[0].toLowerCase()}.`
      : `Nothing here about ${p.priorities[0].toLowerCase()} yet.`,
    privateMessage: Math.random() < 0.25 ? { to: whisperTo, text: delta > 0 ? "I'm warming up to this. You?" : "I'm not convinced. Push them on specifics." } : null,
    urgeToSpeak: clamp((hit ? 6 : 3) + Math.abs(delta) / 4 + Math.random() * 3, 0, 10),
    spokenLine,
    convictionDelta: delta,
    gesture,
    reason: hit
      ? `The pitch touched my priority (${p.priorities[0]})${specific ? " with specifics" : " but without numbers"}.`
      : `Nothing addressed ${p.priorities[0].toLowerCase()}${busted ? ", and a claim was contradicted" : ""}.`,
    objectionType: delta >= 6 ? "none" : busted ? "proof" : OBJ[p.id],
  };
}
