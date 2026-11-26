import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { logOut, SESSION_COOKIE } from "@/lib/workspace";

export const runtime = "nodejs";

export async function POST() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await logOut(token);
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ name: SESSION_COOKIE, value: "", path: "/", maxAge: 0 });
  return res;
}
