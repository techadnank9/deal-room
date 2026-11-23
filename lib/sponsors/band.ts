// BAND: private channel between agents + claim-check handoff to the analyst.
// Mock keeps messages in process memory; session state also stores whispers.

export function bandEnabled() {
  return Boolean(process.env.BAND_API_KEY);
}

type Msg = { from: string; to: string; text: string; kind: "whisper" | "claim_check" | "claim_result"; ts: number };

const g = globalThis as unknown as { __bandRooms?: Map<string, Msg[]> };
const rooms: Map<string, Msg[]> = (g.__bandRooms ??= new Map());

export async function openRoom(sessionId: string, agents: string[]): Promise<{ roomId: string; provider: string }> {
  void agents;
  const roomId = `mock-${sessionId}`;
  rooms.set(roomId, []);
  return { roomId, provider: "mock" };
}

export async function sendMessage(roomId: string, msg: Omit<Msg, "ts">) {
  const list = rooms.get(roomId) ?? [];
  list.push({ ...msg, ts: Date.now() });
  rooms.set(roomId, list);
}

export async function inbox(roomId: string, agent: string): Promise<Msg[]> {
  return (rooms.get(roomId) ?? []).filter((m) => m.to === agent);
}
