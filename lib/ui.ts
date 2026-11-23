import type { ExecId } from "./types";

export const EXEC_COLOR: Record<ExecId, string> = {
  cfo: "#c2410c",
  tech: "#0f766e",
  procurement: "#7c3aed",
};
export const ACTOR_COLOR: Record<string, string> = {
  ...EXEC_COLOR,
  user: "#16140f",
  analyst: "#db2777",
  director: "#8a847a",
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

export function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
