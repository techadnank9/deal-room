import { db, listSessions } from "@/lib/db";
import { readTrends } from "@/lib/bruin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const bruin = await readTrends();
  if (bruin) return Response.json(bruin);

  // Fallback before the Bruin pipeline has produced tables: aggregate raw events.
  const d = await db();
  const objections = await d.all(
    `select target as objection_type, count(*) as times_raised, avg(conviction_after - conviction_before) as avg_conviction_delta
     from events where event_type = 'conviction_change' and turn > 0 and target is not null and target <> 'none'
     group by target order by times_raised desc`,
  );
  const claims = await d.all(`select status, count(*) as n from events where event_type = 'claim_check' group by status`);
  const sessions = (await listSessions())
    .filter((s) => s.status === "finished")
    .map((s) => {
      const buys = (s.votes ?? []).filter((v) => v.vote === "buy").length;
      return { session_id: s.id, company: s.brief.company, buys, result: buys >= 2 ? "won" : "lost", turns: s.turn, created_at: s.createdAt };
    });
  return Response.json({ source: "raw events (Bruin tables not built yet)", objections, claims, sessions });
}
