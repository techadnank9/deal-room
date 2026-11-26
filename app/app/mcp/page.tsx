"use client";
// MCP: use Deal Room from inside Claude, ChatGPT or a coding agent. One private link per workspace.
import { useState } from "react";
import { Btn, Pill, post, usePoll } from "@/components/app/ui";

type KeyInfo = { key: { hint: string; createdAt: string } | null };

const ASSISTANTS = [
  {
    id: "claude",
    name: "Claude",
    group: "Chat assistants",
    steps: ["Open Claude → Settings → Connectors.", "Choose “Add custom connector”.", "Name it Deal Room and paste your link.", "In a chat, turn on Deal Room from the tools menu."],
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    group: "Chat assistants",
    steps: ["Open ChatGPT → Settings → Apps & Connectors → Advanced, and turn on developer mode.", "Choose “Create” and paste your link as the MCP server URL (no authentication).", "In a chat, pick Deal Room from the tools menu."],
  },
  {
    id: "claude-code",
    name: "Claude Code",
    group: "Developer tools",
    cmd: (url: string) => `claude mcp add --transport http dealroom "${url}"`,
    steps: ["Run this in your terminal:"],
  },
  {
    id: "codex",
    name: "Codex",
    group: "Developer tools",
    cmd: (url: string) => `[mcp_servers.dealroom]\nurl = "${url}"`,
    steps: ["Add this to ~/.codex/config.toml:"],
  },
  {
    id: "other",
    name: "Other assistant",
    group: "Developer tools",
    steps: ["Any assistant that supports remote MCP servers (Streamable HTTP) works. Paste your link as the server URL, or send the key as “Authorization: Bearer <key>” to the base URL."],
  },
] as const;

const PROMPTS = ["Who should I email today, and why?", "Show me the emails waiting for my review", "How is my pipeline doing this week?", "Find more companies like my best lead"];

export default function McpPage() {
  const { data, reload } = usePoll<KeyInfo>("/api/mcp-key", 0);
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string>("claude");
  const [copied, setCopied] = useState<string | null>(null);
  const base = typeof window === "undefined" ? "https://deelroomlive.onrender.com/api/mcp" : `${window.location.origin}/api/mcp`;
  const link = fresh ? `${base}?key=${fresh}` : null;

  async function make() {
    if (data?.key && !confirm("Make a new link? The old one stops working in every assistant that uses it.")) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await post<{ created: { key: string } }>("/api/mcp-key", {});
      setFresh(r.created.key);
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not make a link");
    } finally {
      setBusy(false);
    }
  }
  async function revoke() {
    if (!confirm("Turn off the link? Assistants using it lose access right away.")) return;
    setBusy(true);
    try {
      await fetch("/api/mcp-key", { method: "DELETE" });
      setFresh(null);
      await reload();
    } finally {
      setBusy(false);
    }
  }
  async function copy(text: string, what: string) {
    await navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  }

  const shown = link ?? (data?.key ? `${base}?key=dr_…${data.key.hint}` : null);

  return (
    <div className="px-4 py-6 md:px-8">
      <div className="mx-auto max-w-[1000px]">
        <div className="mb-6 grid items-center gap-6 rounded-2xl border border-line bg-white p-6 md:grid-cols-[1.2fr_1fr]">
          <div>
            <Pill tone="accent">New</Pill>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">Your sales agent, inside your AI assistant</h1>
            <p className="mt-2 text-muted">Ask about your leads, review drafted emails, check the pipeline and find new buyers, straight from Claude, ChatGPT or your coding agent.</p>
          </div>
          <div className="rounded-xl border border-line bg-paper/60 p-4 text-sm">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">Try asking</p>
            <ul className="mt-2 space-y-1.5">
              {PROMPTS.map((p) => (
                <li key={p} className="rounded-lg bg-white px-3 py-2">
                  “{p}”
                </li>
              ))}
            </ul>
          </div>
        </div>

        <section className="mb-6 rounded-2xl border border-line bg-white p-6">
          <h2 className="text-lg font-semibold">1. Your private link</h2>
          <p className="mb-4 text-sm text-muted">This link gives an assistant access to your workspace only. Keep it secret like a password. Anyone with it can read your leads and approve emails.</p>
          {err && <p className="mb-3 text-sm text-rose-700">{err}</p>}
          {shown ? (
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-xl border border-line bg-paper/60 px-3 py-2 text-xs">{shown}</code>
              {link ? (
                <button className={Btn.primary} onClick={() => void copy(link, "link")}>
                  {copied === "link" ? "Copied" : "Copy link"}
                </button>
              ) : (
                <button className={Btn.ghost} onClick={() => void make()} disabled={busy}>
                  Show a new link
                </button>
              )}
              <button className="text-sm text-muted hover:text-rose-700" onClick={() => void revoke()} disabled={busy}>
                Turn off
              </button>
            </div>
          ) : (
            <button className={Btn.primary} onClick={() => void make()} disabled={busy || !data}>
              {busy ? "Making…" : "Make my link"}
            </button>
          )}
          {link && <p className="mt-2 text-xs text-muted">Copy it now: for your safety we only show the full link once. You can always make a new one.</p>}
          {!link && data?.key && <p className="mt-2 text-xs text-muted">Made {new Date(data.key.createdAt).toLocaleDateString()}. The full link was shown once; make a new one if you need it again.</p>}
        </section>

        <section className="rounded-2xl border border-line bg-white p-6">
          <h2 className="text-lg font-semibold">2. Add it to your assistant</h2>
          {(["Chat assistants", "Developer tools"] as const).map((g) => (
            <div key={g} className="mt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">{g}</p>
              <div className="space-y-2">
                {ASSISTANTS.filter((a) => a.group === g).map((a) => {
                  const on = open === a.id;
                  const cmd = "cmd" in a ? a.cmd(link ?? `${base}?key=YOUR_KEY`) : null;
                  return (
                    <div key={a.id} className={`rounded-xl border ${on ? "border-ink" : "border-line"}`}>
                      <button className="flex w-full items-center justify-between px-4 py-3 text-left" aria-expanded={on} onClick={() => setOpen(on ? "" : a.id)}>
                        <span className="font-medium">{a.name}</span>
                        <span className="text-sm text-muted">{on ? "Hide" : "Connect"}</span>
                      </button>
                      {on && (
                        <div className="border-t border-line px-4 py-3 text-sm">
                          <ol className="list-decimal space-y-1 pl-5">
                            {a.steps.map((s) => (
                              <li key={s}>{s}</li>
                            ))}
                          </ol>
                          {cmd && (
                            <div className="mt-2 flex items-start gap-2">
                              <pre className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-ink px-3 py-2 text-xs text-white">{cmd}</pre>
                              <button className={Btn.ghost} onClick={() => void copy(cmd, a.id)}>
                                {copied === a.id ? "Copied" : "Copy"}
                              </button>
                            </div>
                          )}
                          {!link && <p className="mt-2 text-xs text-muted">Make your link in step 1 first.</p>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <p className="mt-5 text-xs text-muted">Reading leads, replies and the pipeline is free. Finding new buyers and looking up emails uses credits, just like in the app. Assistants only approve an email when you tell them to.</p>
        </section>
      </div>
    </div>
  );
}
