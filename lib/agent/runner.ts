// The always-on agent. A one-minute tick decides, per workspace, what is due:
//   find   3x a day in business hours, one signal per run, until the daily lead target is met
//   write  drafts for people who match a persona and have a usable email (autopilot approves them)
//   plan   approved emails get send times inside the sending window; follow-ups wait for their day
//   send   due emails go out from the workspace's mailbox, under its warm-up cap, never to suppressed people
//   read   new mail is fetched every few minutes; replies stop the sequence and get a drafted answer
// Same shape as the market leaders (scheduled batches with daily and weekly limits), not a literal 24/7 loop.
import { kvGet, kvSet } from "../db";
import { arr, enm, llmJSON, obj, str } from "../llm";
import { loadTeam, saveTeam, teamTurn, withCompany, resolveCompanyUrl, type Lead } from "../agents/team";
import { decideTouch, draftSequence, enrichLead, markReplied, markTouchSent, onLeadsFound } from "../gtm/engine";
import { buildMessage, cleanReply, effectiveDailyCap, fetchNewMessages, isAutoReply, isBounce, makeUnsubToken, matchThread, normalizeMessageId, sendMail } from "../mail";
import { hiringSignal, newsSignals, recentFormD, type SignalHit } from "../signals";
import { bumpUsage, getWorkspace, listActiveWorkspaces, PLANS, usageThisMonth, usageToday, workspaceDomain, type Workspace } from "../workspace";
import { clearsPrecision, passesKeywords, targetingRules } from "../gtm/targeting";
import { allMailboxes, cancelLeadOutbox, dueOutbox, enqueue, isSuppressed, listMailboxes, markOut, saveInbound, sentMessages, sentTodayFrom, setMailboxCursor, suppress, type StoredMailbox } from "./store";

export const APP_URL = process.env.APP_URL || "https://deelroomlive.onrender.com";

type AgentState = { day: string; runs: number; lastSourceAt: number; rotation: number; lastDraftAt: number; lastPlanAt: number; lastInboxAt: Record<string, number>; log: { at: string; text: string }[] };
const stateKey = (id: string) => `agent:${id}`;
async function getState(id: string): Promise<AgentState> {
  const s = (await kvGet<AgentState>(stateKey(id))) ?? { day: "", runs: 0, lastSourceAt: 0, rotation: 0, lastDraftAt: 0, lastPlanAt: 0, lastInboxAt: {}, log: [] };
  const today = new Date().toISOString().slice(0, 10);
  if (s.day !== today) Object.assign(s, { day: today, runs: 0 });
  s.lastInboxAt ??= {};
  s.log ??= [];
  return s;
}
async function setState(id: string, s: AgentState) {
  s.log = s.log.slice(0, 50);
  await kvSet(stateKey(id), s);
}
function note(s: AgentState, text: string) {
  s.log.unshift({ at: new Date().toISOString(), text });
}

/* ---------- time windows ---------- */

export function localClock(tz: string, d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false, weekday: "short" }).formatToParts(d);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.find((p) => p.type === "weekday")?.value ?? "Mon");
  return { hour, day: wd };
}
/** Sending window: launch hour + 7 hours on the workspace's active days. */
export function inWindow(ws: Workspace, d = new Date()) {
  const { hour, day } = localClock(ws.settings.timezone, d);
  return ws.settings.days.includes(day) && hour >= ws.settings.launchHour && hour < ws.settings.launchHour + 7;
}
/** Next moment the window is open, scanning forward in 30-minute steps (max 8 days). */
export function nextWindowStart(ws: Workspace, from = new Date()) {
  for (let i = 0; i < 8 * 48; i++) {
    const t = new Date(from.getTime() + i * 30 * 60e3);
    if (inWindow(ws, t)) return t;
  }
  return from;
}
/** A human-looking send time: inside the window, a few to ~40 minutes from now, randomized. */
function sendSlot(ws: Workspace, notBefore = new Date()) {
  const start = inWindow(ws, notBefore) ? notBefore : nextWindowStart(ws, notBefore);
  return new Date(start.getTime() + (3 + Math.random() * 37) * 60e3);
}

/* ---------- find: one signal per run ---------- */

const SOURCES = ["web", "launches", "hiring", "funding", "news"] as const;
type Source = (typeof SOURCES)[number];

function enabledSources(ws: Workspace): Source[] {
  const s = ws.settings.signals;
  const on: Source[] = [];
  if (s.launches) on.push("launches");
  if (s.web || s.competitors) on.push("web");
  if (s.hiring) on.push("hiring");
  if (s.funding) on.push("funding", "news");
  return on.length ? on : ["web"];
}

/** Turn raw signal hits (funding filings, news) into qualified leads: ICP fit check, competitor filter, domain lookup. */
async function leadsFromHits(hits: SignalHit[], label: string): Promise<Lead[]> {
  const t = await loadTeam();
  if (!hits.length) return [];
  const have = new Set(t.leads.map((l) => l.company.toLowerCase()));
  const { data } = await llmJSON<{ picks: { index: number; company: string; domain: string; why: string }[] }>({
    label: "agent-qualify-hits",
    maxTokens: 800,
    system: `You qualify buying signals for a B2B seller. Pick the hits whose company plausibly fits the ideal customer and would buy now. Skip competitors (same category as the seller), investment funds, real-estate vehicles, and anything unclear. index = the number of the hit. company = the company's real name only (not the headline). domain = its website domain if you can tell from the hit, else "". why = one specific sentence tying the signal to the buyer's need. Skip very large, famous companies (thousands of employees) unless the ideal customer explicitly includes them.${targetingRules(t)}`,
    user: `Seller sells: ${t.offering}\nIdeal customer: ${t.icp ?? t.icpSpec?.summary ?? ""}\nCompetitors: ${(t.competitors ?? []).map((c) => c.name).join(", ")}\n\nHits:\n${hits.map((h, i) => `${i}. ${h.company}: ${h.text} (${h.sourceUrl})`).join("\n")}`,
    schema: obj({ picks: arr(obj({ index: { type: "integer" }, company: str(), domain: str(), why: str() })) }),
    mock: () => ({ picks: [] }),
  });
  const out: Lead[] = [];
  for (const p of data.picks.slice(0, 5)) {
    const h = hits[p.index];
    if (!h) continue;
    const name = (p.company || h.company).trim();
    if (!name || have.has(name.toLowerCase())) continue;
    if (!passesKeywords(`${name} ${h.text} ${p.why}`, t).ok) continue;
    const url = h.domain || p.domain || (await resolveCompanyUrl(name).catch(() => ""));
    if (!url) continue;
    const domain = url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
    out.push({
      id: Math.random().toString(36).slice(2, 10),
      company: name,
      domain,
      why: p.why,
      sourceUrl: h.sourceUrl,
      status: "new",
      foundBy: `Maya (${label})`,
      at: new Date().toISOString(),
      stage: "matched",
      signals: [{ kind: h.kind === "funding" ? "funding" : h.kind === "launch" ? "launch" : h.kind === "hiring" ? "hiring" : "other", text: h.text, sourceUrl: h.sourceUrl }],
    });
  }
  if (out.length) {
    const fresh = await loadTeam();
    fresh.leads.unshift(...out);
    await saveTeam(fresh);
  }
  return out;
}

async function runSource(ws: Workspace, s: AgentState): Promise<number> {
  const sources = enabledSources(ws);
  const src = sources[s.rotation % sources.length];
  s.rotation++;
  const t = await loadTeam();
  const rep = (t.rep ?? ws.ownerEmail.split("@")[0]).split(" ")[0];
  const roleWords = [...new Set((t.personas ?? []).filter((p) => p.enabled).flatMap((p) => p.departments.concat(p.titles.map((x) => x.split(/\s+/).pop() ?? ""))))]
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 2)
    .slice(0, 8);
  let found: Lead[] = [];
  if (src === "web" || src === "hiring") {
    const angle = src === "hiring" ? "companies hiring for the role that owns the problem we solve (recent job posts)" : "companies showing a buying signal right now (funding, launch, expansion, leadership change)";
    const r = await teamTurn(`Maya, find more buyers: ${angle}.`, rep, undefined, true);
    found = r.found ?? [];
    if (src === "hiring" && found.length) {
      // Confirm with the company's own job board: real open roles, counted.
      const after = await loadTeam();
      for (const l of found) {
        const hit = await hiringSignal(l.domain, l.company, roleWords.length ? roleWords : ["engineer"]).catch(() => null);
        const lead = after.leads.find((x) => x.id === l.id);
        if (hit && lead) lead.signals = [{ kind: "hiring", text: hit.text, sourceUrl: hit.sourceUrl }, ...(lead.signals ?? [])];
      }
      await saveTeam(after);
    }
  } else if (src === "launches") {
    // New products just launched: Product Hunt, Show HN, Launch YC, and sites built with AI app builders.
    // Show HN posts from the last 3 days (free Hacker News API): each links the product's own site.
    const since = Math.floor(Date.now() / 1000) - 3 * 86400;
    const r = (await fetch(`https://hn.algolia.com/api/v1/search_by_date?tags=show_hn&hitsPerPage=60&numericFilters=created_at_i>${since},points>1`, { signal: AbortSignal.timeout(15000) })
      .then((x) => x.json())
      .catch(() => ({ hits: [] }))) as { hits: { title: string; url?: string; objectID: string; points?: number }[] };
    const skip = /github\.com|github\.io|gitlab\.com|youtube\.com|twitter\.com|x\.com|medium\.com|substack\.com|news\.ycombinator\.com|apps\.apple\.com|play\.google\.com|huggingface\.co|arxiv\.org/i;
    const hits: SignalHit[] = r.hits
      .filter((h) => h.url && !skip.test(h.url))
      .slice(0, 30)
      .map((h) => {
        const title = h.title.replace(/^Show HN:\s*/i, "");
        const host = new URL(h.url!).hostname.replace(/^www\./, "");
        return { company: title.split(/\s[–—-]\s|:/)[0].trim().slice(0, 60), domain: host, kind: "launch" as const, text: `Launched on Show HN: "${title.slice(0, 140)}"`, sourceUrl: `https://news.ycombinator.com/item?id=${h.objectID}`, at: new Date().toISOString(), strength: 0.75 };
      });
    found = await leadsFromHits(hits, "Show HN launches");
    if (found.length) void onLeadsFound(found);
  } else if (src === "funding") {
    const hits = await recentFormD({ days: 4, limit: 25, industries: ["Other Technology", "Computers", "Telecommunications", "Business Services", "Other Health Care", "Biotechnology", "Manufacturing"] }).catch(() => []);
    found = await leadsFromHits(hits, "SEC Form D");
    if (found.length) void onLeadsFound(found);
  } else {
    const q = `${t.icpSpec?.industries?.[0]?.name ?? t.icp ?? "B2B software"} raises funding OR launches`;
    const hits = await newsSignals(q, { limit: 20 }).catch(() => []);
    found = await leadsFromHits(hits, "news");
    if (found.length) void onLeadsFound(found);
  }
  if (found.length) await bumpUsage(ws.id, "leads", found.length);
  await bumpUsage(ws.id, "runs");
  note(s, `Searched ${src === "launches" ? "new product launches (Product Hunt, Show HN, Launch YC, AI-built apps)" : src === "web" ? "the web for buying signals" : src === "hiring" ? "job boards for hiring surges" : src === "funding" ? "SEC Form D filings for new funding" : "funding and launch news"}: ${found.length} new lead${found.length === 1 ? "" : "s"}${found.length ? ` (${found.map((l) => l.company).join(", ")})` : ""}`);
  return found.length;
}

/* ---------- write ---------- */

async function runDrafts(ws: Workspace, s: AgentState) {
  // Catch up on leads that were found but not enriched yet (searches only enrich their first few).
  const tb = await loadTeam();
  const backlog = tb.prefs?.autoEnrich === false ? [] : tb.leads.filter((l) => !l.enriched && l.stage !== "lost").slice(0, 3);
  for (const l of backlog) await enrichLead(l.id).catch((e) => console.error("[agent] enrich", e));
  if (backlog.length) note(s, `Researched ${backlog.map((l) => l.company).join(", ")}: people, emails and fit`);
  const t = await loadTeam();
  const hasPersona = t.prefs?.personaOnly !== false && (t.personas ?? []).some((p) => p.enabled);
  const ready = t.leads
    .filter((l) => l.enriched === "done" && !l.sequence?.length && !["lost", "won"].includes(l.stage ?? ""))
    .filter((l) => (l.contacts ?? []).some((c) => c.email && ["verified", "risky", "mx-valid", "guessed"].includes(c.emailStatus) && (!hasPersona || c.persona)))
    .filter((l) => l.stage !== "lost" && clearsPrecision(l.score, t))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 3);
  for (const l of ready) {
    const after = await draftSequence(l.id, { enrich: false });
    if (ws.settings.autopilot) {
      const lead = after.leads.find((x) => x.id === l.id);
      for (const m of lead?.sequence ?? []) if (m.channel === "email" && m.to && m.approval === "pending") await decideTouch(l.id, m.id, "approve");
    }
  }
  if (ws.settings.autopilot) {
    // Autopilot approves every waiting email, including ones written right after enrichment.
    const now = await loadTeam();
    for (const l of now.leads) for (const m of l.sequence ?? []) if (m.channel === "email" && m.to && m.approval === "pending") await decideTouch(l.id, m.id, "approve");
  }
  if (ready.length) note(s, `Wrote sequences for ${ready.map((l) => l.company).join(", ")}${ws.settings.autopilot ? " (autopilot: approved)" : " (waiting for your approval)"}`);
}

/* ---------- plan sends ---------- */

async function planSends(ws: Workspace, s: AgentState) {
  const boxes = (await listMailboxes(ws.id)).filter((b) => b.status !== "error");
  if (!boxes.length) return;
  const t = await loadTeam();
  let n = 0;
  for (const l of t.leads) {
    if (["replied", "meeting", "won", "lost"].includes(l.stage ?? "")) continue;
    const seq = (l.sequence ?? []).filter((m) => m.channel === "email" && m.approval === "approved" && m.to);
    const first = seq.find((m) => m.step === 1);
    for (const m of seq) {
      if (m.sentAt) continue;
      if (await isSuppressed(ws.id, m.to!)) continue;
      const box = boxes[(l.id.charCodeAt(0) + m.step) % boxes.length];
      if (m.step === 1) {
        await enqueue({ workspaceId: ws.id, leadId: l.id, touchId: m.id, mailboxId: box.id, to: m.to!, subject: m.subject ?? "", body: m.body, at: sendSlot(ws) });
        n++;
      } else if (first?.sentAt && first.messageId) {
        const due = new Date(new Date(first.sentAt).getTime() + m.dayOffset * 864e5);
        if (due.getTime() > Date.now() + 864e5) continue; // too early to queue
        await enqueue({ workspaceId: ws.id, leadId: l.id, touchId: m.id, mailboxId: box.id, to: m.to!, subject: first.subject?.startsWith("Re:") ? first.subject : `Re: ${first.subject ?? ""}`, body: m.body, inReplyTo: first.messageId, at: sendSlot(ws, due) });
        n++;
      }
    }
  }
  if (n) note(s, `Scheduled ${n} email${n === 1 ? "" : "s"} inside your sending window`);
}

/* ---------- send ---------- */

async function runSender() {
  const due = await dueOutbox(15);
  if (!due.length) return;
  const boxes = new Map((await allMailboxes()).map((b) => [b.id, b]));
  for (const row of due) {
    const ws = await getWorkspace(row.workspace_id);
    const box = row.mailbox_id ? boxes.get(row.mailbox_id) : undefined;
    if (!ws || !box) {
      await markOut(row.id, { status: "failed", error: "mailbox missing" });
      continue;
    }
    const isReply = row.touch_id?.startsWith("reply-") ?? false; // your answers to people who wrote back go out now
    if (!ws.settings.active && !isReply) continue; // paused agents keep their queue
    if (await isSuppressed(ws.id, row.to_email)) {
      await markOut(row.id, { status: "cancelled", error: "do not contact" });
      continue;
    }
    if (!inWindow(ws) && !isReply) {
      await (await import("../db")).db().then((d) => d.exec(`update outbox set scheduled_at = ? where id = ?`, [sendSlot(ws, nextWindowStart(ws)).toISOString(), row.id]));
      continue;
    }
    if ((await sentTodayFrom(box.id)) >= effectiveDailyCap(box)) {
      await (await import("../db")).db().then((d) => d.exec(`update outbox set scheduled_at = ? where id = ?`, [sendSlot(ws, new Date(Date.now() + 18 * 3600e3)).toISOString(), row.id]));
      continue;
    }
    try {
      const unsub = `${APP_URL}/api/unsubscribe?token=${makeUnsubToken(ws.id, row.to_email)}`;
      const msg = buildMessage({
        from: { name: box.fromName, email: box.email },
        to: row.to_email,
        subject: row.subject ?? "",
        text: row.body,
        inReplyTo: row.in_reply_to ?? undefined,
        references: row.in_reply_to ?? undefined,
        unsubscribeUrl: unsub,
      });
      const r = await sendMail(box, msg);
      await markOut(row.id, { status: "sent", messageId: r.messageId });
      await bumpUsage(ws.id, "sends");
      if (row.lead_id && row.touch_id) await withCompany(workspaceDomain(ws), () => markTouchSent(row.lead_id!, row.touch_id!, r.messageId));
    } catch (err) {
      await markOut(row.id, { status: "failed", error: err instanceof Error ? err.message.slice(0, 300) : "send failed" });
    }
  }
}

/* ---------- read replies ---------- */

async function classify(text: string, from: string, t: Awaited<ReturnType<typeof loadTeam>>, rep: string) {
  const { data } = await llmJSON<{ category: "interested" | "not_now" | "not_interested" | "unsubscribe" | "referral" | "other"; draft: string }>({
    label: "agent-reply",
    maxTokens: 500,
    system: `Classify a reply to a cold email and draft the answer. category: interested (wants to talk / asks a question / shares a time), not_now (timing), not_interested, unsubscribe (asks to stop / remove), referral (points to someone else), other. draft: a short, human reply from ${rep} at ${t.company ?? "our company"} (under 80 words) that moves to a call when interested, thanks and asks to reconnect later when not_now, thanks and follows the referral, and is "" for unsubscribe or not_interested. No placeholders.`,
    user: `We sell: ${t.offering}\nReply from ${from}:\n${text.slice(0, 2000)}`,
    schema: obj({ category: enm(["interested", "not_now", "not_interested", "unsubscribe", "referral", "other"]), draft: str() }),
    mock: () => ({ category: /unsubscribe|remove me|stop/i.test(text) ? "unsubscribe" : "other", draft: "" }),
  });
  return data;
}

async function runInbox(ws: Workspace, box: StoredMailbox) {
  let res;
  try {
    res = await fetchNewMessages(box, box.lastUid || undefined);
  } catch (err) {
    await setMailboxCursor(box.id, box.lastUid, "error");
    console.error("[agent] inbox", box.email, err instanceof Error ? err.message : err);
    return;
  }
  const sent = await sentMessages(ws.id);
  const ids = new Set(sent.map((x) => x.message_id && normalizeMessageId(x.message_id)).filter(Boolean) as string[]);
  const t = await loadTeam();
  const rep = (t.rep ?? box.fromName).split(" ")[0];
  for (const m of res.messages) {
    if (m.from === box.email) continue;
    const hit = matchThread(m, ids);
    const out = hit ? sent.find((x) => x.message_id && normalizeMessageId(x.message_id) === hit) : sent.find((x) => x.to_email === m.from);
    if (!out) continue; // not a reply to our outreach: leave the user's normal mail alone
    const bounce = isBounce(m);
    const auto = !bounce && isAutoReply(m);
    const clean = cleanReply(m.text);
    let category = bounce ? "bounce" : auto ? "out_of_office" : "other";
    let draft = "";
    if (!bounce && !auto) ({ category, draft } = await classify(clean, m.from, t, rep));
    await saveInbound({ workspace_id: ws.id, mailbox_id: box.id, message_id: m.messageId, in_reply_to: m.inReplyTo ?? null, from_email: m.from, subject: m.subject, text: m.text.slice(0, 20000), clean, category, lead_id: out.lead_id, draft: draft || null, received_at: m.date });
    if (category === "unsubscribe" || category === "bounce") await suppress(ws.id, bounce ? out.to_email : m.from, category);
    if (out.lead_id && category !== "out_of_office") {
      await cancelLeadOutbox(ws.id, out.lead_id);
      await markReplied(out.lead_id, category === "bounce" ? "not_interested" : category, clean || m.subject);
    }
  }
  await setMailboxCursor(box.id, res.lastUid, "ok");
}

/* ---------- tick ---------- */

const g = globalThis as unknown as { __agentTick?: NodeJS.Timeout; __agentBusy?: boolean };

export async function tickOnce() {
  if (g.__agentBusy) return;
  g.__agentBusy = true;
  try {
    await runSender().catch((e) => console.error("[agent] sender", e));
    for (const ws of await listActiveWorkspaces()) {
      const domain = workspaceDomain(ws);
      if (!domain) continue;
      await withCompany(domain, async () => {
        const s = await getState(ws.id);
        const now = Date.now();
        try {
          if (inWindow(ws)) {
            const today = await usageToday(ws.id);
            const month = await usageThisMonth(ws.id);
            const plan = PLANS[ws.plan];
            const underPlan = month.enrich < plan.contactsPerMonth;
            if (s.runs < 3 && now - s.lastSourceAt > 2.5 * 3600e3 && today.leads < ws.settings.dailyLeadTarget) {
              s.lastSourceAt = now;
              s.runs++;
              if (underPlan) await runSource(ws, s);
              else note(s, `Paused searching: this month's ${plan.contactsPerMonth} contacts on the ${plan.name} plan are used up`);
            }
            if (now - s.lastDraftAt > 15 * 60e3) {
              s.lastDraftAt = now;
              await runDrafts(ws, s);
            }
          }
          if (now - s.lastPlanAt > 10 * 60e3) {
            s.lastPlanAt = now;
            await planSends(ws, s);
          }
          for (const box of await listMailboxes(ws.id)) {
            if (now - (s.lastInboxAt[box.id] ?? 0) < 4 * 60e3) continue;
            s.lastInboxAt[box.id] = now;
            await runInbox(ws, box);
          }
        } catch (err) {
          console.error("[agent] workspace", ws.id, err);
          note(s, `Something failed: ${err instanceof Error ? err.message.slice(0, 120) : "error"}; retrying next run`);
        }
        await setState(ws.id, s);
      });
    }
  } finally {
    g.__agentBusy = false;
  }
}

/** Start the one-minute tick (once per server process). */
export function startAgent() {
  // One scheduler per database: production runs it; a local dev server only when AGENT_RUNNER=1
  // (local and live share the same database, and two schedulers could send the same email twice).
  const on = process.env.AGENT_RUNNER === "1" || (process.env.NODE_ENV === "production" && process.env.AGENT_RUNNER !== "0");
  if (g.__agentTick || !on) return;
  g.__agentTick = setInterval(() => void tickOnce().catch((e) => console.error("[agent] tick", e)), 60e3);
  setTimeout(() => void tickOnce().catch(() => {}), 15e3);
  console.log("[agent] scheduler started");
}

/** Run one search now (the "Run now" button), regardless of the time window. */
export async function runNow(ws: Workspace) {
  return withCompany(workspaceDomain(ws), async () => {
    const s = await getState(ws.id);
    const n = await runSource(ws, s);
    s.lastSourceAt = Date.now();
    s.runs++;
    await runDrafts(ws, s);
    await setState(ws.id, s);
    return n;
  });
}

export async function agentStatus(ws: Workspace) {
  const s = await getState(ws.id);
  const next = inWindow(ws) ? null : nextWindowStart(ws).toISOString();
  return { runsToday: s.runs, lastSourceAt: s.lastSourceAt || null, inWindow: inWindow(ws), nextWindow: next, log: s.log.slice(0, 20) };
}
