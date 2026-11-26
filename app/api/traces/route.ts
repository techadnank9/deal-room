import { kvGet } from "@/lib/db";
import { listTraces } from "@/lib/trace";
import { currentSession, workspaceDomain } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Recent traces for the signed-in workspace (?run=<id> for one run, oldest first), plus the scheduler heartbeat. */
export async function GET(req: Request) {
  const s = await currentSession();
  if (!s) return Response.json({ error: "signed out" }, { status: 401 });
  const run = new URL(req.url).searchParams.get("run") ?? undefined;
  const [traces, heartbeat] = await Promise.all([listTraces(workspaceDomain(s.workspace) || "none", { runId: run, limit: 300 }), kvGet<{ at: string }>("agent:heartbeat")]);
  return Response.json({ traces, heartbeat });
}
