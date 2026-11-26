import { currentSession, PLANS } from "@/lib/workspace";
import { addMailbox, bounceStats, listMailboxes, mailboxPause, MAILBOX_PRESETS, publicBox, removeMailbox, resumeMailbox } from "@/lib/agent/store";
import { checkDomain } from "@/lib/mail/dnscheck";
import { verifyMailbox } from "@/lib/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const s = await currentSession();
  if (!s) return Response.json({ error: "signed out" }, { status: 401 });
  const boxes = await listMailboxes(s.workspace.id);
  const health = await Promise.all(
    boxes.map(async (b) => ({ id: b.id, dns: await checkDomain(b.email).catch(() => null), pause: await mailboxPause(b.id), bounces: await bounceStats(b.id, 14) })),
  );
  return Response.json({ mailboxes: boxes.map((b) => ({ ...publicBox(b), ...health.find((h) => h.id === b.id) })), presets: Object.entries(MAILBOX_PRESETS).map(([id, p]) => ({ id, label: p.label, help: p.help })) });
}

/** Connect a mailbox: test SMTP and IMAP with the app password first; only save it if both work. */
export async function POST(req: Request) {
  const s = await currentSession();
  if (!s) return Response.json({ error: "signed out" }, { status: 401 });
  const b = (await req.json()) as { email?: string; fromName?: string; preset?: string; user?: string; password?: string; dailyCap?: number };
  const existing = await listMailboxes(s.workspace.id);
  if (existing.length >= PLANS[s.workspace.plan].mailboxes) return Response.json({ error: `Your plan includes ${PLANS[s.workspace.plan].mailboxes} mailbox. Remove one or upgrade.` }, { status: 400 });
  if (!b.email || !b.password || !b.preset) return Response.json({ error: "Email, provider and app password are required." }, { status: 400 });
  const box = await addMailbox(s.workspace.id, { email: b.email, fromName: b.fromName ?? s.name ?? b.email, preset: b.preset, user: b.user, password: b.password, dailyCap: b.dailyCap });
  const check = await verifyMailbox(box);
  if (!check.ok) {
    await removeMailbox(s.workspace.id, box.id);
    return Response.json({ error: "Couldn't connect.", smtp: check.smtp, imap: check.imap }, { status: 400 });
  }
  return Response.json({ mailbox: publicBox(box), check });
}

export async function DELETE(req: Request) {
  const s = await currentSession();
  if (!s) return Response.json({ error: "signed out" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  await removeMailbox(s.workspace.id, id);
  return Response.json({ ok: true });
}

/** Resume a mailbox the bounce brake paused. */
export async function PATCH(req: Request) {
  const s = await currentSession();
  if (!s) return Response.json({ error: "signed out" }, { status: 401 });
  const b = (await req.json()) as { id?: string; action?: string };
  const box = (await listMailboxes(s.workspace.id)).find((x) => x.id === b.id);
  if (!box) return Response.json({ error: "not found" }, { status: 404 });
  if (b.action === "resume") await resumeMailbox(box.id);
  return Response.json({ ok: true });
}
