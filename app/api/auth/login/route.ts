import { NextResponse } from "next/server";
import { logIn, sessionCookie } from "@/lib/workspace";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  try {
    const { token, workspace } = await logIn(b.email ?? "", b.password ?? "");
    const res = NextResponse.json({ workspace });
    res.cookies.set(sessionCookie(token));
    return res;
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Log in failed" }, { status: 400 });
  }
}
