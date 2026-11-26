import { apiKeyInfo, currentSession, revokeApiKey, rotateApiKey } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in workspace's MCP key: GET shows whether one exists (never the key), POST makes a new one, DELETE turns it off. */
export async function GET() {
  const s = await currentSession();
  if (!s) return Response.json({ error: "Log in first." }, { status: 401 });
  return Response.json({ key: await apiKeyInfo(s.workspace.id) });
}

export async function POST() {
  const s = await currentSession();
  if (!s) return Response.json({ error: "Log in first." }, { status: 401 });
  if (!s.workspace.url) return Response.json({ error: "Finish setup (your website) before connecting an assistant." }, { status: 400 });
  return Response.json({ created: await rotateApiKey(s.workspace.id) });
}

export async function DELETE() {
  const s = await currentSession();
  if (!s) return Response.json({ error: "Log in first." }, { status: 401 });
  await revokeApiKey(s.workspace.id);
  return Response.json({ ok: true });
}
