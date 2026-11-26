import { callTool, ToolError, TOOLS } from "@/lib/mcp/tools";
import { workspaceForKey, type Workspace } from "@/lib/workspace";

// Deal Room's MCP server (Streamable HTTP, stateless): add this URL as a custom connector in Claude or ChatGPT.
// Each POST carries one JSON-RPC message (or a batch) and gets a plain JSON answer; no session, no stream.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, accept, authorization, mcp-protocol-version, mcp-session-id",
};
const INSTRUCTIONS =
  "Deal Room is an AI sales team: Maya finds buyers, Arjun writes outreach, Elena tracks the pipeline. Every tool takes `company`, the seller's own website. Usual order: start_company, find_buyers, draft_outreach, then show the drafts to the user and call review_outreach with their decision. Never approve a message the user has not approved. An approved email is sent from the user's own connected mailbox in their sending window; LinkedIn notes are sent by hand. With a workspace key (the private link from Deal Room → MCP), every tool works on that workspace's company, and the workspace tools also work: search_prospects / add_prospect, list_contacts / add_to_list, mark_fit, refine_email, get_inbox / send_reply, agent_status / control_agent, preview_leads. Never approve, send or switch to autopilot unless the user asked.";

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
type Reply = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string } };

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: CORS });
const fail = (id: Rpc["id"], code: number, message: string): Reply => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

async function handle(m: Rpc, ws: Workspace | null): Promise<Reply | null> {
  if (!m || m.jsonrpc !== "2.0" || typeof m.method !== "string") return fail(m?.id, -32600, "Invalid request");
  // Notifications and client responses carry no id: nothing to answer.
  if (m.id === undefined || m.id === null) return null;
  const ok = (result: unknown): Reply => ({ jsonrpc: "2.0", id: m.id!, result });
  switch (m.method) {
    case "initialize": {
      const asked = String(m.params?.protocolVersion ?? "");
      return ok({
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "deal-room", title: "Deal Room", version: "0.1.0" },
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations: { title, ...annotations } })) });
    case "tools/call": {
      const name = String(m.params?.name ?? "");
      if (!TOOLS.some((t) => t.name === name)) return fail(m.id, -32602, `Unknown tool: ${name}`);
      try {
        const out = await callTool(name, (m.params?.arguments ?? {}) as Record<string, string | undefined>, ws);
        return ok({ content: [{ type: "text", text: JSON.stringify(out, null, 1) }], isError: false });
      } catch (err) {
        // Tool failures go back as a tool result so the model can read them and correct itself.
        if (!(err instanceof ToolError)) console.error(`[mcp] ${name} failed:`, err);
        const text = err instanceof ToolError ? err.message : `Deal Room could not finish ${name}: ${err instanceof Error ? err.message : "unknown error"}`;
        return ok({ content: [{ type: "text", text }], isError: true });
      }
    }
    default:
      return fail(m.id, -32601, `Method not found: ${m.method}`);
  }
}

export async function POST(req: Request) {
  // Key from "Authorization: Bearer dr_…" or the connector URL (?key=dr_…).
  const key = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || new URL(req.url).searchParams.get("key");
  const ws = await workspaceForKey(key);
  if (key && !ws) return json(fail(null, -32001, "This Deal Room key is not valid any more. Make a new one in Deal Room → MCP."), 401);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(fail(null, -32700, "Parse error"), 400);
  }
  if (Array.isArray(body)) {
    if (!body.length) return json(fail(null, -32600, "Invalid request"), 400);
    const replies = (await Promise.all(body.map((m) => handle(m as Rpc, ws)))).filter((r): r is Reply => r !== null);
    return replies.length ? json(replies) : new Response(null, { status: 202, headers: CORS });
  }
  const reply = await handle(body as Rpc, ws);
  return reply ? json(reply) : new Response(null, { status: 202, headers: CORS });
}

// No server-initiated stream and no sessions: the spec's answer for both is 405.
const notAllowed = () => new Response(null, { status: 405, headers: { ...CORS, Allow: "POST, OPTIONS" } });
export const GET = notAllowed;
export const DELETE = notAllowed;
export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });
