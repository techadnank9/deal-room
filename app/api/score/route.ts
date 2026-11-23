import { loadSession, readEvents } from "@/lib/db";
import { lastBruinRun, readScorecard } from "@/lib/bruin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const s = await loadSession(id);
  if (!s) return Response.json({ error: "not found" }, { status: 404 });
  const [events, bruin] = await Promise.all([readEvents(id), readScorecard(id)]);
  return Response.json({ session: s, events, bruin, bruinRun: lastBruinRun() });
}
