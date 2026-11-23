// BAND (https://docs.band.ai): private channel between agents, and claim-check handoff to the analyst.
//
// Real mode (BAND_API_KEY set): every session opens a BAND chat room. Each executive and the analyst is a
// BAND agent (ids + keys in BAND_AGENTS). Whispers are sent from the whispering exec's key and @mention only
// the recipient, so per the docs only that agent is woken. Claims go director -> @analyst, results analyst -> @director.
// BAND delivers to agents over WebSocket, which a serverless route cannot hold open, so the app also keeps
// an in-process mirror that the turn loop reads; BAND is the transport of record.
//
//   BAND_API_KEY   = key of the "director" agent that owns the rooms
//   BAND_AGENTS    = {"director":{"id":"..."},"cfo":{"id":"...","key":"..."},"tech":{...},"procurement":{...},"analyst":{...}}

const BASES = ["https://app.band.ai/api/v1", "https://api.band.ai/api/v1"];

type AgentCred = { id: string; key?: string; name?: string };
type Msg = { from: string; to: string; text: string; kind: "whisper" | "claim_check" | "claim_result"; ts: number };

const g = globalThis as unknown as { __bandRooms?: Map<string, Msg[]>; __bandBase?: string };
const rooms: Map<string, Msg[]> = (g.__bandRooms ??= new Map());

export function bandEnabled() {
  return Boolean(process.env.BAND_API_KEY);
}

function agents(): Record<string, AgentCred> {
  try {
    return JSON.parse(process.env.BAND_AGENTS || "{}");
  } catch {
    return {};
  }
}

async function bandPost(path: string, key: string, body: unknown) {
  const bases = g.__bandBase ? [g.__bandBase] : BASES;
  let lastErr: unknown;
  for (const base of bases) {
    try {
      const res = await fetch(`${base}${path}`, {
        method: "POST",
        headers: { "X-API-Key": key, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });
      if (res.status === 404 && !g.__bandBase) {
        lastErr = new Error(`404 at ${base}`);
        continue;
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`band ${path} ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
      g.__bandBase = base;
      return json as { data?: Record<string, unknown> };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

export async function openRoom(sessionId: string, agentIds: string[]): Promise<{ roomId: string; provider: string }> {
  if (bandEnabled()) {
    try {
      const director = process.env.BAND_API_KEY!;
      const r = await bandPost("/agent/chats", director, { chat: {} });
      const roomId = String(r.data?.id ?? (r as Record<string, unknown>).id ?? "");
      if (!roomId) throw new Error("no room id in response");
      const creds = agents();
      await Promise.all(
        agentIds
          .map((a) => creds[a]?.id)
          .filter(Boolean)
          .map((pid) => bandPost(`/agent/chats/${roomId}/participants`, director, { participant: { participant_id: pid } }).catch((e) => console.error("[band] add participant", e.message))),
      );
      rooms.set(roomId, []);
      return { roomId, provider: "band" };
    } catch (err) {
      console.error(`[band] openRoom failed for ${sessionId}, using mock:`, err instanceof Error ? err.message : err);
    }
  }
  const roomId = `mock-${sessionId}`;
  rooms.set(roomId, []);
  return { roomId, provider: "mock" };
}

export async function sendMessage(roomId: string, msg: Omit<Msg, "ts">) {
  const list = rooms.get(roomId) ?? [];
  list.push({ ...msg, ts: Date.now() });
  rooms.set(roomId, list);
  if (!bandEnabled() || roomId.startsWith("mock-")) return;
  const creds = agents();
  const to = msg.to === "all" ? "director" : msg.to;
  const target = creds[to];
  if (!target?.id) return;
  const fromKey = creds[msg.from]?.key || process.env.BAND_API_KEY!;
  if (creds[msg.from]?.id === target.id) return; // an agent cannot mention itself
  const name = target.name || to;
  try {
    await bandPost(`/agent/chats/${roomId}/messages`, fromKey, {
      message: {
        content: `@${name} [${msg.kind}] ${msg.text}`,
        mentions: [{ id: target.id, name, handle: name.toLowerCase().replace(/\s+/g, "") }],
      },
    });
  } catch (err) {
    console.error("[band] send failed:", err instanceof Error ? err.message : err);
  }
}

export async function inbox(roomId: string, agent: string): Promise<Msg[]> {
  return (rooms.get(roomId) ?? []).filter((m) => m.to === agent);
}
