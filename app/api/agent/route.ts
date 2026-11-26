import { currentSession, updateWorkspace } from "@/lib/workspace";
import { agentStatus, runNow } from "@/lib/agent/runner";
import { listOutbox } from "@/lib/agent/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const s = await currentSession();
  if (!s) return Response.json({ error: "signed out" }, { status: 401 });
  const [status, outbox] = await Promise.all([agentStatus(s.workspace), listOutbox(s.workspace.id, 50)]);
  return Response.json({ status, outbox });
}

/** action: launch | pause | run_now */
export async function POST(req: Request) {
  const s = await currentSession();
  if (!s) return Response.json({ error: "signed out" }, { status: 401 });
  const { action } = (await req.json()) as { action: "launch" | "pause" | "run_now" };
  if (action === "launch") return Response.json({ workspace: await updateWorkspace(s.workspace.id, { settings: { active: true } }) });
  if (action === "pause") return Response.json({ workspace: await updateWorkspace(s.workspace.id, { settings: { active: false } }) });
  if (action === "run_now") return Response.json({ found: await runNow(s.workspace) });
  return Response.json({ error: "unknown action" }, { status: 400 });
}
