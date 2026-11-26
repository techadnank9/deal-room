import { resetPassword } from "@/lib/workspace";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { token, password } = (await req.json().catch(() => ({}))) as { token?: string; password?: string };
  if (!token || !password) return Response.json({ error: "Missing link or password." }, { status: 400 });
  const r = await resetPassword(token, password);
  return "error" in r ? Response.json(r, { status: 400 }) : Response.json({ ok: true });
}
