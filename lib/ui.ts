import type { ExecId } from "./types";

export const EXEC_COLOR: Record<ExecId, string> = {
  cfo: "#f59e0b",
  tech: "#38bdf8",
  procurement: "#a78bfa",
};
export const ACTOR_COLOR: Record<string, string> = {
  ...EXEC_COLOR,
  user: "#34d399",
  analyst: "#f472b6",
  director: "#a1a1aa",
};
export const EXEC_LABEL: Record<ExecId, string> = { cfo: "CFO", tech: "Tech lead", procurement: "Procurement" };

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, body === undefined ? { cache: "no-store" } : {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json as T;
}
