import { NextResponse } from "next/server";
import { sessionCookie, signUp } from "@/lib/workspace";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { email?: string; password?: string; name?: string; url?: string };
  try {
    const { token, workspace } = await signUp(b.email ?? "", b.password ?? "", b.name ?? "", b.url);
    const res = NextResponse.json({ workspace });
    res.cookies.set(sessionCookie(token));
    return res;
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sign up failed" }, { status: 400 });
  }
}
