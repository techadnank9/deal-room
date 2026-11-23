import { listSessions } from "@/lib/db";
import type { SessionState } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Check = { key: string; label: string; met: boolean };

function qualify(s: SessionState): Check[] {
  const conv = (id: string) => s.personas.find((p) => p.id === id)?.conviction ?? 0;
  const verifiedNumber = s.claimChecks.some((c) => c.status === "verified" && /\d/.test(c.claim));
  const champion = Object.values(s.alliances ?? {}).some(Boolean);
  const competitor = (s.worldEvents ?? []).some((e) => e.kind === "competitor_bid");
  return [
    { key: "M", label: "Metrics backed by a verified number", met: verifiedNumber },
    { key: "E", label: "Economic buyer (CFO) at 60+", met: conv("cfo") >= 60 },
    { key: "D", label: "Decision criteria: tech lead at 60+", met: conv("tech") >= 60 },
    { key: "P", label: "Paper process: procurement at 60+", met: conv("procurement") >= 60 },
    { key: "C", label: "Champion: an executive backs a seller", met: champion },
    { key: "X", label: "Competition handled (no unanswered rival bid)", met: !competitor || (s.votes ?? []).some((v) => v.vote === "buy") },
  ];
}

/** Every account with its latest meeting, stage, risk and qualification. */
export async function GET() {
  const sessions = await listSessions();
  const byDomain = new Map<string, SessionState[]>();
  for (const s of sessions) {
    const k = s.brief.domain || s.url;
    byDomain.set(k, [...(byDomain.get(k) ?? []), s]);
  }
  const deals = [...byDomain.entries()].map(([domain, list]) => {
    // Most recent meeting that actually happened; fall back to the newest scheduled one.
    const s = list.find((x) => x.turn > 0) ?? list[0];
    const record = { won: list.filter((x) => x.status === "finished" && (x.votes ?? []).filter((v) => v.vote === "buy").length >= 2).length, lost: list.filter((x) => x.status === "finished" && (x.votes ?? []).filter((v) => v.vote === "buy").length < 2).length };
    const avg = Math.round(s.personas.reduce((a, p) => a + p.conviction, 0) / s.personas.length);
    const buys = (s.votes ?? []).filter((v) => v.vote === "buy").length;
    const stage =
      s.status === "finished" ? (buys >= 2 ? "Won" : "Lost") : s.turn > 0 ? "In meeting" : "Meeting scheduled";
    const failed = s.claimChecks.filter((c) => c.status === "contradicted").length;
    const risk = stage === "Won" ? "Low" : avg >= 55 && failed === 0 ? "Low" : avg >= 40 ? "Medium" : "High";
    const checks = qualify(s);
    return {
      id: s.id,
      domain,
      company: s.brief.company,
      offering: s.offering,
      stage,
      risk,
      avgConviction: avg,
      committee: s.personas.map((p) => ({ id: p.id, name: p.name, title: p.title, conviction: p.conviction, backs: s.alliances?.[p.id] ?? null, vote: s.votes?.find((v) => v.id === p.id)?.vote ?? null })),
      players: (s.players ?? []).map((p) => p.name),
      worldEvent: s.worldEvents?.[0]?.kind ?? null,
      checks,
      score: Math.round((checks.filter((c) => c.met).length / checks.length) * 100),
      meetings: list.length,
      record,
      turns: s.turn,
      lastActivity: s.createdAt,
      portrait: s.portraits ?? {},
    };
  });
  const totals = {
    accounts: deals.length,
    won: deals.filter((d) => d.stage === "Won").length,
    lost: deals.filter((d) => d.stage === "Lost").length,
    meetingsWon: deals.reduce((a, d) => a + d.record.won, 0),
    meetingsLost: deals.reduce((a, d) => a + d.record.lost, 0),
    open: deals.filter((d) => d.stage === "In meeting" || d.stage === "Meeting scheduled").length,
    highRisk: deals.filter((d) => d.risk === "High" && d.stage !== "Lost").length,
  };
  return Response.json({ deals, totals });
}
