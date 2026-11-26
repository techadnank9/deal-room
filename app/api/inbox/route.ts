import { currentSession, workspaceDomain } from "@/lib/workspace";
import { enqueue, getInbound, listInbound, listMailboxes, markHandled } from "@/lib/agent/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const s = await currentSession();
  if (!s) return Response.json({ error: "signed out" }, { status: 401 });
  return Response.json({ replies: await listInbound(s.workspace.id), domain: workspaceDomain(s.workspace) });
}

/** Send your (edited) answer to a reply from the same mailbox, in the same thread; or mark it done. */
export async function POST(req: Request) {
  const s = await currentSession();
  if (!s) return Response.json({ error: "signed out" }, { status: 401 });
  const b = (await req.json()) as { id: string; action: "send" | "done"; body?: string };
  const r = await getInbound(s.workspace.id, b.id);
  if (!r) return Response.json({ error: "not found" }, { status: 404 });
  if (b.action === "send") {
    const box = (await listMailboxes(s.workspace.id)).find((x) => x.id === r.mailbox_id) ?? (await listMailboxes(s.workspace.id))[0];
    if (!box || !r.from_email) return Response.json({ error: "No mailbox connected." }, { status: 400 });
    await enqueue({
      workspaceId: s.workspace.id,
      leadId: r.lead_id ?? "",
      touchId: `reply-${r.id}`,
      mailboxId: box.id,
      to: r.from_email,
      subject: r.subject?.startsWith("Re:") ? r.subject : `Re: ${r.subject ?? ""}`,
      body: b.body ?? r.draft ?? "",
      inReplyTo: r.message_id ?? undefined,
      // Replies to people who wrote back go out right away, even outside the cold-email window.
      at: new Date(Date.now() + 30e3),
    });
  }
  await markHandled(s.workspace.id, r.id);
  return Response.json({ ok: true });
}
