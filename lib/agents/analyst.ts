import { llmJSON, obj, str } from "../llm";
import { buildPipeline } from "../pipeline";
import type { SessionState } from "../types";

export type CrmLead = { company: string; stage: string; risk: string; room: number; next: string; id: string };
export type CrmBriefing = { spoken: string; leads: CrmLead[]; email: { to: string; subject: string; body: string } };

const ANALYST_WORDS = /\b(analyst|lead|leads|pipeline|crm|email|follow[- ]?up|draft|status|update me|accounts?)\b/i;

/** Did the human call the analyst / ask about the pipeline? */
export function wantsAnalyst(text: string) {
  return ANALYST_WORDS.test(text);
}

/** Which executive did the human address by name or role, if any. */
export function calledExec(text: string, s: SessionState): string | null {
  const t = text.toLowerCase();
  for (const p of s.personas) {
    const first = p.name.split(/\s+/)[0].toLowerCase();
    if (first.length > 2 && new RegExp(`\\b${first}\\b`).test(t)) return p.id;
  }
  if (/\bcfo\b|\bfinance\b/.test(t)) return "cfo";
  if (/\btech lead\b|\bcto\b|\bengineering\b/.test(t)) return "tech";
  if (/\bprocurement\b/.test(t)) return "procurement";
  return null;
}

/** The analyst walks over, pulls up the CRM, briefs the team and drafts the follow-up email. */
export async function analystBriefing(s: SessionState, ask: string, player: string): Promise<CrmBriefing> {
  const { deals } = await buildPipeline();
  const leads: CrmLead[] = deals.slice(0, 8).map((d) => ({
    id: d.id,
    company: d.company,
    stage: d.stage,
    risk: d.risk,
    room: d.avgConviction,
    next:
      d.stage === "Won" ? "Send contract and kickoff plan" : d.stage === "Lost" ? "Re-engage next quarter with proof" : d.risk === "High" ? "Fix the weakest objection before next call" : "Book the follow-up meeting",
  }));
  const here = s.personas.map((p) => `${p.name} (${p.title}) conviction ${p.conviction}`).join("; ");
  const transcript = s.transcript.slice(-10).map((l) => `${l.speaker}: ${l.text}`).join("\n");
  const { data } = await llmJSON<{ spoken: string; subject: string; body: string; to: string }>({
    label: "analyst-briefing",
    maxTokens: 1200,
    system:
      "You are the deal analyst in the room, talking directly to the seller who just called you over. Speak naturally (2-3 sentences, no lists): update them on the pipeline in plain words (which accounts are hot, which are at risk) and on this account, then say you drafted the follow-up email. Then write that follow-up email from the seller to the most important executive in this account: subject and a short body (under 120 words) that addresses their top open objection and proposes a concrete next step. Use only facts given.",
    user: `Seller ${player} said: "${ask}"\n\nThis account: ${s.brief.company}. Committee now: ${here}. Tactic: ${s.tactic ?? "probe"}.\nRecent conversation:\n${transcript || "(none yet)"}\n\nPipeline:\n${leads.map((l) => `${l.company}: ${l.stage}, risk ${l.risk}, room ${l.room}`).join("\n")}`,
    schema: obj({ spoken: str(), to: str("name and title of the executive"), subject: str(), body: str() }),
    mock: () => {
      const top = [...s.personas].sort((a, b) => a.conviction - b.conviction)[0];
      return {
        spoken: `${player}, you have ${leads.length} accounts in the pipeline; ${leads.filter((l) => l.risk === "High").length} are at risk. Here, ${top?.name ?? "the committee"} is the hardest vote, so I drafted a follow-up for them.`,
        to: `${top?.name}, ${top?.title}`,
        subject: `${s.brief.company}: answering your open question`,
        body: `Hi ${top?.name.split(" ")[0]},\n\nThanks for the time today. You asked about ${top?.priorities[0]?.toLowerCase()}. Here is a concrete proposal: a 30-day pilot with success criteria we agree upfront.\n\nCould we book 30 minutes this week?\n\n${player}`,
      };
    },
  });
  return { spoken: data.spoken, leads, email: { to: data.to, subject: data.subject, body: data.body } };
}

