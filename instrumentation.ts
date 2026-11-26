// Starts the always-on sales agent's scheduler once per server process (Node runtime only).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startAgent } = await import("./lib/agent/runner");
  startAgent();
}
