// Runs the Bruin pipeline in ./bruin after each verdict, and reads its output tables.
// Wired fully in milestone 5; until then it reports that it did not run.

export type BruinResult = { ran: boolean; ok: boolean; output: string };

export async function runBruin(): Promise<BruinResult> {
  return { ran: false, ok: false, output: "Bruin pipeline not wired yet (milestone 5)." };
}

export async function readScorecard(sessionId: string): Promise<null | Record<string, unknown>> {
  void sessionId;
  return null;
}

export async function readTrends(): Promise<null | Record<string, unknown>> {
  return null;
}
