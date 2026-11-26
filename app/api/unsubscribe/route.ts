import { readUnsubToken } from "@/lib/mail";
import { suppress } from "@/lib/agent/store";

export const runtime = "nodejs";

/** One-click unsubscribe (RFC 8058): mail clients POST here from the List-Unsubscribe header. */
export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const t = readUnsubToken(token);
  if (!t) return new Response("invalid", { status: 400 });
  await suppress(t.workspaceId, t.email, "unsubscribe");
  return new Response("ok");
}

/** A person clicking the link in the email footer: record it, then show the confirmation page. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const token = u.searchParams.get("token") ?? "";
  return Response.redirect(new URL(`/u/${encodeURIComponent(token)}`, u.origin), 303);
}
